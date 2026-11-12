import type { PasswordResetResult } from "../password-reset-logic";
import { passwordResetService } from "../password-reset-service";

export type {
  PasswordResetResult,
  PasswordResetErrorCode,
} from "../password-reset-logic";

/** Verify the recovery email's single-use token, never a normal login session. */
export function startPasswordRecovery(
  url: string,
): Promise<PasswordResetResult> {
  return passwordResetService.startPasswordRecovery(url);
}

/** Update the password only after verified, unexpired password recovery. */
export function updatePassword(
  newPassword: string,
): Promise<PasswordResetResult> {
  return passwordResetService.updatePassword(newPassword);
}
