import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { calculateAttendance } from "../lib/zoom-attendance.ts";
import { fetchZoomReport } from "../lib/zoom-report.ts";

const workshop = "10000000-0000-4000-8000-000000000001";
const otherWorkshop = "10000000-0000-4000-8000-000000000002";
const person = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const registration = "30000000-0000-4000-8000-000000000001";
const otherRegistration = "30000000-0000-4000-8000-000000000002";
const input = (email = "test@example.com", minutes = 2.5) => [
  { email, attendance_duration_minutes: minutes },
];

test("attendance migration and import against PostgreSQL", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  // Minimal pre-existing schema, verified against VTS on 2026-10-14.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create type public.attendance_status as enum ('registered', 'cancelled');
    create table public.workshops (id uuid primary key, name text not null);
    create table public.participants (id uuid primary key, email varchar not null);
    create table public.registrations (
      id uuid primary key, participant_id uuid not null references public.participants,
      workshop_id uuid not null references public.workshops,
      registration_date date not null default current_date,
      attendance_status public.attendance_status not null default 'registered'
    );
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    insert into public.workshops values ('${workshop}', 'Attendance test'), ('${otherWorkshop}', 'Other workshop');
    insert into public.participants values ('${person}', ' Test@Example.com '), ('${other}', 'other@example.com');
    insert into public.registrations (id, participant_id, workshop_id) values
      ('${registration}', '${person}', '${workshop}'), ('${otherRegistration}', '${person}', '${otherWorkshop}');
  `);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261015010000_zoom_attendance.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const sync = async (
    rows,
    apply = false,
    meeting = "instance-uuid",
    workshopId = workshop,
  ) => {
    const result = await db.query(
      "select public.sync_zoom_attendance($1, $2, $3::jsonb, $4) as result",
      [workshopId, meeting, JSON.stringify(rows), apply],
    );
    return result.rows[0].result;
  };
  const stored = async () =>
    (await db.query("select * from public.registrations order by id")).rows;

  await t.test(
    "preview matches only the selected workshop without changing data",
    async () => {
      await db.exec("set role service_role");
      const result = await sync(input());
      assert.equal(result.matched[0].registration_id, registration);
      assert.equal(result.workshop_name, "Attendance test");
      assert.ok(
        (await stored()).every(row => row.attendance_duration_minutes === null),
      );
    },
  );

  await t.test(
    "API-shaped report through calculation and SQL stores the correct registration and minutes",
    async () => {
      const payloads = [
        { access_token: "test-token" },
        {
          total_records: 3,
          next_page_token: "",
          participants: [
            {
              user_email: "test@example.com",
              join_time: "2026-10-14T10:00:00Z",
              leave_time: "2026-10-14T10:01:30Z",
            },
            {
              user_email: "TEST@example.com",
              join_time: "2026-10-14T10:02:00Z",
              leave_time: "2026-10-14T10:03:00Z",
            },
            {
              user_email: "unknown@example.com",
              join_time: "2026-10-14T10:00:00Z",
              leave_time: "2026-10-14T10:04:00Z",
            },
          ],
        },
      ];
      const report = await fetchZoomReport(
        { accountId: "account", clientId: "client", clientSecret: "secret" },
        "instance-uuid",
        async () => Response.json(payloads.shift()),
      );
      const result = await sync(calculateAttendance(report).totals, true);
      assert.deepEqual(result.unregistered_emails, ["unknown@example.com"]);
      const rows = await stored();
      assert.equal(Number(rows[0].attendance_duration_minutes), 2.5);
      assert.equal(rows[0].attendance_zoom_meeting_uuid, "instance-uuid");
      assert.ok(rows[0].attendance_synced_at);
      assert.equal(rows[0].attendance_status, "registered");
      assert.equal(rows[1].attendance_duration_minutes, null);
    },
  );

  await t.test(
    "repeat imports replace totals and reject a different meeting instance",
    async () => {
      await sync(input(), true);
      assert.equal(
        Number((await stored())[0].attendance_duration_minutes),
        2.5,
      );
      await sync(input("test@example.com", 3.75), true);
      assert.equal(
        Number((await stored())[0].attendance_duration_minutes),
        3.75,
      );
      await assert.rejects(
        sync(input(), true, "different-instance"),
        /another Zoom meeting/,
      );
      assert.equal(
        Number((await stored())[0].attendance_duration_minutes),
        3.75,
      );
    },
  );

  await t.test(
    "unregistered and cancelled attendees never create or update a registration",
    async () => {
      await db.query(
        "update public.registrations set attendance_status = 'cancelled' where id = $1",
        [registration],
      );
      const result = await sync(input(), true);
      assert.equal(result.matched.length, 0);
      assert.deepEqual(result.unregistered_emails, ["test@example.com"]);
      assert.equal((await stored()).length, 2);
      assert.equal(
        Number((await stored())[0].attendance_duration_minutes),
        3.75,
      );
      await db.query(
        "update public.registrations set attendance_status = 'registered' where id = $1",
        [registration],
      );
    },
  );

  await t.test(
    "duplicate matching registrations are flagged instead of guessing",
    async () => {
      const duplicate = "30000000-0000-4000-8000-000000000003";
      await db.query(
        "update public.participants set email = 'test@example.com' where id = $1",
        [other],
      );
      await db.query(
        "insert into public.registrations (id, participant_id, workshop_id) values ($1, $2, $3)",
        [duplicate, other, workshop],
      );
      const result = await sync(input(), true);
      assert.equal(result.matched.length, 0);
      assert.deepEqual(result.ambiguous_emails, ["test@example.com"]);
      assert.equal(
        Number((await stored())[0].attendance_duration_minutes),
        3.75,
      );
      await db.query("delete from public.registrations where id = $1", [
        duplicate,
      ]);
    },
  );

  await t.test(
    "invalid later rows roll back earlier writes in the same import",
    async () => {
      await assert.rejects(
        sync(
          [...input("test@example.com", 99), ...input("other@example.com", -1)],
          true,
        ),
        /outside the supported range/,
      );
      assert.equal(
        Number((await stored())[0].attendance_duration_minutes),
        3.75,
      );
      await assert.rejects(
        sync([...input(), ...input(" TEST@example.com ")], true),
        /one duration per email/,
      );
      await assert.rejects(
        sync([{ email: "", attendance_duration_minutes: 2 }]),
        /email and a numeric/,
      );
      await assert.rejects(sync(input(), true, "123456789"), /instance UUID/);
      await assert.rejects(
        sync(
          input(),
          true,
          "instance-uuid",
          "10000000-0000-4000-8000-000000000099",
        ),
        /Workshop not found/,
      );
    },
  );

  await t.test(
    "browser roles cannot call the import or forge, change, or transfer attendance",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(sync(input(), false), /permission denied/);
        await assert.rejects(
          db.query(
            "update public.registrations set attendance_duration_minutes = 100 where id = $1",
            [registration],
          ),
          /Attendance can only/,
        );
        await assert.rejects(
          db.query(
            "update public.registrations set participant_id = $1 where id = $2",
            [other, registration],
          ),
          /Attendance can only/,
        );
        await assert.rejects(
          db.query(
            "insert into public.registrations (id, participant_id, workshop_id, attendance_duration_minutes) values (gen_random_uuid(), $1, $2, 1)",
            [person, workshop],
          ),
          /Attendance can only/,
        );
        // Unrelated registration updates still work under the existing policies.
        await db.query(
          "update public.registrations set registration_date = current_date where id = $1",
          [registration],
        );
      }
      await db.exec("reset role");
    },
  );

  await t.test(
    "database rejects negative, NaN, or incomplete attendance provenance",
    async () => {
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_duration_minutes = -1 where id = $1",
          [registration],
        ),
        /check constraint/,
      );
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_duration_minutes = 'NaN' where id = $1",
          [registration],
        ),
        /check constraint/,
      );
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_synced_at = null where id = $1",
          [registration],
        ),
        /check constraint/,
      );
    },
  );
});
