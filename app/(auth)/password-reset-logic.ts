import type { Session, SupabaseClient } from "@supabase/supabase-js";

/** Public, display-safe errors. Do not return raw Supabase errors to the UI. */
export type PasswordResetErrorCode =
  | "invalid_email"
  | "invalid_or_expired_link"
  | "weak_password"
  | "rate_limited"
  | "network_error";

export type PasswordResetResult =
  | { success: true; message: string }
  | {
      success: false;
      error: { code: PasswordResetErrorCode; message: string };
    };

export const RESET_REQUEST_MESSAGE =
  "If an account exists with this email, a password reset link has been sent.";

/** Only the Supabase Auth methods needed by this feature. */
type AuthClient = Pick<
  SupabaseClient["auth"],
  | "resetPasswordForEmail"
  | "verifyOtp"
  | "onAuthStateChange"
  | "initialize"
  | "getUser"
  | "updateUser"
>;

type AuthFailure = { code?: string; status?: number; message?: string };

function failure(code: PasswordResetErrorCode): PasswordResetResult {
  const messages: Record<PasswordResetErrorCode, string> = {
    invalid_email: "Enter a valid email address.",
    invalid_or_expired_link:
      "Your password reset link is invalid or expired. Request a new one.",
    weak_password: "Choose a stronger password (at least 8 characters).",
    rate_limited: "Too many attempts. Please try again later.",
    network_error: "Unable to complete the request. Please try again.",
  };
  return { success: false, error: { code, message: messages[code] } };
}

function classify(error: AuthFailure | null, fallback: PasswordResetErrorCode) {
  if (!error) return fallback;
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "rate_limited";
  }
  if (
    error.code === "weak_password" ||
    error.code === "password_too_short" ||
    error.code === "same_password"
  ) {
    return "weak_password";
  }
  if (
    [
      "otp_expired",
      "otp_disabled",
      "invalid_token",
      "invalid_grant",
      "bad_jwt",
      "session_not_found",
      "session_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
    ].includes(error.code ?? "")
  ) {
    return "invalid_or_expired_link";
  }
  return fallback;
}

/**
 * An injectable implementation that can be tested without Supabase credentials.
 * A normal signed-in user is NOT automatically granted password-recovery access.
 */
export function createPasswordResetLogic(
  auth: AuthClient,
  now: () => number = Date.now,
) {
  let recovery: { userId: string; expiresAt: number } | null = null;
  let verifiedTokenHash: string | null = null;
  let verifying: {
    tokenHash: string;
    result: Promise<PasswordResetResult>;
  } | null = null;

  function grantRecovery(session: Session): boolean {
    const expiresAt = (session.expires_at ?? 0) * 1000;
    if (!session.user?.id || expiresAt <= now()) {
      recovery = null;
      return false;
    }
    recovery = { userId: session.user.id, expiresAt };
    return true;
  }

  // Supabase's default ConfirmationURL may deliver a recovery session via
  // PASSWORD_RECOVERY rather than a token_hash. Never accept SIGNED_IN as proof.
  const {
    data: { subscription },
  } = auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      if (session) grantRecovery(session);
    } else if (event === "SIGNED_OUT") {
      recovery = null;
    } else if (
      event === "SIGNED_IN" &&
      recovery &&
      session?.user?.id !== recovery.userId
    ) {
      // Reconfirming the same signed-in account cannot clear recovery.
      // Changing accounts still invalidates the verified recovery grant.
      recovery = null;
    }
  });

  async function requestPasswordReset(
    email: string,
    redirectTo: string,
  ): Promise<PasswordResetResult> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return failure("invalid_email");
    }

    // The public wrapper derives this URL from the app origin, not user input.
    // Reject non-HTTPS redirects except for localhost development.
    let callback: URL;
    try {
      callback = new URL(redirectTo);
      if (
        callback.pathname !== "/reset-password" ||
        (callback.protocol !== "https:" &&
          !(
            callback.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(callback.hostname)
          ))
      ) {
        return failure("network_error");
      }
    } catch {
      return failure("network_error");
    }

    try {
      const { error } = await auth.resetPasswordForEmail(normalized, {
        redirectTo: callback.toString(),
      });

      // Even when the provider says the account is absent, respond identically.
      // This prevents email/account enumeration.
      if (
        error &&
        !["user_not_found", "email_not_found"].includes(error.code ?? "")
      ) {
        return failure(classify(error, "network_error"));
      }
      return { success: true, message: RESET_REQUEST_MESSAGE };
    } catch {
      return failure("network_error");
    }
  }

  /**
   * Establishes a recovery grant using a single-use recovery token in the URL,
   * or Supabase's verified PASSWORD_RECOVERY event from its default email link.
   * A plain getUser() or ordinary session is deliberately insufficient.
   */
  async function startPasswordRecovery(
    url: string,
  ): Promise<PasswordResetResult> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      recovery = null;
      return failure("invalid_or_expired_link");
    }
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const tokenHash =
      fragment.get("token_hash") ?? parsed.searchParams.get("token_hash");
    const type = fragment.get("type") ?? parsed.searchParams.get("type");

    if (
      fragment.has("error") ||
      fragment.has("error_code") ||
      parsed.searchParams.has("error") ||
      parsed.searchParams.has("error_code")
    ) {
      recovery = null;
      return failure("invalid_or_expired_link");
    }
    if (tokenHash) {
      if (type !== "recovery") {
        recovery = null;
        return failure("invalid_or_expired_link");
      }
      // React Strict Mode can run the mounting effect twice. Do not redeem
      // the same one-use link a second time while verification is in flight.
      if (verifying?.tokenHash === tokenHash) return verifying.result;
      if (
        verifiedTokenHash === tokenHash &&
        recovery &&
        recovery.expiresAt > now()
      ) {
        return { success: true, message: "Recovery link verified." };
      }
      recovery = null;
      const result = (async (): Promise<PasswordResetResult> => {
        try {
          const { data, error } = await auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error || !data.session || !grantRecovery(data.session)) {
            return failure(classify(error, "invalid_or_expired_link"));
          }
          verifiedTokenHash = tokenHash;
          return { success: true, message: "Recovery link verified." };
        } catch {
          return failure("invalid_or_expired_link");
        }
      })();
      verifying = { tokenHash, result };
      try {
        return await result;
      } finally {
        verifying = null;
      }
    }
    // For implicit/PKCE ConfirmationURL links, Supabase validates the URL
    // and emits PASSWORD_RECOVERY. The `type=recovery` marker by itself is
    // never enough to authorize a reset.
    if (type && type !== "recovery") {
      recovery = null;
      return failure("invalid_or_expired_link");
    }

    // In the normal Supabase redirect flow the auth client exchanges the code
    // automatically and emits PASSWORD_RECOVERY. Allow initialization and its
    // deferred event to complete, but NEVER trust just any active session.
    try {
      const { error } = await auth.initialize();
      if (error) return failure("invalid_or_expired_link");
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    } catch {
      return failure("invalid_or_expired_link");
    }
    return recovery && recovery.expiresAt > now()
      ? { success: true, message: "Recovery link verified." }
      : failure("invalid_or_expired_link");
  }

  async function updatePassword(
    newPassword: string,
  ): Promise<PasswordResetResult> {
    if (!recovery || recovery.expiresAt <= now()) {
      recovery = null;
      return failure("invalid_or_expired_link");
    }
    if (newPassword.length < 8) return failure("weak_password");

    try {
      const { data, error } = await auth.getUser();
      if (error || !data.user || data.user.id !== recovery.userId) {
        recovery = null;
        return failure("invalid_or_expired_link");
      }

      const { error: updateError } = await auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        const code = classify(updateError, "network_error");
        if (code === "invalid_or_expired_link") recovery = null;
        return failure(code);
      }
      // Recovery is one-time within the application, even though the user's
      // refreshed auth session may outlive the original email token.
      recovery = null;
      return { success: true, message: "Password updated successfully." };
    } catch {
      return failure("network_error");
    }
  }

  return {
    requestPasswordReset,
    startPasswordRecovery,
    updatePassword,
    dispose: () => subscription.unsubscribe(),
  };
}
