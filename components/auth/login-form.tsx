"use client";

import type { LoginErrors } from "@/lib/login";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { getLoginError, validateLogin } from "@/lib/login";
import { supabase } from "@/lib/supabase";
import styles from "./auth.module.css";
import loginStyles from "./login.module.css";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [error, setError] = useState("");
  const [invalidCredentials, setInvalidCredentials] = useState(false);
  const [loading, setLoading] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const recoveryDialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);

  function clearAuthError() {
    setError("");
    setInvalidCredentials(false);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    clearAuthError();
    const validation = validateLogin(email, password);
    setErrors(validation.errors);
    if (!validation.valid) {
      (validation.errors.email ? emailInput : passwordInput).current?.focus();
      return;
    }

    pending.current = true;
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: validation.email,
        password,
      });
      if (authError) {
        const feedback = getLoginError(authError);
        setError(feedback.message);
        setInvalidCredentials(feedback.invalidCredentials);
        if (feedback.invalidCredentials) {
          setPassword("");
          setShowPassword(false);
          passwordInput.current?.focus();
        }
        return;
      }
      router.replace("/profile");
    } catch {
      setError("Unable to log in. Please try again.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <main className={styles.main}>
        <section className={styles.content} aria-labelledby="login-heading">
          <div className={styles.heading}>
            <h1 id="login-heading">Welcome back!</h1>
            <div className={styles.goldRule} aria-hidden="true" />
            <p>
              New here? <Link href="/sign-up">Create an account</Link>
            </p>
          </div>
          <form
            className={styles.form}
            onSubmit={handleLogin}
            noValidate
            aria-busy={loading}
          >
            {error && (
              <div
                className={loginStyles.errorBanner}
                id="login-error"
                role="alert"
              >
                <span className={loginStyles.errorIcon} aria-hidden="true">
                  !
                </span>
                <p>{error}</p>
              </div>
            )}
            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="email">Email</label>
                <input
                  ref={emailInput}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  readOnly={loading}
                  onChange={event => {
                    setEmail(event.target.value);
                    setErrors(current => ({ ...current, email: undefined }));
                    clearAuthError();
                  }}
                  required
                  aria-invalid={Boolean(errors.email || invalidCredentials)}
                  aria-describedby={
                    errors.email
                      ? "email-error"
                      : invalidCredentials
                        ? "login-error"
                        : undefined
                  }
                />
                {errors.email && (
                  <p
                    id="email-error"
                    className={styles.fieldError}
                    role="alert"
                  >
                    {errors.email}
                  </p>
                )}
              </div>
              <div className={styles.field}>
                <div className={loginStyles.labelRow}>
                  <label htmlFor="password">Password</label>
                  <Button
                    className={loginStyles.forgotPassword}
                    type="button"
                    onClick={() => recoveryDialog.current?.showModal()}
                  >
                    Forgot password?
                  </Button>
                </div>
                <div
                  className={styles.passwordBox}
                  data-invalid={Boolean(errors.password || invalidCredentials)}
                >
                  <input
                    ref={passwordInput}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={password}
                    readOnly={loading}
                    onChange={event => {
                      setPassword(event.target.value);
                      setErrors(current => ({
                        ...current,
                        password: undefined,
                      }));
                      clearAuthError();
                    }}
                    required
                    aria-invalid={Boolean(
                      errors.password || invalidCredentials,
                    )}
                    aria-describedby={
                      errors.password
                        ? "password-error"
                        : invalidCredentials
                          ? "login-error"
                          : undefined
                    }
                  />
                  <Button
                    className={styles.textButton}
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-controls="password"
                    onClick={() => setShowPassword(current => !current)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </Button>
                </div>
                {errors.password && (
                  <p
                    id="password-error"
                    className={styles.fieldError}
                    role="alert"
                  >
                    {errors.password}
                  </p>
                )}
              </div>
            </div>
            <Button
              className={styles.submitButton}
              type="submit"
              disabled={loading}
            >
              {loading ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </section>
      </main>
      <dialog
        ref={recoveryDialog}
        className={styles.dialog}
        aria-labelledby="recovery-heading"
      >
        <h2 id="recovery-heading">Forgot password?</h2>
        <p>
          This is a placeholder. Password recovery will be available here soon.
          No reset email has been sent.
        </p>
        <form method="dialog">
          <Button className={styles.submitButton}>Close</Button>
        </form>
      </dialog>
    </>
  );
}
