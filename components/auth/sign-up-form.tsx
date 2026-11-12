"use client";

import type { SignUpErrors } from "@/lib/sign-up";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { getSignUpOutcome, validateSignUp } from "@/lib/sign-up";
import { supabase } from "@/lib/supabase";
import styles from "./auth.module.css";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [accountExists, setAccountExists] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [legalTitle, setLegalTitle] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const legalDialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const emailInvalid = Boolean(errors.email || accountExists);

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    clearFeedback();
    setAccountExists(false);

    const validation = validateSignUp(email, password);
    setErrors(validation.errors);
    if (!validation.valid) {
      (validation.errors.email ? emailInput : passwordInput).current?.focus();
      return;
    }

    pending.current = true;
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: validation.email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/profile` },
      });

      const outcome = getSignUpOutcome(data, authError);
      if (outcome === "existing-account") {
        setAccountExists(true);
        emailInput.current?.focus();
        return;
      }

      if (authError) {
        if (authError.code === "weak_password") {
          setErrors({ password: ["Please choose a stronger password."] });
          passwordInput.current?.focus();
        } else if (authError.status === 429) {
          setError("Too many attempts. Please try again later.");
        } else {
          setError(authError.message);
        }
        return;
      }

      if (outcome === "signed-in") {
        router.replace("/onboarding");
      } else if (outcome === "confirmation-required") {
        setMessage(
          "Sign-up request successful! Check your email to confirm your account.",
        );
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  function openLegalPlaceholder(title: string) {
    setLegalTitle(title);
    legalDialog.current?.showModal();
  }

  return (
    <>
      <main className={styles.main}>
        <section className={styles.content} aria-labelledby="sign-up-heading">
          <div className={styles.heading}>
            <h1 id="sign-up-heading">Create your account</h1>
            <div className={styles.goldRule} aria-hidden="true" />
            <p>
              Already have an account? <Link href="/login">Log in</Link>
            </p>
          </div>

          <form
            className={styles.form}
            onSubmit={handleSignUp}
            noValidate
            aria-busy={loading}
          >
            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="email">Email</label>
                <input
                  ref={emailInput}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  readOnly={loading}
                  onChange={event => {
                    setEmail(event.target.value);
                    setErrors(current => ({ ...current, email: undefined }));
                    setAccountExists(false);
                    clearFeedback();
                  }}
                  required
                  aria-invalid={emailInvalid}
                  aria-describedby={emailInvalid ? "email-error" : undefined}
                />
                {emailInvalid && (
                  <p
                    id="email-error"
                    className={styles.fieldError}
                    role="alert"
                  >
                    {accountExists ? (
                      <>
                        An account with this email already exists.{" "}
                        <Link href="/login">Log in here</Link>
                      </>
                    ) : (
                      errors.email
                    )}
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="password">Password</label>
                <div
                  className={styles.passwordBox}
                  data-invalid={Boolean(errors.password)}
                >
                  <input
                    ref={passwordInput}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    value={password}
                    readOnly={loading}
                    onChange={event => {
                      setPassword(event.target.value);
                      setErrors(current => ({
                        ...current,
                        password: undefined,
                      }));
                      clearFeedback();
                    }}
                    minLength={8}
                    required
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      errors.password ? "password-error" : "password-hint"
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
                {errors.password ? (
                  <div
                    id="password-error"
                    className={styles.fieldError}
                    role="alert"
                  >
                    {errors.password.map(issue => (
                      <p key={issue}>{issue}</p>
                    ))}
                  </div>
                ) : (
                  <p id="password-hint" className={styles.hint}>
                    Use at least 8 characters.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p className={styles.fieldError} role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className={styles.success} role="status">
                {message}
              </p>
            )}
            <Button
              className={styles.submitButton}
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className={styles.terms}>
            By creating an account, you agree to our{" "}
            <Button
              className={styles.legalLink}
              type="button"
              onClick={() => openLegalPlaceholder("Terms of Use")}
            >
              Terms of Use
            </Button>{" "}
            and{" "}
            <Button
              className={styles.legalLink}
              type="button"
              onClick={() => openLegalPlaceholder("Privacy Policy")}
            >
              Privacy Policy
            </Button>
            .
          </p>
        </section>
      </main>
      <dialog
        ref={legalDialog}
        className={styles.dialog}
        aria-labelledby="legal-heading"
      >
        <h2 id="legal-heading">{legalTitle}</h2>
        <p>This is a placeholder. {legalTitle} content will be added here.</p>
        <form method="dialog">
          <Button className={styles.submitButton}>Close</Button>
        </form>
      </dialog>
    </>
  );
}
