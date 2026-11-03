import assert from "node:assert/strict";
import { test } from "node:test";
import { getSignUpOutcome, validateSignUp } from "../lib/sign-up.ts";

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

test("an obscured duplicate signup is not presented as confirmation success", () => {
  assert.equal(
    getSignUpOutcome({ user: { identities: [] }, session: null }),
    "existing-account",
  );
});

test("new signup identities still require email confirmation", () => {
  assert.equal(
    getSignUpOutcome({
      user: { identities: [{ provider: "email" }] },
      session: null,
    }),
    "confirmation-required",
  );
});

test("missing optional identities alone do not prove an account already exists", () => {
  assert.equal(
    getSignUpOutcome({ user: {}, session: null }),
    "confirmation-required",
  );
});

test("a real signup session continues into onboarding", () => {
  assert.equal(
    getSignUpOutcome({
      user: { identities: [{ provider: "email" }] },
      session: {},
    }),
    "signed-in",
  );
});

test("a response with neither a user nor a session cannot claim signup success", () => {
  assert.equal(
    getSignUpOutcome({ user: null, session: null }),
    "unexpected-response",
  );
});

test("both explicit duplicate error codes show the existing-account state", () => {
  for (const code of ["user_already_exists", "email_exists"]) {
    assert.equal(
      getSignUpOutcome({ user: null, session: null }, { code }),
      "existing-account",
    );
  }
});

test("other auth failures do not look like duplicates or successful signups", () => {
  assert.equal(
    getSignUpOutcome({ user: null, session: null }, { code: "weak_password" }),
    "auth-error",
  );
});
