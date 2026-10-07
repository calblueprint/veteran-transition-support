import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const noProfile = "33333333-3333-4333-8333-333333333333";

test("onboarding migration enforces ownership and verification in PostgreSQL", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    await readFile(
      new URL("./fixtures/participant-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261007090000_participant_onboarding_documents.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  async function asUser(id) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id,
    ]);
  }
  async function insertProfile(id, verified = false) {
    return db.query(
      "insert into public.participants (id, first_name, last_name, email, phone_number, affiliation, verification_status) values ($1, 'Test', 'Participant', 'test@example.com', '4155550123', 'veteran', $2) returning *",
      [id, verified],
    );
  }

  await t.test(
    "legacy rows survive and start unverified; bucket is private and limited",
    async () => {
      const { rows } = await db.query(
        "select verification_status from public.participants",
      );
      assert.deepEqual(rows, [{ verification_status: false }]);
      const { rows: buckets } = await db.query(
        "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'participant-documents'",
      );
      assert.equal(buckets[0].public, false);
      assert.equal(Number(buckets[0].file_size_limit), 6 * 1024 * 1024);
      assert.ok(buckets[0].allowed_mime_types.includes("application/pdf"));
      assert.ok(!buckets[0].allowed_mime_types.includes("text/html"));
    },
  );

  await t.test(
    "participants can create only their own unverified profile",
    async () => {
      await asUser(userA);
      await assert.rejects(insertProfile(userB), { code: "42501" });
      await assert.rejects(insertProfile(userA, true), { code: "42501" });
      const { rows } = await insertProfile(userA);
      assert.equal(rows[0].id, userA);
      assert.equal(rows[0].verification_status, false);
      await assert.rejects(insertProfile(userA), { code: "23505" });
      await asUser(userB);
      await insertProfile(userB);
    },
  );

  await t.test(
    "broad development policies cannot expose another profile or allow edits",
    async () => {
      await asUser(userA);
      assert.deepEqual(
        (await db.query("select id from public.participants")).rows,
        [{ id: userA }],
      );
      assert.equal(
        (
          await db.query(
            "update public.participants set first_name = 'Changed' where id = $1 returning id",
            [userB],
          )
        ).rows.length,
        0,
      );
      await db.query(
        "update public.participants set education_history = 'Training', employment_history = 'Manual entry', secondary_email = 'coursera@example.com' where id = $1",
        [userA],
      );
      assert.equal(
        (await db.query("select education_history from public.participants"))
          .rows[0].education_history,
        "Training",
      );
      await assert.rejects(
        db.query(
          "update public.participants set verification_status = true where id = $1",
          [userA],
        ),
        { code: "42501" },
      );
      await assert.rejects(
        db.query("update public.participants set id = $1 where id = $2", [
          noProfile,
          userA,
        ]),
        { code: "42501" },
      );
    },
  );

  await t.test(
    "anonymous clients cannot read, insert, or update participant data",
    async () => {
      await db.exec("set role anon");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      assert.equal(
        (await db.query("select id from public.participants")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update public.participants set first_name = 'Changed' returning id",
          )
        ).rows.length,
        0,
      );
      await assert.rejects(insertProfile(noProfile), { code: "42501" });
    },
  );

  await t.test(
    "trusted verification persists through edits but cannot be changed by a participant",
    async () => {
      await db.exec("reset role");
      await db.query(
        "update public.participants set verification_status = true where id = $1",
        [userA],
      );
      await asUser(userA);
      await db.query(
        "update public.participants set rank = 'Sergeant' where id = $1",
        [userA],
      );
      assert.equal(
        (await db.query("select verification_status from public.participants"))
          .rows[0].verification_status,
        true,
      );
      await assert.rejects(
        db.query(
          "update public.participants set verification_status = false where id = $1",
          [userA],
        ),
        { code: "42501" },
      );
    },
  );

  await t.test(
    "own uploads are visible; other accounts cannot read, insert, replace, or delete them",
    async () => {
      await asUser(userA);
      await db.query(
        "insert into storage.objects (bucket_id, name) values ('participant-documents', $1)",
        [`${userA}/resumes/resume.pdf`],
      );
      await db.query(
        "insert into storage.objects (bucket_id, name) values ('participant-documents', $1)",
        [`${userA}/documents/document.png`],
      );
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        2,
      );
      await asUser(userB);
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        0,
      );
      await assert.rejects(
        db.query(
          "insert into storage.objects (bucket_id, name) values ('participant-documents', $1)",
          [`${userA}/resumes/attack.pdf`],
        ),
        { code: "42501" },
      );
      assert.equal(
        (
          await db.query(
            "update storage.objects set name = 'stolen' returning id",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("delete from storage.objects returning id")).rows
          .length,
        0,
      );
      await assert.rejects(
        db.query(
          "insert into storage.objects (bucket_id, name) values ('participant-documents', $1)",
          [`${userB}/unexpected/file.pdf`],
        ),
        { code: "42501" },
      );
    },
  );

  await t.test(
    "uploads require onboarding and unrelated buckets retain existing behavior",
    async () => {
      await asUser(noProfile);
      await assert.rejects(
        db.query(
          "insert into storage.objects (bucket_id, name) values ('participant-documents', $1)",
          [`${noProfile}/resumes/resume.pdf`],
        ),
        { code: "42501" },
      );
      await db.query(
        "insert into storage.objects (bucket_id, name) values ('unrelated', 'existing-feature.txt')",
      );
      assert.equal(
        (await db.query("select name from storage.objects")).rows[0].name,
        "existing-feature.txt",
      );
      await db.exec("set role anon");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      assert.equal(
        (
          await db.query(
            "select * from storage.objects where bucket_id = 'participant-documents'",
          )
        ).rows.length,
        0,
      );
    },
  );
});
