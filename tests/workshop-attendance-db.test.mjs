import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { attendanceStats } from "../lib/workshop-attendance.ts";

const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const users = [1, 2, 3, 4].map(
  n => `${n}${"0".repeat(7)}-0000-4000-8000-000000000000`,
);
const workshop = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const other = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const migration =
  "../supabase/migrations/20261112000000_admin_workshop_attendance.sql";

test("admin attendance and participant protections in PostgreSQL", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const path of [
    "./fixtures/participant-schema.sql",
    "../supabase/migrations/20261007090000_participant_onboarding_documents.sql",
    "./fixtures/workshop-attendance-schema.sql",
    "../supabase/migrations/20261010230000_registration_uniqueness.sql",
    "../supabase/migrations/20261011000000_workshop_capacity.sql",
    "../supabase/migrations/20261020000000_workshop_review_fixes.sql",
    migration,
  ]) {
    await db.exec(await readFile(new URL(path, import.meta.url), "utf8"));
  }
  await db.query("insert into public.admin_users (id) values ($1)", [admin]);
  await db.query(
    "insert into public.workshops (id, name, capacity) values ($1, 'QA Attendance Workshop', 4), ($2, 'Other workshop', null)",
    [workshop, other],
  );
  for (const [i, id] of users.entries()) {
    await db.query(
      "insert into public.participants (id, first_name, last_name, email) values ($1, $2, 'Example', $3)",
      [id, ["Alex", "Blair", "Casey", "Drew"][i], `qa-${i}@example.invalid`],
    );
  }
  async function asUser(id, role = "authenticated") {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id,
    ]);
  }
  async function roster(id = workshop) {
    return (
      await db.query("select public.admin_workshop_attendance($1) as result", [
        id,
      ])
    ).rows[0].result;
  }
  async function mark(id, status, expected, target = workshop) {
    return db.query(
      "select public.admin_mark_workshop_attendance($1, $2, $3, $4)",
      [target, id, status, expected],
    );
  }
  const registrations = [];
  await t.test(
    "four participants register through their own database identities",
    async () => {
      for (const id of users) {
        await asUser(id);
        const result = await db.query(
          "insert into public.registrations (participant_id, workshop_id) values ($1, $2) returning id",
          [id, workshop],
        );
        registrations.push(result.rows[0].id);
      }
      await db.query(
        "update public.registrations set attendance_status='cancelled' where id=$1",
        [registrations[3]],
      );
      await asUser(admin);
      assert.deepEqual(attendanceStats(await roster()), {
        registered: 3,
        attended: 0,
        noShow: 0,
        cancelled: 1,
        capacityFilled: 75,
      });
    },
  );
  await t.test(
    "admin marks attended and no-show; persisted stats include cancellation history",
    async () => {
      await mark(registrations[0], "attended", "registered");
      await mark(registrations[1], "no_show", "registered");
      const data = await roster();
      assert.equal(data.registrants.length, 4);
      assert.equal(
        (await db.query("select id from public.registrations")).rows.length,
        4,
      );
      assert.equal(data.registrants[0].first_name, "Alex");
      assert.deepEqual(attendanceStats(data), {
        registered: 3,
        attended: 1,
        noShow: 1,
        cancelled: 1,
        capacityFilled: 75,
      });
      assert.equal(
        (
          await db.query(
            "select public.workshop_registration_count($1) as count",
            [workshop],
          )
        ).rows[0].count,
        3,
      );
    },
  );
  await t.test(
    "admin can correct and clear a mark without freeing capacity",
    async () => {
      await mark(registrations[1], "attended", "no_show");
      assert.equal(attendanceStats(await roster()).attended, 2);
      await mark(registrations[1], "registered", "attended");
      assert.equal(attendanceStats(await roster()).registered, 3);
      await mark(registrations[1], "no_show", "registered");
    },
  );
  await t.test(
    "stale changes, cancelled rows, wrong workshop, and invalid statuses fail atomically",
    async () => {
      await assert.rejects(mark(registrations[0], "no_show", "registered"), {
        code: "P1004",
      });
      await assert.rejects(mark(registrations[3], "attended", "cancelled"), {
        code: "P1004",
      });
      await assert.rejects(
        mark(registrations[0], "attended", "attended", other),
        { code: "P0002" },
      );
      for (const status of ["cancelled", "invalid", null])
        await assert.rejects(mark(registrations[0], status, "attended"), {
          code: "22023",
        });
      assert.equal(attendanceStats(await roster()).attended, 1);
    },
  );
  await t.test(
    "participant cannot call either admin RPC or see someone else's registration/profile",
    async () => {
      await asUser(users[0]);
      await assert.rejects(roster(), { code: "42501" });
      await assert.rejects(mark(registrations[0], "attended", "attended"), {
        code: "42501",
      });
      assert.deepEqual(
        (await db.query("select id from public.registrations")).rows,
        [{ id: registrations[0] }],
      );
      assert.deepEqual(
        (await db.query("select id from public.participants")).rows,
        [{ id: users[0] }],
      );
      assert.equal(
        (
          await db.query(
            "update public.registrations set attendance_status='attended' where id=$1 returning id",
            [registrations[1]],
          )
        ).rows.length,
        0,
      );
    },
  );
  await t.test(
    "direct updates cannot forge, clear, cancel, move, or delete recorded attendance",
    async () => {
      for (const status of ["registered", "no_show", "cancelled", null]) {
        await assert.rejects(
          db.query(
            "update public.registrations set attendance_status=$1 where id=$2",
            [status, registrations[0]],
          ),
          { code: "42501" },
        );
      }
      await assert.rejects(
        db.query("update public.registrations set workshop_id=$1 where id=$2", [
          other,
          registrations[0],
        ]),
        { code: "42501" },
      );
      await assert.rejects(
        db.query(
          "update public.registrations set registration_date='2000-01-01' where id=$1",
          [registrations[0]],
        ),
        { code: "42501" },
      );
      assert.equal(
        (
          await db.query(
            "delete from public.registrations where id=$1 returning id",
            [registrations[0]],
          )
        ).rows.length,
        0,
      );
    },
  );
  await t.test(
    "direct inserts and upserts cannot forge attendance or another identity",
    async () => {
      for (const status of ["attended", "no_show", "cancelled"]) {
        await assert.rejects(
          db.query(
            "insert into public.registrations (participant_id, workshop_id, attendance_status) values ($1,$2,$3)",
            [users[0], other, status],
          ),
          { code: "42501" },
        );
      }
      await assert.rejects(
        db.query(
          "insert into public.registrations (participant_id, workshop_id) values ($1,$2)",
          [users[1], other],
        ),
        { code: "42501" },
      );
      await assert.rejects(
        db.query(
          "insert into public.registrations (id, participant_id, workshop_id) values ($1,$2,$3) on conflict(id) do update set attendance_status=excluded.attendance_status",
          [registrations[0], users[0], workshop],
        ),
        { code: "42501" },
      );
    },
  );
  await t.test(
    "cancelled history is immutable to participants; re-registration creates a fresh row",
    async () => {
      await asUser(users[3]);
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_status='registered' where id=$1",
          [registrations[3]],
        ),
        { code: "42501" },
      );
      await db.query(
        "insert into public.registrations (participant_id, workshop_id) values ($1,$2)",
        [users[3], workshop],
      );
      await asUser(admin);
      assert.deepEqual(attendanceStats(await roster()), {
        registered: 4,
        attended: 1,
        noShow: 1,
        cancelled: 1,
        capacityFilled: 100,
      });
    },
  );
  await t.test(
    "NULL status is unmarked, supports admin marking, and participant cancellation",
    async () => {
      await asUser(users[0]);
      const { rows } = await db.query(
        "insert into public.registrations (participant_id, workshop_id, attendance_status) values ($1,$2,null) returning id",
        [users[0], other],
      );
      await asUser(admin);
      await mark(rows[0].id, "attended", null, other);
      await mark(rows[0].id, "registered", "attended", other);
      await asUser(users[0]);
      await db.query(
        "update public.registrations set attendance_status='cancelled' where id=$1",
        [rows[0].id],
      );
      const { rows: again } = await db.query(
        "insert into public.registrations (participant_id, workshop_id, attendance_status) values ($1,$2,null) returning id",
        [users[0], other],
      );
      await db.query(
        "update public.registrations set attendance_status='cancelled' where id=$1",
        [again[0].id],
      );
    },
  );
  await t.test(
    "anonymous access is blocked even with the old allow-all policy",
    async () => {
      await asUser("", "anon");
      await assert.rejects(roster(), { code: "42501" });
      await assert.rejects(mark(registrations[0], "attended", "attended"), {
        code: "42501",
      });
      assert.equal(
        (await db.query("select * from public.registrations")).rows.length,
        0,
      );
      await assert.rejects(
        db.query(
          "insert into public.registrations (participant_id, workshop_id) values ($1,$2)",
          [users[0], other],
        ),
        { code: "42501" },
      );
    },
  );
  await t.test(
    "a permissive membership policy cannot enable self-promotion",
    async () => {
      await db.exec("reset role");
      await db.exec(
        'create policy "Accidental broad membership policy" on public.admin_users for all to public using (true) with check (true)',
      );
      await asUser(users[0]);
      await assert.rejects(
        db.query("insert into public.admin_users (id) values ($1)", [users[0]]),
        { code: "42501" },
      );
      assert.equal(
        (
          await db.query("update public.admin_users set id=$1 returning id", [
            users[0],
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("delete from public.admin_users returning id")).rows
          .length,
        0,
      );
    },
  );
  await t.test(
    "admin membership is checked on every call and missing workshops return null",
    async () => {
      await asUser(admin);
      assert.equal(await roster("99999999-0000-4000-8000-000000000000"), null);
      await db.exec("reset role");
      await db.query("delete from public.admin_users where id=$1", [admin]);
      await asUser(admin);
      await assert.rejects(roster(), { code: "42501" });
      await assert.rejects(mark(registrations[0], "no_show", "attended"), {
        code: "42501",
      });
      await db.exec("reset role");
      await db.query("insert into public.admin_users (id) values ($1)", [
        admin,
      ]);
    },
  );
  await t.test(
    "large rosters are complete beyond the API's default 1000-row cap",
    async () => {
      await db.exec(
        "insert into public.participants (id, first_name, last_name, email) select md5(i::text)::uuid, 'Large', i::text, 'qa@example.invalid' from generate_series(1,1005) i",
      );
      await db.query(
        "insert into public.registrations (participant_id, workshop_id) select md5(i::text)::uuid, $1 from generate_series(1,1005) i",
        [other],
      );
      await asUser(admin);
      const data = await roster(other);
      assert.equal(data.registrants.length, 1007);
      assert.equal(attendanceStats(data).registered, 1005);
      assert.equal(attendanceStats(data).capacityFilled, null);
    },
  );
});
