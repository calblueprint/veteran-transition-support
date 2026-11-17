"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../forgotPassword";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleResetRequest() {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await requestPasswordReset(email);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setMessage(result.message);
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
      <h1>Forgot Password</h1>

      <p>
        Enter your email address and we will send you a link to reset your
        password.
      </p>

      <form
        onSubmit={event => {
          event.preventDefault();
          void handleResetRequest();
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
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>

      <p>
        Remember your password? <Link href="/login">Back to login</Link>
      </p>
    </main>
  );
}
