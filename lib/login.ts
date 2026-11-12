export type LoginErrors = {
  email?: string;
  password?: string;
};

/** Login accepts existing passwords without applying new-account password rules. */
export function validateLogin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const errors: LoginErrors = {};
  if (!normalizedEmail) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = "Enter a valid email address.";
  }
  if (!password) errors.password = "Enter your password.";

  return { email: normalizedEmail, errors, valid: !Object.keys(errors).length };
}

export function getLoginError(error: { code?: string; status?: number }) {
  if (error.code === "invalid_credentials") {
    return {
      invalidCredentials: true,
      message:
        "Incorrect email or password. Please check your details and try again.",
    };
  }
  if (error.code === "email_not_confirmed") {
    return {
      invalidCredentials: false,
      message: "Please confirm your email before logging in.",
    };
  }
  if (error.status === 429) {
    return {
      invalidCredentials: false,
      message: "Too many attempts. Please try again later.",
    };
  }
  return {
    invalidCredentials: false,
    message: "Unable to log in. Please try again.",
  };
}
