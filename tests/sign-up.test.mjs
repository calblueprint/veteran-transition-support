import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSignUp } from "../lib/sign-up.ts";

test("sign-up normalizes email without changing the password requirements", () => {
  const result = validateSignUp("  Participant@Example.COM  ", "longpassword!");
  assert.equal(result.valid, true);
  assert.equal(result.email, "participant@example.com");
});

test("both invalid fields can be shown together as designed", () => {
  const result = validateSignUp("participant@example", "short");
  assert.equal(result.valid, false);
  assert.ok(result.errors.email);
  assert.deepEqual(result.errors.password, [
    "Password must be at least 8 characters.",
    "Password must contain at least 1 symbol.",
  ]);
});

test("whitespace and unicode letters do not count as password symbols", () => {
  for (const password of ["abcdefgh ", "abcdefghé", "abcdefgh１２"]) {
    assert.equal(validateSignUp("person@example.com", password).valid, false);
  }
  assert.equal(validateSignUp("person@example.com", "abcdefg!").valid, true);
});

test("blank and malformed email addresses are rejected", () => {
  for (const email of ["", "hello", "a@@b.com", "a b@example.com", "a@.com"]) {
    assert.ok(validateSignUp(email, "password!").errors.email);
  }
});
