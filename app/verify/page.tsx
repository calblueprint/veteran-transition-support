"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type AccountState =
  "loading" | "signed_out" | "needs_profile" | "ready" | "verified" | "error";

const COOLDOWN_MS = 60_000;

function messageFor(code: string): string {
  switch (code) {
    case "invalid_email":
      return "Enter a valid .mil email address.";
    case "cooldown":
      return "Please wait before requesting another verification link.";
    case "rate_limited":
      return "Too many requests. Try again in an hour.";
    case "already_verified":
      return "Your profile is already verified.";
    case "profile_missing":
      return "Complete your participant profile before verifying.";
    case "expired_link":
      return "This verification link has expired. Request a new one.";
    case "used_link":
      return "This verification link has already been used. Request a new one.";
    case "invalid_link":
      return "This verification link is invalid or was replaced. Request a new one.";
    case "unauthenticated":
      return "Sign in to the account that requested this verification link.";
    default:
      return "Verification is temporarily unavailable. Please try again later.";
  }
}

export default function VerifyMilitaryEmailPage() {
  const [account, setAccount] = useState<AccountState>("loading");
  const [accountId, setAccountId] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const remainingSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (!cooldownUntil) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        // Read the email link after the async auth check. This also preserves
        // the token during React Strict Mode's effect setup/cleanup cycle.
        const params = new URLSearchParams(window.location.hash.slice(1));
        const linkToken = params.get("token") ?? "";
        if (linkToken) {
          setToken(linkToken);
          // Do not leave the bearer token in browser history.
          window.history.replaceState(null, "", window.location.pathname);
        }
        if (authError || !auth.user) {
          if (active) setAccount("signed_out");
          return;
        }
        const { data: participant, error: profileError } = await supabase
          .from("participants")
          .select("verification_status,military_email")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (!active) return;
        if (profileError) {
          setAccount("error");
        } else if (!participant) {
          setAccount("needs_profile");
        } else {
          setAccountId(auth.user.id);
          setVerifiedEmail(participant.military_email);
          setAccount(participant.verification_status ? "verified" : "ready");
          const stored = window.sessionStorage.getItem(
            `vts-mil-email-cooldown:${auth.user.id}`,
          );
          const until = Number(stored);
          if (until > Date.now() && until < Date.now() + COOLDOWN_MS) {
            setNow(Date.now());
            setSent(true);
            setCooldownUntil(until);
          }
        }
      } catch {
        if (active) setAccount("error");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function post(path: string, body: Record<string, string>) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const result: { ok: boolean; code: string } = await response.json();
    return result;
  }

  async function requestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || remainingSeconds > 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await post("/api/mil-verification/request", { email });
      if (result.ok) {
        const until = Date.now() + COOLDOWN_MS;
        setNow(Date.now());
        setCooldownUntil(until);
        setSent(true);
        if (accountId) {
          window.sessionStorage.setItem(
            `vts-mil-email-cooldown:${accountId}`,
            String(until),
          );
        }
        setNotice(
          "Check your .mil inbox for your single-use verification link.",
        );
      } else {
        if (result.code === "cooldown") {
          // The server enforces the real limit even if browser state is cleared.
          setNow(Date.now());
          setCooldownUntil(Date.now() + COOLDOWN_MS);
          setSent(true);
        }
        setError(messageFor(result.code));
      }
    } catch {
      setError(messageFor("unavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy || !token) return;
    setBusy(true);
    setError("");
    try {
      const result = await post("/api/mil-verification/confirm", { token });
      if (result.ok) {
        setToken("");
        // Read the confirmed address back from the profile; the form may have
        // been blank or changed since the email link was requested.
        const { data: profile } = await supabase
          .from("participants")
          .select("military_email")
          .eq("id", accountId)
          .maybeSingle();
        setVerifiedEmail(profile?.military_email ?? null);
        setAccount("verified");
        setNotice(
          "Your .mil address is confirmed. Your profile is now verified.",
        );
      } else {
        if (
          result.code === "invalid_link" ||
          result.code === "expired_link" ||
          result.code === "used_link"
        ) {
          setToken("");
        }
        setError(messageFor(result.code));
      }
    } catch {
      // Keep the token so a temporary network error can be retried.
      setError(messageFor("unavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 540,
        margin: "64px auto",
        padding: 24,
        lineHeight: 1.5,
      }}
    >
      <h1>Verify your military email</h1>
      <p>
        Confirm access to a .mil mailbox to update your VTS verification status.
        This checks mailbox access, not military service records.
      </p>
      {account === "loading" && <p role="status">Checking your account…</p>}
      {account === "signed_out" && (
        <p role="alert">
          <Link href="/login">Sign in</Link> to your VTS account, then reopen
          the verification email link.
        </p>
      )}
      {account === "needs_profile" && (
        <p role="alert">
          Complete your <Link href="/profile">participant profile</Link> before
          requesting verification.
        </p>
      )}
      {account === "error" && (
        <p role="alert">Unable to load your account. Refresh and try again.</p>
      )}
      {account === "verified" && (
        <section role="status">
          <p>Your profile is verified.</p>
          {verifiedEmail && <p>Confirmed military email: {verifiedEmail}</p>}
        </section>
      )}
      {account === "ready" && (
        <>
          {token && (
            <section aria-label="Confirm military email">
              <h2>Confirm your email</h2>
              <p>Click below to redeem this single-use verification link.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? "Confirming…" : "Confirm verification"}
              </button>
            </section>
          )}
          <form onSubmit={requestEmail} style={{ marginTop: 24 }}>
            <label htmlFor="milEmail">Military email address (.mil)</label>
            <input
              id="milEmail"
              name="military_email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="name@unit.mil"
              style={{
                display: "block",
                width: "100%",
                padding: 10,
                margin: "8px 0",
              }}
            />
            <button type="submit" disabled={busy || remainingSeconds > 0}>
              {busy
                ? "Sending…"
                : sent
                  ? "Resend verification link"
                  : "Send verification link"}
            </button>
            {sent && remainingSeconds > 0 && (
              <p role="status">
                Check your .mil inbox. You can resend in {remainingSeconds}{" "}
                seconds.
              </p>
            )}
            {sent && remainingSeconds === 0 && (
              <p>Didn’t receive it? Select Resend verification link.</p>
            )}
          </form>
        </>
      )}
      {notice && (
        <p role="status" style={{ color: "green" }}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
      <p>
        <Link href="/profile">Back to profile</Link>
      </p>
    </main>
  );
}
