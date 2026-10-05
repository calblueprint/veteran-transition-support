/**
 * @fileoverview Tests the profile data contract using Node's built-in runner.
 * Run with `pnpm test`; no Supabase credentials or database access are needed.
 * The .mjs runner imports the TypeScript module through Node's type stripping.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  EMPTY_PROFILE,
  profileToForm,
  validateProfile,
} from "../lib/participant-profile.ts";

const validProfile = {
  first_name: "Test",
  last_name: "Participant",
  email: "participant@example.com",
  military_branch: "army",
  rank: "Sergeant",
  mos: "11B",
  service_start_date: "2020-01-01",
  service_end_date: "2024-01-01",
  education_level: "bachelors",
};

test("an empty form identifies each required field", () => {
  const result = validateProfile(EMPTY_PROFILE);
  assert.equal(result.success, false);
  assert.deepEqual(Object.keys(result.errors).sort(), [
    "education_level",
    "email",
    "first_name",
    "last_name",
    "military_branch",
    "mos",
    "rank",
    "service_start_date",
  ]);
});

test("text is trimmed before saving or checking required values", () => {
  const result = validateProfile({ ...validProfile, first_name: "  Test  " });
  assert.equal(result.success, true);
  assert.equal(result.data.first_name, "Test");
  const blank = validateProfile({ ...validProfile, rank: "   " });
  assert.equal(blank.success, false);
  assert.ok(blank.errors.rank);
});

test("normalization preserves raw input and excludes database-only fields", () => {
  const input = Object.freeze({
    ...validProfile,
    first_name: "  Test  ",
    id: "must-not-override-the-participant-id",
    resume_url: "must-not-overwrite-an-existing-resume",
  });
  const result = validateProfile(input);

  assert.equal(result.success, true);
  assert.deepEqual(result.data, validProfile);
  assert.equal(input.first_name, "  Test  ");
});

test("an invalid email cannot be saved", () => {
  for (const email of ["invalid", "user@", "user name@example.com"]) {
    const result = validateProfile({ ...validProfile, email });
    assert.equal(result.success, false);
    assert.ok(result.errors.email);
  }
});

test("branch and education must use actual database enum values", () => {
  const result = validateProfile({
    ...validProfile,
    military_branch: "Air Force",
    education_level: "college",
  });
  assert.equal(result.success, false);
  assert.ok(result.errors.military_branch);
  assert.ok(result.errors.education_level);
  assert.equal(
    validateProfile({ ...validProfile, military_branch: "air_force" }).success,
    true,
  );
});

test("end date cannot precede start date", () => {
  const result = validateProfile({
    ...validProfile,
    service_end_date: "2019-12-31",
  });
  assert.equal(result.success, false);
  assert.ok(result.errors.service_end_date);
});

test("equal service dates are allowed", () => {
  assert.equal(
    validateProfile({ ...validProfile, service_end_date: "2020-01-01" })
      .success,
    true,
  );
});

test("a blank end date is saved as null for someone still serving", () => {
  const result = validateProfile({ ...validProfile, service_end_date: "" });
  assert.equal(result.success, true);
  assert.equal(result.data.service_end_date, null);
});

test("a future start date is rejected even when the end date is blank", () => {
  const result = validateProfile(
    { ...validProfile, service_start_date: "2026-10-05", service_end_date: "" },
    new Date(2026, 9, 4, 12),
  );
  assert.equal(result.success, false);
  assert.equal(
    result.errors.service_start_date,
    "Service date cannot be in the future.",
  );
  assert.equal(result.errors.service_end_date, undefined);
});

test("a future end date is rejected even when it follows a valid start date", () => {
  const result = validateProfile(
    { ...validProfile, service_end_date: "2026-10-05" },
    new Date(2026, 9, 4, 12),
  );
  assert.equal(result.success, false);
  assert.equal(
    result.errors.service_end_date,
    "Service date cannot be in the future.",
  );
  assert.equal(result.errors.service_start_date, undefined);
});

test("both future service dates receive their own error", () => {
  const result = validateProfile(
    {
      ...validProfile,
      service_start_date: "2026-10-05",
      service_end_date: "2026-10-06",
    },
    new Date(2026, 9, 4, 12),
  );
  assert.equal(result.success, false);
  assert.equal(
    result.errors.service_start_date,
    "Service date cannot be in the future.",
  );
  assert.equal(
    result.errors.service_end_date,
    "Service date cannot be in the future.",
  );
});

test("today is allowed for either service date, including across a year boundary", () => {
  for (const [currentDate, today] of [
    [new Date(2026, 9, 4, 0, 1), "2026-10-04"],
    [new Date(2027, 0, 1, 0, 1), "2027-01-01"],
  ]) {
    const result = validateProfile(
      { ...validProfile, service_start_date: today, service_end_date: today },
      currentDate,
    );
    assert.equal(result.success, true);
  }
});

for (const { timezone, currentDate } of [
  { timezone: "America/Los_Angeles", currentDate: "2026-10-05T06:30:00Z" },
  { timezone: "Pacific/Kiritimati", currentDate: "2026-10-03T10:30:00Z" },
]) {
  test(`the date limit follows the local day in ${timezone}, not UTC`, () => {
    // Isolate TZ in a child process so these checks do not alter other tests.
    const moduleUrl = new URL("../lib/participant-profile.ts", import.meta.url);
    execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "--eval",
        `
          import assert from "node:assert/strict";
          import { validateProfile } from ${JSON.stringify(moduleUrl.href)};
          const values = ${JSON.stringify(validProfile)};
          const clock = new Date(${JSON.stringify(currentDate)});
          const today = validateProfile({ ...values, service_start_date: "2026-10-04", service_end_date: "2026-10-04" }, clock);
          assert.equal(today.success, true);
          const tomorrow = validateProfile({ ...values, service_start_date: "2026-10-05", service_end_date: "2026-10-05" }, clock);
          assert.equal(tomorrow.success, false);
          assert.equal(tomorrow.errors.service_start_date, "Service date cannot be in the future.");
          assert.equal(tomorrow.errors.service_end_date, "Service date cannot be in the future.");
        `,
      ],
      { env: { ...process.env, TZ: timezone }, stdio: "pipe" },
    );
  });
}

test("impossible dates are rejected rather than normalized by JavaScript", () => {
  for (const date of [
    "2023-02-29",
    "2024-02-30",
    "2024-13-01",
    "0000-01-01",
    "01/01/2024",
  ]) {
    const result = validateProfile({
      ...validProfile,
      service_start_date: date,
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.service_start_date);
  }
  assert.equal(
    validateProfile({
      ...validProfile,
      service_start_date: "2020-02-29",
    }).success,
    true,
  );
});

test("an invalid end date is reported even with a valid start date", () => {
  const result = validateProfile({
    ...validProfile,
    service_end_date: "2024-02-30",
  });
  assert.equal(result.success, false);
  assert.ok(result.errors.service_end_date);
});

test("an existing incomplete record loads with empty form fields", () => {
  const values = profileToForm({
    id: "test-id",
    first_name: "Test",
    last_name: "Participant",
    email: "participant@example.com",
    military_branch: null,
    rank: null,
    mos: null,
    service_start_date: null,
    service_end_date: null,
    education_level: null,
  });
  assert.equal(values.first_name, "Test");
  assert.equal(values.military_branch, "");
  assert.equal(values.service_end_date, "");
  assert.equal("id" in values, false);
});
