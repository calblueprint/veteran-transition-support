import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { jobAdminAccess } from "../lib/job-admin-access.ts";

test("jobs admin routes and writes use the same PostgreSQL membership check", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = "11111111-1111-4111-8111-111111111111";
  const participant = "22222222-2222-4222-8222-222222222222";
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select current_setting('request.jwt.claim.sub')::uuid;
    $$;
    alter default privileges grant all on tables to anon, authenticated;
  `);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261107000000_jobs.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query("insert into auth.users values ($1), ($2)", [
    admin,
    participant,
  ]);
  await db.query("insert into public.admin_users values ($1)", [admin]);
  await db.exec("set role authenticated");
  const signIn = id =>
    db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  const membership = async () => ({
    data: (await db.query("select public.can_manage_jobs() as admin")).rows[0]
      .admin,
    error: null,
  });
  const create = () =>
    db.query(
      "insert into jobs (title, company, location, description, apply_link) values ('Instructor','Example','Remote','Teach skills','https://example.com/apply') returning id",
    );
  await signIn(admin);
  assert.deepEqual(await jobAdminAccess(admin, membership), { admin });
  const {
    rows: [{ id }],
  } = await create();
  assert.deepEqual(
    (
      await db.query(
        "update jobs set title='Lead Instructor' where id=$1 returning title",
        [id],
      )
    ).rows,
    [{ title: "Lead Instructor" }],
  );

  await signIn(participant);
  assert.deepEqual(await jobAdminAccess(participant, membership), {
    redirect: "/profile",
  });
  await assert.rejects(create(), { code: "42501" });
  assert.deepEqual(
    (await db.query("update jobs set title='Unauthorized' returning id")).rows,
    [],
  );
  assert.deepEqual((await db.query("delete from jobs returning id")).rows, []);
  await assert.rejects(
    db.query("insert into admin_users values ($1)", [participant]),
    { code: "42501" },
  );
  await assert.rejects(db.exec("truncate jobs"), { code: "42501" });
  assert.deepEqual((await db.query("select title from jobs")).rows, [
    { title: "Lead Instructor" },
  ]);

  await signIn(admin);
  assert.deepEqual(
    (await db.query("delete from jobs where id=$1 returning id", [id])).rows,
    [{ id }],
  );
  assert.deepEqual((await db.query("select * from jobs")).rows, []);
  await db.exec("set role anon");
  assert.deepEqual(await jobAdminAccess(undefined, membership), {
    redirect: "/login",
  });
  await assert.rejects(create(), { code: "42501" });
});
