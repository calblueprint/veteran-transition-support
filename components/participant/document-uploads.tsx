"use client";

import type { DocumentKind, ParticipantDocument } from "@/lib/participant-data";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  downloadDocument,
  listDocuments,
  uploadDocument,
} from "@/actions/supabase/queries/participants";
import styles from "@/app/(participant)/profile/profile.module.css";
import { validateDocument } from "@/lib/participant-data";
import { UnverifiedBadge } from "./profile-fields";

/** Uploads are saved independently so profile edits are never lost on a file error. */
export function DocumentUploads({
  userId,
  verified,
  kind,
}: {
  userId: string;
  verified: boolean;
  kind: DocumentKind;
}) {
  const [documents, setDocuments] = useState<ParticipantDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const isResume = kind === "resumes";
  const title = isResume ? "Resumes" : "Supporting documents";

  useEffect(() => {
    let active = true;
    listDocuments(userId, kind)
      .then(files => {
        if (active) setDocuments(files);
      })
      .catch(() => {
        if (active)
          setLoadError("We couldn’t load your files. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, kind, attempt]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pending.current) return;
    setError("");
    setMessage("");
    const validationError = validateDocument(file, kind);
    if (validationError) {
      setError(validationError);
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const uploaded = await uploadDocument(userId, kind, file);
      setDocuments(current => [uploaded, ...current]);
      setMessage(`${uploaded.name} uploaded and saved.`);
    } catch {
      setError(
        "We couldn’t confirm the upload. Refresh the file list before retrying; your profile edits are unchanged.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function download(document: ParticipantDocument) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const blob = await downloadDocument(userId, document);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.name;
      link.click();
      // Give the browser time to start the download before releasing its blob.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("We couldn’t download this file. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function reload() {
    setLoading(true);
    setLoadError("");
    setAttempt(value => value + 1);
  }
  return (
    <section
      className={styles.uploadSection}
      aria-labelledby={`${kind}-heading`}
    >
      <h3 id={`${kind}-heading`}>
        {title} {!verified && <UnverifiedBadge />}
      </h3>
      {!verified && (
        <p id={`${kind}-verification`} className={styles.hint}>
          These files are unverified until you complete verification.
        </p>
      )}
      <p id={`${kind}-help`} className={styles.hint}>
        {isResume ? "PDF, DOC, or DOCX" : "PDF, DOC, DOCX, PNG, or JPEG"}, up to
        6 MB per file. Uploads save immediately. Files are private to your
        account.
      </p>
      <label htmlFor={`${kind}-file`}>
        Upload {isResume ? "a resume" : "a document"}
      </label>
      <input
        className={styles.fileInput}
        id={`${kind}-file`}
        type="file"
        accept={
          isResume ? ".pdf,.doc,.docx" : ".pdf,.doc,.docx,.png,.jpg,.jpeg"
        }
        disabled={busy || loading || Boolean(loadError)}
        aria-describedby={[
          `${kind}-help`,
          !verified ? `${kind}-verification` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onChange={upload}
      />
      {loading && <p role="status">Loading files…</p>}
      {busy && <p role="status">Working on your file…</p>}
      {loadError && (
        <p role="alert" className={styles.error}>
          {loadError}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p role="status" className={styles.success}>
        {message}
      </p>
      {!loading && !loadError && !documents.length && (
        <p>No {isResume ? "resumes" : "documents"} uploaded yet.</p>
      )}
      <ul className={styles.fileList}>
        {documents.map(document => (
          <li key={document.path}>
            <span>
              {document.name} {!verified && <UnverifiedBadge />}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void download(document);
              }}
              aria-label={`Download ${document.name}`}
            >
              Download
            </button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={busy || loading} onClick={reload}>
        Refresh {isResume ? "resumes" : "documents"}
      </button>
    </section>
  );
}
