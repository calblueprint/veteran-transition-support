"use client";

import type { PendingVerification } from "@/lib/id-verification-review";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createVerificationReview,
  ID_PHOTO_URL_SECONDS,
  skipVerification,
} from "@/lib/id-verification-review";
import { AFFILIATIONS } from "@/lib/participant-profile";
import { supabase } from "@/lib/supabase";
import styles from "./verification-queue.module.css";

const api = createVerificationReview(supabase);
const date = (value: string) => new Date(value).toLocaleString();

function ReviewDetail({
  submission,
  busy,
  onReview,
  onSkip,
}: {
  submission: PendingVerification;
  busy: boolean;
  onReview: (decision: "approve" | "reject", reason: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [reason, setReason] = useState("");
  useEffect(() => {
    let active = true;
    let expiry: ReturnType<typeof setTimeout>;
    api
      .photo(submission)
      .then(signedUrl => {
        if (!active) return;
        setUrl(signedUrl);
        setPhotoLoading(false);
        expiry = setTimeout(() => {
          setUrl(null);
        }, ID_PHOTO_URL_SECONDS * 1000);
      })
      .catch(() => {
        if (!active) return;
        setPhotoLoading(false);
        setPhotoError("Could not load the ID photo. Try refreshing it.");
      });
    return () => {
      active = false;
      clearTimeout(expiry);
    };
  }, [submission, refresh]);
  return (
    <section
      className={styles.detail}
      aria-labelledby="review-title"
      aria-busy={busy}
    >
      <h2 id="review-title">
        Review {submission.first_name} {submission.last_name}
      </h2>
      <p>Submitted {date(submission.created_at)}</p>
      {photoLoading && <p role="status">Loading private ID photo…</p>}
      {url && (
        // Private signed URLs must bypass the shared Next.js image optimizer/cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.photo}
          src={url}
          alt={`ID submitted by ${submission.first_name} ${submission.last_name}`}
          referrerPolicy="no-referrer"
          onError={() => {
            setUrl(null);
            setPhotoError(
              "The ID photo could not be displayed. Try refreshing it.",
            );
          }}
        />
      )}
      {photoError && <p role="alert">{photoError}</p>}
      {!url && !photoLoading && !photoError && <p>The photo link expired.</p>}
      <p className={styles.hint}>Photo links expire after 60 seconds.</p>
      <button
        disabled={photoLoading || busy}
        onClick={() => {
          setUrl(null);
          setPhotoError("");
          setPhotoLoading(true);
          setRefresh(value => value + 1);
        }}
      >
        Refresh photo
      </button>
      <form
        onSubmit={event => {
          event.preventDefault();
          void onReview("reject", reason);
        }}
      >
        <label htmlFor="rejection-reason">
          Rejection reason (required to reject)
        </label>
        <textarea
          id="rejection-reason"
          value={reason}
          onChange={event => setReason(event.target.value)}
          required
          maxLength={2000}
          disabled={busy}
          rows={3}
        />
        <div className={styles.actions}>
          <button
            type="button"
            disabled={busy || !url}
            onClick={() => void onReview("approve", "")}
          >
            Approve
          </button>
          <button type="submit" disabled={busy || !url || !reason.trim()}>
            Reject
          </button>
          <button type="button" disabled={busy} onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </form>
    </section>
  );
}

export function VerificationQueue() {
  const [queue, setQueue] = useState<PendingVerification[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const load = useCallback(
    () =>
      api
        .pending()
        .then(items => {
          setQueue(items);
          setSelectedId(null);
        })
        .catch(() => {
          setError(
            "Could not load submissions. Check your admin access and try again.",
          );
        })
        .finally(() => {
          setLoading(false);
        }),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const selected = queue.find(item => item.id === selectedId);
  async function review(decision: "approve" | "reject", reason: string) {
    if (!selected || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.review(selected.id, decision, reason);
      const remaining = queue.filter(item => item.id !== selected.id);
      setQueue(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setMessage(
        decision === "approve"
          ? "Submission approved. Participant is verified."
          : "Submission rejected. The participant can see your reason and resubmit.",
      );
    } catch {
      setError(
        "Could not save the review. It may have been handled by another admin. Refresh the queue before retrying.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <Link href="/workshops">Admin workshops</Link>
      <h1>ID verifications</h1>
      <p>
        Review pending ID submissions. Skipped submissions move to the end of
        this session’s queue.
      </p>
      <button
        disabled={loading || busy}
        onClick={() => {
          setLoading(true);
          setError("");
          void load();
        }}
      >
        Refresh queue
      </button>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
      {loading ? (
        <p role="status">Loading submissions…</p>
      ) : (
        <>
          {!queue.length && !error && <p>No pending submissions.</p>}
          {!!queue.length && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Affiliation</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map(item => (
                    <tr key={item.id}>
                      <td>
                        {item.first_name} {item.last_name}
                      </td>
                      <td>
                        {AFFILIATIONS.find(
                          option => option.value === item.affiliation,
                        )?.label ??
                          item.affiliation ??
                          "Not provided"}
                      </td>
                      <td>{date(item.created_at)}</td>
                      <td>
                        <button
                          disabled={busy}
                          aria-pressed={selectedId === item.id}
                          onClick={() => {
                            setSelectedId(item.id);
                            setError("");
                          }}
                        >
                          Review
                          <span className={styles.srOnly}>
                            {" "}
                            {item.first_name} {item.last_name}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selected && (
            <ReviewDetail
              key={selected.id}
              submission={selected}
              busy={busy}
              onReview={review}
              onSkip={() => {
                const reordered = skipVerification(queue, selected.id);
                setQueue(reordered);
                setSelectedId(reordered.length > 1 ? reordered[0].id : null);
                setError("");
                setMessage(
                  "Skipped for now. This submission remains pending and will cycle back.",
                );
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
