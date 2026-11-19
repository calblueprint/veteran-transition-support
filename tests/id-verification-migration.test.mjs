import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";

test("ID review workflow and authorization execute in PostgreSQL", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    await readFile(
      new URL("./fixtures/participant-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  // Existing tables predate the repository migrations. Use their existing status vocabulary.
  await db.exec(`
    create table public.admin_users (id uuid primary key);
    insert into public.admin_users values ('${admin}');
    grant all on public.admin_users to anon, authenticated;
    create policy "Legacy broad admin policy" on public.admin_users for all using (true) with check (true);
    create type public.id_verification_status as enum ('pending', 'manual_review', 'verified', 'failed');
    create table public.id_verifications (
      id uuid primary key default gen_random_uuid(),
      participant_id uuid not null references public.participants(id),
      verification_status public.id_verification_status not null default 'pending',
      document_type text not null,
      document_image_url text not null,
      created_at timestamptz not null default clock_timestamp()
    );
    grant all on public.id_verifications to anon, authenticated;
    create policy "Legacy broad ID policy" on public.id_verifications for all using (true) with check (true);
  `);
  for (const migration of [
    "20261007090000_participant_onboarding_documents",
    "20261017000000_id_verification_uploads",
    "20261119000000_admin_id_verification_review",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  }
  async function asUser(id, role = "authenticated") {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id,
    ]);
  }
  async function profile(id) {
    await asUser(id);
    await db.query(
      "insert into participants (id, first_name, last_name, email, phone_number, affiliation) values ($1, 'Test', 'Participant', 'test@example.com', '4155550123', 'veteran')",
      [id],
    );
  }
  async function upload(id, filename = "test-id.png") {
    const path = `${id}/id-verification/${filename}`;
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('participant-documents', $1)",
      [path],
    );
    return path;
  }
  async function submit(id, path) {
    return (
      await db.query(
        "insert into id_verifications (participant_id, document_type, document_image_url) values ($1, 'military_id', $2) returning id",
        [id, path],
      )
    ).rows[0].id;
  }
  async function review(id, decision, reason = null) {
    return db.query("select public.review_id_verification($1, $2, $3)", [
      id,
      decision,
      reason,
    ]);
  }
  async function queue() {
    return (await db.query("select public.pending_id_verifications() as queue"))
      .rows[0].queue;
  }
  let approvedId, rejectedId, alicePath;
  await t.test(
    "participants upload photos and submit pending IDs; duplicate and forged requests fail",
    async () => {
      await profile(alice);
      alicePath = await upload(alice);
      approvedId = await submit(alice, alicePath);
      await assert.rejects(submit(alice, alicePath), { code: "23514" });
      await profile(bob);
      const path = await upload(bob);
      await assert.rejects(submit(bob, alicePath), { code: "42501" });
      await assert.rejects(submit(bob, `${bob}/id-verification/missing.png`), {
        code: "42501",
      });
      await assert.rejects(
        db.query(
          "insert into id_verifications (participant_id, document_type, document_image_url, verification_status, reviewed_by) values ($1, 'military_id', $2, 'verified', $3)",
          [bob, path, admin],
        ),
        { code: "42501" },
      );
      rejectedId = await submit(bob, path);
    },
  );
  await t.test(
    "non-admin cannot review, list the queue, read someone else's photo, or self-enroll as admin",
    async () => {
      await asUser(bob);
      await assert.rejects(review(approvedId, "approve"), { code: "42501" });
      await assert.rejects(queue(), { code: "42501" });
      assert.equal(
        (
          await db.query("select * from storage.objects where name = $1", [
            alicePath,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query("select * from id_verifications where id = $1", [
            approvedId,
          ])
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query("insert into admin_users (id) values ($1)", [bob]),
        { code: "42501" },
      );
      assert.equal(
        (await db.query("update admin_users set id = $1 returning id", [bob]))
          .rows.length,
        0,
      );
      assert.equal(
        (await db.query("delete from admin_users returning id")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update id_verifications set verification_status = 'verified', reviewed_by = $1 returning id",
            [admin],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query(
          "update participants set verification_status = true where id = $1",
          [bob],
        ),
        { code: "42501" },
      );
      assert.equal(
        (await db.query("delete from id_verifications returning id")).rows
          .length,
        0,
      );
    },
  );
  await t.test(
    "admin can read ID photos and minimal queue details without accessing other documents or writing photos",
    async () => {
      await asUser(alice);
      await db.query(
        "insert into storage.objects (bucket_id, name) values ('participant-documents', $1)",
        [`${alice}/resumes/private.pdf`],
      );
      await asUser(admin);
      const items = await queue();
      assert.deepEqual(
        items.map(item => item.id),
        [approvedId, rejectedId],
      );
      assert.equal(items[0].first_name, "Test");
      assert.equal(items[0].affiliation, "veteran");
      assert.ok(items[0].created_at);
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        2,
      );
      assert.equal(
        (await db.query("select * from participants")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update storage.objects set name = 'changed' returning id",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("delete from storage.objects returning id")).rows
          .length,
        0,
      );
      await assert.rejects(upload(alice, "admin-overwrite.png"), {
        code: "42501",
      });
      // Merely viewing/skipping has no database side effect.
      assert.equal((await queue()).length, 2);
    },
  );
  await t.test(
    "approve records the reviewer and verifies the participant atomically; repeated reviews fail",
    async () => {
      await review(approvedId, "approve");
      assert.deepEqual(
        (await queue()).map(item => item.id),
        [rejectedId],
      );
      await assert.rejects(review(approvedId, "reject", "Too late"), {
        code: "23514",
      });
      await asUser(alice);
      const row = (await db.query("select * from id_verifications")).rows[0];
      assert.equal(row.verification_status, "verified");
      assert.equal(row.reviewed_by, admin);
      assert.ok(row.reviewed_at);
      assert.equal(row.rejection_reason, null);
      assert.equal(
        (await db.query("select verification_status from participants")).rows[0]
          .verification_status,
        true,
      );
      await assert.rejects(submit(alice, alicePath), { code: "23514" });
      await assert.rejects(
        db.query(
          "update participants set verification_status = false where id = $1",
          [alice],
        ),
        { code: "42501" },
      );
    },
  );
  await t.test(
    "reject requires a reason, preserves unverified status, and allows a new pending submission",
    async () => {
      await asUser(admin);
      for (const reason of [null, "", "   ", "\n\t", "a".repeat(2001)]) {
        await assert.rejects(review(rejectedId, "reject", reason), {
          code: "22023",
        });
      }
      await assert.rejects(review(rejectedId, "skip"), { code: "22023" });
      await assert.rejects(review(rejectedId, null), { code: "22023" });
      await assert.rejects(
        review("44444444-4444-4444-8444-444444444444", "approve"),
        { code: "P0002" },
      );
      await review(rejectedId, "reject", "  Photo is unreadable.  ");
      assert.equal((await queue()).length, 0);
      await asUser(bob);
      const rejected = (await db.query("select * from id_verifications"))
        .rows[0];
      assert.equal(rejected.verification_status, "failed");
      assert.equal(rejected.rejection_reason, "Photo is unreadable.");
      assert.equal(rejected.reviewed_by, admin);
      assert.ok(rejected.reviewed_at);
      assert.equal(
        (await db.query("select verification_status from participants")).rows[0]
          .verification_status,
        false,
      );
      const nextId = await submit(bob, await upload(bob, "resubmission.png"));
      const latest = (
        await db.query(
          "select * from id_verifications order by created_at desc limit 1",
        )
      ).rows[0];
      assert.equal(latest.id, nextId);
      assert.equal(latest.verification_status, "pending");
      assert.equal(latest.rejection_reason, null);
      await asUser(admin);
      assert.deepEqual(
        (await queue()).map(item => item.id),
        [nextId],
      );
    },
  );
  await t.test(
    "anonymous clients cannot execute review/queue functions or read private photos",
    async () => {
      await asUser("", "anon");
      await assert.rejects(review(rejectedId, "approve"), { code: "42501" });
      await assert.rejects(queue(), { code: "42501" });
      assert.equal(
        (
          await db.query(
            "select * from storage.objects where bucket_id = 'participant-documents'",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from id_verifications")).rows.length,
        0,
      );
    },
  );
});
