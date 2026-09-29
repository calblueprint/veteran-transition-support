import assert from "node:assert/strict";
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
