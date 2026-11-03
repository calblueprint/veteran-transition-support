import assert from "node:assert/strict";
import { test } from "node:test";
import { getLoginError, validateLogin } from "../lib/login.ts";

test("login shows both required-field messages for an empty submission", () => {
  assert.deepEqual(validateLogin("   ", "").errors, {
    email: "Enter your email address.",
    password: "Enter your password.",
  });
});

test("login normalizes email and accepts existing passwords without signup rules", () => {
  const result = validateLogin("  Person@Example.COM  ", "short");
  assert.equal(result.email, "person@example.com");
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test("login rejects malformed email before contacting authentication", () => {
  for (const email of [
    "person@example",
    "person@@example.com",
    "person @example.com",
  ]) {
    assert.equal(validateLogin(email, "password").valid, false);
    assert.equal(
      validateLogin(email, "password").errors.email,
      "Enter a valid email address.",
    );
  }
});

test("incorrect credentials mark both fields and match the Figma banner", () => {
  assert.deepEqual(getLoginError({ code: "invalid_credentials" }), {
    invalidCredentials: true,
    message:
      "Incorrect email or password. Please check your details and try again.",
  });
});

test("confirmation, rate limits, and other failures are not flagged as bad credentials", () => {
  assert.deepEqual(getLoginError({ code: "email_not_confirmed" }), {
    invalidCredentials: false,
    message: "Please confirm your email before logging in.",
  });
  assert.deepEqual(getLoginError({ status: 429 }), {
    invalidCredentials: false,
    message: "Too many attempts. Please try again later.",
  });
  assert.deepEqual(getLoginError({ status: 500 }), {
    invalidCredentials: false,
    message: "Unable to log in. Please try again.",
  });
});
