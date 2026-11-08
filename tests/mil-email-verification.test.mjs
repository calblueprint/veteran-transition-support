import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmMilitaryVerification,
  hashVerificationToken,
  normalizeMilitaryEmail,
  requestMilitaryVerification,
} from "../lib/mil-verification/flow.ts";

const participantId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const token = Buffer.alloc(32, 15).toString("base64url");
const anotherToken = Buffer.alloc(32, 28).toString("base64url");
const origin = "http://localhost:3000";

function stub(overrides = {}) {
  const calls = { issue: [], send: [], consume: [] };
  const backend = {
    async issue(...args) {
      calls.issue.push(args);
      return "issued";
    },
    async send(...args) {
      calls.send.push(args);
    },
    async consume(...args) {
      calls.consume.push(args);
      return "verified";
    },
    ...overrides,
  };
  return { calls, backend };
}

test(".mil email validation is case-insensitive and accepts military subdomains", () => {
  assert.equal(
    normalizeMilitaryEmail("  Jane.Doe@US.ARMY.MIL  "),
    "jane.doe@us.army.mil",
  );
  assert.equal(normalizeMilitaryEmail("name@navy.mil"), "name@navy.mil");
});

test("non-.mil, lookalike and malformed addresses are blocked before a DB call", async () => {
  for (const email of [
    "jane@gmail.com",
    "jane@army.mil.evil.com",
    "jane@fake-mil.com",
    "jane@mil",
    "jane@.mil",
    "jane@army.mil@example.com",
    "jane@-army.mil",
    "jane@army.mil/abc",
    "  ",
    null,
    42,
  ]) {
    const { calls, backend } = stub();
    assert.equal(normalizeMilitaryEmail(email), null);
    assert.deepEqual(
      await requestMilitaryVerification(participantId, email, origin, backend),
      { ok: false, code: "invalid_email" },
    );
    assert.equal(calls.issue.length, 0);
    assert.equal(calls.send.length, 0);
  }
});

test("request creates strong token hash, and sends raw token only inside URL fragment", async () => {
  const { calls, backend } = stub();
  assert.deepEqual(
    await requestMilitaryVerification(
      participantId,
      "TEST@Army.mil",
      origin,
      backend,
      () => token,
    ),
    { ok: true, code: "sent" },
  );
  const digest = hashVerificationToken(token);
  assert.equal(digest.length, 64);
  assert.deepEqual(calls.issue, [[participantId, "test@army.mil", digest]]);
  assert.equal(calls.send.length, 1);
  const [email, link, idempotencyKey] = calls.send[0];
  assert.equal(email, "test@army.mil");
  assert.equal(idempotencyKey, digest);
  const url = new URL(link);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, "/verify");
  assert.equal(url.search, "");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), token);
  assert.ok(!JSON.stringify(calls.issue).includes(token));
});

for (const code of [
  "cooldown",
  "rate_limited",
  "already_verified",
  "profile_missing",
]) {
  test(`request ${code} prevents email sending`, async () => {
    const { calls, backend } = stub({
      async issue() {
        return code;
      },
    });
    const result = await requestMilitaryVerification(
      participantId,
      "a@army.mil",
      origin,
      backend,
      () => token,
    );
    assert.deepEqual(result, { ok: false, code });
    assert.equal(calls.send.length, 0);
  });
}

test("database and email provider failures return typed errors without details", async () => {
  const error = new Error("secret connection string");
  const a = stub({
    async issue() {
      throw error;
    },
  });
  const b = stub({
    async send() {
      throw error;
    },
  });
  assert.deepEqual(
    await requestMilitaryVerification(
      participantId,
      "a@navy.mil",
      origin,
      a.backend,
      () => token,
    ),
    {
      ok: false,
      code: "unavailable",
    },
  );
  assert.deepEqual(
    await requestMilitaryVerification(
      participantId,
      "a@navy.mil",
      origin,
      b.backend,
      () => token,
    ),
    {
      ok: false,
      code: "delivery_failed",
    },
  );
});

test("malformed token is rejected without touching the database", async () => {
  for (const candidate of [
    "",
    "token",
    "x".repeat(9000),
    null,
    42,
    "p".repeat(44),
  ]) {
    const { calls, backend } = stub();
    assert.deepEqual(
      await confirmMilitaryVerification(participantId, candidate, backend),
      {
        ok: false,
        code: "invalid_link",
      },
    );
    assert.equal(calls.consume.length, 0);
  }
});

test("confirmation passes only the participant id and token hash", async () => {
  const { calls, backend } = stub();
  assert.deepEqual(
    await confirmMilitaryVerification(participantId, token, backend),
    {
      ok: true,
      code: "verified",
    },
  );
  assert.deepEqual(calls.consume, [
    [participantId, hashVerificationToken(token)],
  ]);
});

test("single-use, wrong-account, replaced and expired links fail closed", async () => {
  const now = Date.now();
  const rows = new Map();
  const backend = {
    async issue(id, _email, hash) {
      rows.set(id, { hash, expiresAt: now + 15 * 60_000, consumed: false });
      return "issued";
    },
    async send() {},
    async consume(id, hash) {
      const row = rows.get(id);
      if (!row || row.hash !== hash) return "invalid_link";
      if (row.consumed) return "used_link";
      if (row.expiresAt <= now) return "expired_link";
      row.consumed = true;
      return "verified";
    },
  };
  assert.deepEqual(
    await requestMilitaryVerification(
      participantId,
      "a@navy.mil",
      origin,
      backend,
      () => token,
    ),
    { ok: true, code: "sent" },
  );
  assert.deepEqual(await confirmMilitaryVerification(otherId, token, backend), {
    ok: false,
    code: "invalid_link",
  });
  assert.deepEqual(
    await confirmMilitaryVerification(participantId, token, backend),
    { ok: true, code: "verified" },
  );
  assert.deepEqual(
    await confirmMilitaryVerification(participantId, token, backend),
    { ok: false, code: "used_link" },
  );
  assert.deepEqual(
    await requestMilitaryVerification(
      participantId,
      "a@navy.mil",
      origin,
      backend,
      () => anotherToken,
    ),
    { ok: true, code: "sent" },
  );
  assert.deepEqual(
    await confirmMilitaryVerification(participantId, token, backend),
    { ok: false, code: "invalid_link" },
  );
  rows.get(participantId).expiresAt = now - 1;
  assert.deepEqual(
    await confirmMilitaryVerification(participantId, anotherToken, backend),
    { ok: false, code: "expired_link" },
  );
});

test("database confirmation failure cannot mark a user as verified", async () => {
  const { backend } = stub({
    async consume() {
      throw new Error("internal db error");
    },
  });
  assert.deepEqual(
    await confirmMilitaryVerification(participantId, token, backend),
    {
      ok: false,
      code: "unavailable",
    },
  );
});

for (const code of ["invalid_link", "expired_link", "used_link"]) {
  test(`confirmation exposes the ${code} error without verifying a profile`, async () => {
    const { backend } = stub({
      async consume() {
        return code;
      },
    });
    assert.deepEqual(
      await confirmMilitaryVerification(participantId, token, backend),
      {
        ok: false,
        code,
      },
    );
  });
}

// Keep the page location, profile storage and database trust boundary in scope
// without requiring a live Supabase project for these contract checks.
test("verification migration stores a separate confirmed military email", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(
    new URL(
      "../supabase/migrations/20261107120000_mil_email_verification.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    sql,
    /alter table public\.participants\s+add column military_email text/i,
  );
  assert.match(
    sql,
    /set verification_status = true, military_email = v_email/i,
  );
  assert.match(sql, /create trigger protect_participant_military_email/i);
  assert.match(
    sql,
    /revoke all on function public\.consume_mil_email_verification/i,
  );
});

test("the new verification page is located at app/verify/page.tsx and has a resend timer", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(
    new URL("../app/verify/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /Resend verification link/);
  assert.match(page, /You can resend in/);
  assert.match(page, /Check your \.mil inbox/);
});
