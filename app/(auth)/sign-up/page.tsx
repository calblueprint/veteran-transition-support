"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: `${window.location.origin}/profile` },
      });

      if (authError) {
        if (authError.code === "user_already_exists") {
          setError("This email is already registered. Please log in.");
        } else if (authError.code === "weak_password") {
          setError("Please choose a stronger password.");
        } else if (authError.status === 429) {
          setError("Too many attempts. Please try again later.");
        } else {
          setError(authError.message);
        }
        return;
      }

      if (data.user?.identities?.length === 0) {
        setMessage(
          "If this email is eligible, a confirmation link will be sent.",
        );
      } else if (data.session) {
        router.replace("/onboarding");
      } else {
        setMessage(
          "Sign-up request successful! Check your email to confirm your account.",
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "80px auto",
        padding: 24,
      }}
    >
      <h1>Create an Account</h1>
      <p>Enter your email and password to sign up.</p>

      <form
        onSubmit={event => {
          event.preventDefault();
          void handleSignUp();
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="Enter your email"
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 10 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Create a password"
            autoComplete="new-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            minLength={8}
            required
            style={{ display: "block", width: "100%", padding: 10 }}
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
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>

      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
