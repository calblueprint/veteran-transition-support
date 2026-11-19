"use client";

import type {
  IdVerificationStatus,
  IdVerificationSummary,
} from "@/lib/participant-data";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  fetchLatestIdVerification,
  submitIdVerification,
} from "@/actions/supabase/queries/participants";
import styles from "@/app/(participant)/profile/profile.module.css";
import { validateIdPhoto } from "@/lib/participant-data";

const STATUS_LABELS: Record<IdVerificationStatus, string> = {
  pending: "Pending review",
  manual_review: "Pending review",
  verified: "Verified",
  failed: "Rejected",
};

/** Shows the latest ID verification status and lets the participant upload an ID photo. */
export function IdVerification({
  userId,
  verified = false,
}: {
  userId: string;
  verified?: boolean;
}) {
  const [latest, setLatest] = useState<IdVerificationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const status = verified ? "verified" : (latest?.verification_status ?? null);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);

  // Load the status from the most recent id_verifications row.
  useEffect(() => {
    let active = true;
    fetchLatestIdVerification(userId)
      .then(result => {
        if (active) {
          setLatest(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setLoadError(
            "We couldn’t load your ID verification status. Please refresh the page.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    setMessage("");
    const input = event.currentTarget.elements.namedItem(
      "id_photo",
    ) as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setError("Choose a photo of your ID.");
      return;
    }
    // Check the file in the browser first, before any network request.
    const validationError = validateIdPhoto(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await submitIdVerification(userId, file);
      setLatest({ verification_status: "pending", rejection_reason: null });
      setOpen(false);
      setMessage("Your ID photo was submitted and is pending review.");
    } catch {
      setError("We couldn’t submit your ID photo. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  // A pending or verified submission needs no new upload; a failed (rejected) one can retry.
  const canSubmit =
    !loading && !loadError && (status === null || status === "failed");
  return (
    <div>
      <p>
        ID verification:{" "}
        <strong>
          {loading
            ? "Loading…"
            : loadError
              ? "Unavailable"
              : status
                ? STATUS_LABELS[status]
                : "Not submitted"}
        </strong>
      </p>
      {status === "failed" && latest?.rejection_reason && (
        <p>Reason: {latest.rejection_reason}</p>
      )}
      {loadError && (
        <p role="alert" className={styles.error}>
          {loadError}
        </p>
      )}
      {canSubmit && !open && (
        <button type="button" onClick={() => setOpen(true)}>
          {status === "failed" ? "Resubmit ID photo" : "Verify"}
        </button>
      )}
      {open && (
        <form onSubmit={submit}>
          <label htmlFor="id_photo">Photo of your military ID</label>
          <input
            className={styles.fileInput}
            id="id_photo"
            name="id_photo"
            type="file"
            accept=".png,.jpg,.jpeg"
            disabled={busy}
          />
          <p className={styles.hint}>
            PNG or JPEG, up to 6 MB. Files are private.
          </p>
          <button type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit ID photo"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p role="status" className={styles.success}>
        {message}
      </p>
    </div>
  );
}
