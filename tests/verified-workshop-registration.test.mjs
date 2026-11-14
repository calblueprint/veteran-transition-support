import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { workshopErrorMessage } from "../lib/workshop-errors.ts";
import { isPastWorkshop } from "../lib/workshop-registration.ts";

const unverified = "11111111-1111-4111-8111-111111111111";
const verified = "22222222-2222-4222-8222-222222222222";
const anotherVerified = "33333333-3333-4333-8333-333333333333";
const workshop = "44444444-4444-4444-8444-444444444444";

const fixture = `
create role anon;
create role authenticated;
create schema auth;
grant usage on schema public, auth to authenticated, anon;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.participants (
  id uuid primary key,
  verification_status boolean not null default false
);
create table public.workshops (
  id uuid primary key,
  capacity integer
);
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id),
  workshop_id uuid not null references public.workshops(id),
  attendance_status text,
  registration_date timestamptz not null default now()
);
alter table public.registrations enable row level security;
-- Deliberately broad legacy permissions: the trigger must protect direct calls.
create policy "Legacy permissive" on public.registrations
  for all to public using (true) with check (true);
grant all on public.participants, public.workshops, public.registrations
  to authenticated, anon;
`;

async function createDatabase() {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    for (const path of [
      "20261010230000_registration_uniqueness.sql",
      "20261011000000_workshop_capacity.sql",
      "20261020000000_workshop_review_fixes.sql",
      "20261113000000_verified_workshop_registrations.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${path}`, import.meta.url),
          "utf8",
        ),
      );
    }
    await db.query(
      "insert into public.participants (id,verification_status) values ($1,false),($2,true),($3,true)",
      [unverified, verified, anotherVerified],
    );
    await db.query("insert into public.workshops (id,capacity) values ($1,1)", [
      workshop,
    ]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function asUser(db, userId) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    userId,
  ]);
}

async function registration(db, participantId) {
  return db.query(
    "insert into public.registrations (participant_id, workshop_id) values ($1, $2) returning id",
    [participantId, workshop],
  );
}

async function count(db) {
  await db.exec("reset role");
  return Number(
    (
      await db.query(
        "select public.workshop_registration_count($1) as occupied",
        [workshop],
      )
    ).rows[0].occupied,
  );
}

test("verified-only database guard and cancellation preserve capacity", async t => {
  const db = await createDatabase();
  t.after(() => db.close());

  await t.test(
    "direct authenticated API inserts from an unverified participant fail",
    async () => {
      await asUser(db, unverified);
      await assert.rejects(registration(db, unverified), { code: "P1004" });
      assert.equal(await count(db), 0);
    },
  );

  await t.test(
    "even privileged direct inserts cannot bypass the verification trigger",
    async () => {
      await db.exec("reset role");
      await assert.rejects(registration(db, unverified), { code: "P1004" });
      assert.equal(await count(db), 0);
    },
  );

  await t.test(
    "unverified callers cannot register using a verified user's ID",
    async () => {
      await asUser(db, unverified);
      await assert.rejects(registration(db, verified), { code: "42501" });
      assert.equal(await count(db), 0);
    },
  );

  let registeredId;
  await t.test(
    "a verified participant registers and consumes exactly one spot",
    async () => {
      await asUser(db, verified);
      const result = await registration(db, verified);
      registeredId = result.rows[0].id;
      assert.ok(registeredId);
      assert.equal(await count(db), 1);
    },
  );

  await t.test(
    "capacity still rejects another verified participant",
    async () => {
      await asUser(db, anotherVerified);
      await assert.rejects(registration(db, anotherVerified), {
        code: "P1001",
      });
      assert.equal(await count(db), 1);
    },
  );

  await t.test(
    "another participant cannot cancel or alter someone else's registration",
    async () => {
      await asUser(db, unverified);
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_status='cancelled' where id=$1",
          [registeredId],
        ),
        { code: "42501" },
      );
      assert.equal(await count(db), 1);
    },
  );

  await t.test(
    "an owner cannot hijack a row or change its status to attended",
    async () => {
      await asUser(db, verified);
      await assert.rejects(
        db.query("update public.registrations set workshop_id=$1 where id=$2", [
          workshop,
          registeredId,
        ]),
        { code: "42501" },
      );
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_status='attended' where id=$1",
          [registeredId],
        ),
        { code: "42501" },
      );
    },
  );

  await t.test(
    "the verified owner cancels, preserving history and freeing the spot",
    async () => {
      await asUser(db, verified);
      const result = await db.query(
        "update public.registrations set attendance_status='cancelled' where id=$1 returning id, attendance_status",
        [registeredId],
      );
      assert.deepEqual(result.rows, [
        { id: registeredId, attendance_status: "cancelled" },
      ]);
      assert.equal(await count(db), 0);
    },
  );

  await t.test(
    "cancelled rows cannot be changed by a browser again",
    async () => {
      await asUser(db, verified);
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_status=null where id=$1",
          [registeredId],
        ),
        { code: "42501" },
      );
    },
  );

  await t.test(
    "after a cancellation another verified user can take the freed spot",
    async () => {
      await asUser(db, anotherVerified);
      const result = await registration(db, anotherVerified);
      assert.ok(result.rows[0].id);
      assert.equal(await count(db), 1);
    },
  );

  await t.test(
    "unverified accounts cannot reactivate a cancelled legacy registration",
    async () => {
      await db.exec("reset role");
      // A legacy registration is represented by a pre-existing cancelled record.
      const inserted = await db.query(
        "insert into public.registrations (participant_id,workshop_id,attendance_status) values ($1,$2,'cancelled') returning id",
        [verified, workshop],
      );
      // Trusted migration operation changes the owner to an unverified account.
      await db.query(
        "update public.registrations set participant_id=$1 where id=$2",
        [unverified, inserted.rows[0].id],
      );
      await assert.rejects(
        db.query(
          "update public.registrations set attendance_status=null where id=$1",
          [inserted.rows[0].id],
        ),
        { code: "P1004" },
      );
    },
  );
});

test("error mapping clearly identifies unverified participants", () => {
  assert.equal(
    workshopErrorMessage(
      { code: "P1004", message: "private SQL error" },
      "retry",
    ),
    "Your profile must be verified before you can register for workshops.",
  );
});

test("workshop date classification handles date-only values and missing dates", () => {
  const now = new Date(2026, 10, 13, 14, 30);
  assert.equal(
    isPastWorkshop({ start_date: "2026-11-13", end_date: null }, now),
    false,
  );
  assert.equal(
    isPastWorkshop({ start_date: "2026-11-12", end_date: null }, now),
    true,
  );
  assert.equal(
    isPastWorkshop({ start_date: "2026-11-12", end_date: "2026-11-14" }, now),
    false,
  );
  assert.equal(
    isPastWorkshop({ start_date: null, end_date: null }, now),
    false,
  );
  assert.equal(
    isPastWorkshop({ start_date: "2026-11-12T12:00:00Z", end_date: null }, now),
    true,
  );
});

test("pages require verified status, show cancellation and all feedback states", async () => {
  const detail = await readFile(
    new URL("../app/(participant)/workshops/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const mine = await readFile(
    new URL("../app/(participant)/my-workshops/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(detail, /eligibility === "unverified"/);
  assert.match(detail, /href="\/profile"/);
  assert.match(detail, /registrationError/);
  assert.match(mine, /section\("Upcoming"/);
  assert.match(mine, /section\("Past"/);
  assert.match(mine, /cancelWorkshopRegistration/);
  assert.match(mine, /role="status"/);
  assert.match(mine, /role="alert"/);
  assert.match(mine, /Try again/);
});
