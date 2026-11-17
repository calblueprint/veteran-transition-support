import type { PasswordResetResult } from "../password-reset-logic";
import { passwordResetService } from "../password-reset-service";

export type {
  PasswordResetResult,
  PasswordResetErrorCode,
} from "../password-reset-logic";

/** Request a reset email without exposing whether the address is registered. */
export function requestPasswordReset(
  email: string,
): Promise<PasswordResetResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({
      success: false,
      error: { code: "network_error", message: "Try again in your browser." },
    });
  }
  const redirectTo = new URL("/reset-password", window.location.origin).href;
  return passwordResetService.requestPasswordReset(email, redirectTo);
}
