import { createHash, randomBytes } from "node:crypto";

/** A .mil mailbox is evidence of mailbox control, not proof of veteran status. */
const MIL_EMAIL =
  /^[a-z0-9._%+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+mil$/i;
const TOKEN = /^[a-zA-Z0-9_-]{43}$/;

export type IssueStatus =
  | "issued"
  | "cooldown"
  | "rate_limited"
  | "already_verified"
  | "profile_missing";

export type RequestVerificationResult =
  | { ok: true; code: "sent" }
  | {
      ok: false;
      code:
        | "invalid_email"
        | "cooldown"
        | "rate_limited"
        | "already_verified"
        | "profile_missing"
        | "delivery_failed"
        | "unavailable";
    };

export type ConfirmVerificationResult =
  | { ok: true; code: "verified" }
  | {
      ok: false;
      code: "invalid_link" | "expired_link" | "used_link" | "unavailable";
    };

export type VerificationBackend = {
  issue: (
    participantId: string,
    militaryEmail: string,
    tokenHash: string,
  ) => Promise<IssueStatus>;
  consume: (
    participantId: string,
    tokenHash: string,
  ) => Promise<"verified" | "expired_link" | "used_link" | "invalid_link">;
  send: (
    militaryEmail: string,
    link: string,
    idempotencyKey: string,
  ) => Promise<void>;
};

export function normalizeMilitaryEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length <= 254 && MIL_EMAIL.test(normalized)
    ? normalized
    : null;
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Issues a new one-use token on the server and emails it only to a .mil address.
 * Token hash, rate limits and expiry are stored atomically by the database RPC.
 * The raw token is never returned to the browser or stored in the database.
 */
export async function requestMilitaryVerification(
  participantId: string,
  email: unknown,
  appOrigin: string,
  backend: VerificationBackend,
  createToken: () => string = () => randomBytes(32).toString("base64url"),
): Promise<RequestVerificationResult> {
  const militaryEmail = normalizeMilitaryEmail(email);
  if (!militaryEmail) return { ok: false, code: "invalid_email" };

  const token = createToken();
  if (!TOKEN.test(token)) throw new Error("Invalid server-generated token.");
  const hash = hashVerificationToken(token);

  let status: IssueStatus;
  try {
    status = await backend.issue(participantId, militaryEmail, hash);
  } catch {
    return { ok: false, code: "unavailable" };
  }

  if (status !== "issued") return { ok: false, code: status };

  const url = new URL("/verify", appOrigin);
  // The fragment is never sent to HTTP servers or consumed by email prefetchers.
  // The page only redeems it after an explicit user click.
  url.hash = new URLSearchParams({ token }).toString();

  try {
    await backend.send(militaryEmail, url.toString(), hash);
  } catch {
    return { ok: false, code: "delivery_failed" };
  }
  return { ok: true, code: "sent" };
}

/** Redeems a token only for the signed-in participant who requested it. */
export async function confirmMilitaryVerification(
  participantId: string,
  token: unknown,
  backend: Pick<VerificationBackend, "consume">,
): Promise<ConfirmVerificationResult> {
  if (typeof token !== "string" || !TOKEN.test(token))
    return { ok: false, code: "invalid_link" };

  try {
    const status = await backend.consume(
      participantId,
      hashVerificationToken(token),
    );
    return status === "verified"
      ? { ok: true, code: "verified" }
      : { ok: false, code: status };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
