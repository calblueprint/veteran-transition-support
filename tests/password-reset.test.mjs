/** Logic-only reset tests: no live Supabase account or credentials required. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPasswordResetLogic,
  RESET_REQUEST_MESSAGE,
} from "../app/(auth)/password-reset-logic.ts";

const clock = { now: 1_800_000_000_000 };
const session = () => ({
  user: { id: "recovery-user" },
  expires_at: Math.floor(clock.now / 1000) + 3600,
});

function mockAuth(overrides = {}) {
  const calls = { request: [], verify: [], update: [], getUser: 0 };
  let listener = () => {};
  const auth = {
    onAuthStateChange(fn) {
      listener = fn;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async initialize() {
      return { error: null };
    },
    async resetPasswordForEmail(email, options) {
      calls.request.push({ email, options });
      return { error: null };
    },
    async verifyOtp(input) {
      calls.verify.push(input);
      return { data: { session: session() }, error: null };
    },
    async getUser() {
      calls.getUser++;
      return { data: { user: { id: "recovery-user" } }, error: null };
    },
    async updateUser(input) {
      calls.update.push(input);
      return { error: null };
    },
    ...overrides,
  };
  return { auth, calls, emit: (event, current) => listener(event, current) };
}

function make(mock = mockAuth()) {
  return {
    ...mock,
    flow: createPasswordResetLogic(mock.auth, () => clock.now),
  };
}
const hashLink =
  "http://localhost:3000/reset-password#token_hash=single-use-hash&type=recovery";
const redirect = "http://localhost:3000/reset-password";

test("reset request normalizes email and uses the reset page as redirectTo", async () => {
  const { flow, calls } = make();
  assert.deepEqual(
    await flow.requestPasswordReset("  PERSON@Example.com  ", redirect),
    { success: true, message: RESET_REQUEST_MESSAGE },
  );
  assert.deepEqual(calls.request, [
    { email: "person@example.com", options: { redirectTo: redirect } },
  ]);
});

test("an unknown email gets the same public response as a known email", async () => {
  const { flow } = make(
    mockAuth({
      async resetPasswordForEmail() {
        return { error: { code: "user_not_found", status: 404 } };
      },
    }),
  );
  assert.deepEqual(
    await flow.requestPasswordReset("missing@example.com", redirect),
    {
      success: true,
      message: RESET_REQUEST_MESSAGE,
    },
  );
});

test("invalid input is typed and never calls Supabase", async () => {
  const { flow, calls } = make();
  const result = await flow.requestPasswordReset("not-an-email", redirect);
  assert.equal(result.success, false);
  assert.equal(result.error.code, "invalid_email");
  assert.equal(calls.request.length, 0);
});

test("rejects an unsafe redirect URL", async () => {
  const { flow, calls } = make();
  const result = await flow.requestPasswordReset(
    "person@example.com",
    "https://evil.example/reset-password/other",
  );
  assert.equal(result.success, false);
  assert.equal(result.error.code, "network_error");
  assert.equal(calls.request.length, 0);
});

test("rate limits are typed and provider errors are not exposed verbatim", async () => {
  const { flow } = make(
    mockAuth({
      async resetPasswordForEmail() {
        return { error: { code: "over_request_rate_limit", status: 429 } };
      },
    }),
  );
  const result = await flow.requestPasswordReset(
    "person@example.com",
    redirect,
  );
  assert.equal(result.success, false);
  assert.equal(result.error.code, "rate_limited");
});

test("normal signed-in session without recovery proof cannot update a password", async () => {
  const { flow, calls } = make();
  const ready = await flow.startPasswordRecovery(redirect);
  assert.equal(ready.success, false);
  const result = await flow.updatePassword("NewStrongPassword123!");
  assert.equal(result.success, false);
  assert.equal(result.error.code, "invalid_or_expired_link");
  assert.equal(calls.update.length, 0);
});

test("a valid one-use recovery link verifies before update", async () => {
  const { flow, calls } = make();
  assert.equal((await flow.startPasswordRecovery(hashLink)).success, true);
  assert.deepEqual(calls.verify, [
    { token_hash: "single-use-hash", type: "recovery" },
  ]);
  assert.deepEqual(await flow.updatePassword("NewStrongPassword123!"), {
    success: true,
    message: "Password updated successfully.",
  });
  assert.deepEqual(calls.update, [{ password: "NewStrongPassword123!" }]);
  assert.equal(
    (await flow.updatePassword("AnotherPassword123!")).success,
    false,
  );
});

test("expired/reused links fail closed, including with an active login", async () => {
  const { flow, calls } = make(
    mockAuth({
      async verifyOtp() {
        return { data: { session: null }, error: { code: "otp_expired" } };
      },
    }),
  );
  const result = await flow.startPasswordRecovery(hashLink);
  assert.equal(result.success, false);
  assert.equal(result.error.code, "invalid_or_expired_link");
  assert.equal((await flow.updatePassword("NewPassword123!")).success, false);
  assert.equal(calls.update.length, 0);
});

test("a reset token with the wrong type cannot grant recovery", async () => {
  const { flow, calls } = make();
  const result = await flow.startPasswordRecovery(
    "http://localhost:3000/reset-password#token_hash=x&type=email",
  );
  assert.equal(result.error.code, "invalid_or_expired_link");
  assert.equal(calls.verify.length, 0);
});

test("password shorter than 8 characters is rejected locally", async () => {
  const { flow, calls } = make();
  await flow.startPasswordRecovery(hashLink);
  const result = await flow.updatePassword("short");
  assert.equal(result.error.code, "weak_password");
  assert.equal(calls.update.length, 0);
});

test("provider weak password response remains retryable", async () => {
  const { flow, calls } = make(
    mockAuth({
      async updateUser(input) {
        calls.update.push(input);
        if (calls.update.length === 1) {
          return { error: { code: "weak_password", status: 422 } };
        }
        return { error: null };
      },
    }),
  );
  await flow.startPasswordRecovery(hashLink);
  assert.equal(
    (await flow.updatePassword("Weakpass123")).error.code,
    "weak_password",
  );
  assert.equal((await flow.updatePassword("BetterPassword123!")).success, true);
});

test("a recovery grant expires when its verified Supabase session expires", async () => {
  const { flow, calls } = make();
  await flow.startPasswordRecovery(hashLink);
  clock.now += 60 * 60 * 1000 + 1;
  try {
    const result = await flow.updatePassword("NewPassword123!");
    assert.equal(result.error.code, "invalid_or_expired_link");
    assert.equal(calls.update.length, 0);
  } finally {
    clock.now = 1_800_000_000_000;
  }
});

test("recovery is invalid when the signed-in identity changes", async () => {
  const { flow, calls } = make(
    mockAuth({
      async getUser() {
        return { data: { user: { id: "different-user" } }, error: null };
      },
    }),
  );
  await flow.startPasswordRecovery(hashLink);
  assert.equal((await flow.updatePassword("NewPassword123!")).success, false);
  assert.equal(calls.update.length, 0);
});

test("Supabase PASSWORD_RECOVERY event authorizes recovery, but SIGNED_IN does not", async () => {
  const { flow, emit } = make();
  emit("SIGNED_IN", session());
  assert.equal((await flow.updatePassword("NewPassword123!")).success, false);
  emit("PASSWORD_RECOVERY", session());
  assert.equal((await flow.updatePassword("NewPassword123!")).success, true);
  emit("PASSWORD_RECOVERY", session());
  emit("SIGNED_OUT", null);
  assert.equal((await flow.updatePassword("NewPassword123!")).success, false);
});

test("unexpected errors do not expose Supabase internals", async () => {
  const { flow } = make(
    mockAuth({
      async resetPasswordForEmail() {
        throw Error("Database hostname or secret internal information");
      },
    }),
  );
  const result = await flow.requestPasswordReset(
    "someone@example.com",
    redirect,
  );
  assert.equal(result.error.code, "network_error");
  assert.doesNotMatch(result.error.message, /hostname|secret/i);
});

test("concurrent mount effects redeem a single-use token only once", async () => {
  const { flow, calls } = make();
  const [first, second] = await Promise.all([
    flow.startPasswordRecovery(hashLink),
    flow.startPasswordRecovery(hashLink),
  ]);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(calls.verify.length, 1);
  assert.equal((await flow.startPasswordRecovery(hashLink)).success, true);
  assert.equal(calls.verify.length, 1);
});

test("default Supabase PASSWORD_RECOVERY redirect can grant without a token hash", async () => {
  const mock = mockAuth();
  mock.auth.initialize = async () => {
    mock.emit("PASSWORD_RECOVERY", session());
    return { error: null };
  };
  const { flow } = make(mock);
  const ready = await flow.startPasswordRecovery(
    "http://localhost:3000/reset-password#access_token=opaque&type=recovery",
  );
  assert.equal(ready.success, true);
  assert.equal(
    (await flow.updatePassword("NewStrongPassword123!")).success,
    true,
  );
});

test("a forged recovery type marker without a verified session is not enough", async () => {
  const { flow, calls } = make();
  const result = await flow.startPasswordRecovery(
    "http://localhost:3000/reset-password?type=recovery",
  );
  assert.equal(result.success, false);
  assert.equal(result.error.code, "invalid_or_expired_link");
  assert.equal(calls.update.length, 0);
});

test("a callback error cannot grant recovery through another active session", async () => {
  const { flow, emit, calls } = make();
  emit("PASSWORD_RECOVERY", session());
  const result = await flow.startPasswordRecovery(
    "http://localhost:3000/reset-password#error=access_denied&error_code=otp_expired",
  );
  assert.equal(result.error.code, "invalid_or_expired_link");
  assert.equal((await flow.updatePassword("NewPassword123!")).success, false);
  assert.equal(calls.update.length, 0);
});

test("a repeated SIGNED_IN for the same recovery identity preserves the verified grant", async () => {
  const { flow, emit, calls } = make();
  assert.equal((await flow.startPasswordRecovery(hashLink)).success, true);
  emit("SIGNED_IN", session());
  assert.equal(
    (await flow.updatePassword("NewStrongPassword123!")).success,
    true,
  );
  assert.deepEqual(calls.update, [{ password: "NewStrongPassword123!" }]);
});

test("SIGNED_IN as a different user invalidates a verified recovery grant", async () => {
  const { flow, emit, calls } = make();
  await flow.startPasswordRecovery(hashLink);
  emit("SIGNED_IN", { ...session(), user: { id: "different-user" } });
  const result = await flow.updatePassword("NewStrongPassword123!");
  assert.equal(result.success, false);
  assert.equal(result.error.code, "invalid_or_expired_link");
  assert.equal(calls.update.length, 0);
});
