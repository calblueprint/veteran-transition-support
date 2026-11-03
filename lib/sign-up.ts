export type SignUpErrors = {
  email?: string;
  password?: string[];
};

/** Validate the two field errors shown in the sign-up design before contacting auth. */
export function validateSignUp(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const errors: SignUpErrors = {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = "Enter a valid email address in the format ‘example@me.com’";
  }

  const passwordErrors: string[] = [];
  if (password.length < 8) {
    passwordErrors.push("Password must be at least 8 characters.");
  }
  if (!/[^\p{L}\p{N}\s]/u.test(password)) {
    passwordErrors.push("Password must contain at least 1 symbol.");
  }
  if (passwordErrors.length) errors.password = passwordErrors;

  return { email: normalizedEmail, errors, valid: !Object.keys(errors).length };
}

/** Supabase may return an obscured user with no identities for a duplicate signup. */
export function getSignUpOutcome(
  data: {
    user: { identities?: readonly unknown[] } | null;
    session: object | null;
  },
  error: { code?: string } | null = null,
) {
  if (error?.code === "user_already_exists" || error?.code === "email_exists") {
    return "existing-account";
  }
  if (error) return "auth-error";
  if (data.session) return "signed-in";
  if (!data.user) return "unexpected-response";
  if (data.user.identities?.length === 0) return "existing-account";
  return "confirmation-required";
}
