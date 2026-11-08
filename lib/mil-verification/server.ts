import nodemailer from "nodemailer";
import "server-only";
import type { IssueStatus, VerificationBackend } from "./flow";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** A server-only privileged client. Never expose this key through NEXT_PUBLIC_*. */
function databaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Verification database is not configured.");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Prevent attacker-controlled request Host headers becoming email link hosts. */
export function verificationAppOrigin(): string {
  const configured =
    process.env.MIL_VERIFICATION_APP_ORIGIN ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  if (!configured)
    throw new Error("Verification app origin is not configured.");
  const url = new URL(configured);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Invalid verification app origin.");
  }
  return url.origin;
}

export function verificationBackend(): VerificationBackend {
  const client = databaseClient();
  const smtpLogin = process.env.BREVO_SMTP_LOGIN;
  const smtpKey = process.env.BREVO_SMTP_KEY;
  const from = process.env.BREVO_FROM_EMAIL;

  if (!smtpLogin || !smtpKey || !from) {
    throw new Error("Verification email is not configured.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: smtpLogin,
      pass: smtpKey,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return {
    async issue(participantId, militaryEmail, tokenHash) {
      const { data, error } = await client.rpc("issue_mil_email_verification", {
        p_participant_id: participantId,
        p_military_email: militaryEmail,
        p_token_hash: tokenHash,
      });
      if (error || typeof data !== "string")
        throw new Error("Unable to issue verification.");
      const status = data as IssueStatus;
      if (
        ![
          "issued",
          "cooldown",
          "rate_limited",
          "already_verified",
          "profile_missing",
        ].includes(status)
      ) {
        throw new Error("Unexpected verification status.");
      }
      return status;
    },
    async consume(participantId, tokenHash) {
      const { data, error } = await client.rpc(
        "consume_mil_email_verification",
        {
          p_participant_id: participantId,
          p_token_hash: tokenHash,
        },
      );
      if (
        error ||
        typeof data !== "string" ||
        !["verified", "expired_link", "used_link", "invalid_link"].includes(
          data,
        )
      ) {
        throw new Error("Unable to confirm verification.");
      }
      return data as "verified" | "expired_link" | "used_link" | "invalid_link";
    },
    async send(militaryEmail, link) {
      await transporter.sendMail({
        from,
        to: militaryEmail,
        subject: "Verify your military email for VTS",
        text: [
          "You requested military-email verification for Veteran Transition Support.",
          "",
          "Open this link and click Confirm verification:",
          link,
          "",
          "The link expires in 15 minutes and works only once.",
          "You must be signed in to the account that requested it.",
          "If you did not request this, ignore this email.",
        ].join("\n"),
      });
    },
  };
}
