"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkRecoverySession() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        const { data, error: sessionError } = await supabase.auth.getUser();

        if (!active) {
          return;
        }

        if (!sessionError && data.user) {
          setAuthorized(true);
          setError("");
        } else {
          setAuthorized(false);
          setError(
            "Your reset link is invalid or expired. " +
              "Please request a new one.",
          );
        }
      } catch {
        if (active) {
          setAuthorized(false);
          setError(
            "Unable to verify the reset link. " + "Please request a new one.",
          );
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    void checkRecoverySession();

    return () => {
      active = false;
    };
  }, []);

  async function handlePasswordReset() {
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        setError(
          "Password changed, but automatic sign-out failed. " +
            "Please sign out before logging in again.",
        );
        return;
      }

      setMessage("Password updated successfully! Redirecting to login...");

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main style={{ padding: 24 }}>
        <p>Checking reset link...</p>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Invalid Reset Link</h1>

        <p role="alert">{error}</p>

        <Link href="/forgot-password">Request another reset link</Link>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "80px auto",
        padding: 24,
      }}
    >
      <h1>Reset Password</h1>

      <p>Enter your new password below.</p>

      <form
        onSubmit={event => {
          event.preventDefault();
          void handlePasswordReset();
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="password">New Password</label>

          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter new password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            minLength={8}
            required
            style={{
              display: "block",
              width: "100%",
              padding: 10,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="confirmPassword">Confirm New Password</label>

          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              padding: 10,
            }}
          />
        </div>

        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}

        {message && (
          <p role="status" style={{ color: "green" }}>
            {message}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </main>
  );
}
