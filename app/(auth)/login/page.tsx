"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data: existingUser, error: lookupError } = await supabase
        .from("participants")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (lookupError) {
        setError("Unable to log in. Please try again.");
        return;
      }

      if (!existingUser) {
        setError("No account found with this email.");
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        if (authError.code === "invalid_credentials") {
          setError("Invalid password.");
        } else if (authError.code === "email_not_confirmed") {
          setError("Please confirm your email before logging in.");
        } else if (authError.status === 429) {
          setError("Too many attempts. Please try again later.");
        } else {
          setError(authError.message);
        }

        return;
      }

      router.replace("/");
    } catch {
      setError("Unable to log in. Please try again.");
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
      <h1>Log In</h1>
      <p>Welcome back! Enter your credentials.</p>

      <form
        onSubmit={event => {
          event.preventDefault();
          void handleLogin();
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
            placeholder="Enter your password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 10 }}
          />
        </div>

        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log In"}
        </button>
      </form>

      <p>
        Don&apos;t have an account? <Link href="/sign-up">Sign up</Link>
      </p>
    </main>
  );
}
