"use client";

import type {
  AttendanceChoice,
  Registrant,
  WorkshopAttendance,
} from "@/lib/workshop-attendance";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  attendanceCsv,
  attendanceLabels,
  attendanceStats,
  loadWorkshopAttendance,
  registrantName,
  saveWorkshopAttendance,
} from "@/lib/workshop-attendance";
import styles from "./workshop-attendance.module.css";

export default function WorkshopAttendanceContent({
  workshopId,
}: {
  workshopId: string;
}) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  if (authLoading)
    return (
      <main className={styles.page}>
        <p role="status">Checking admin access…</p>
      </main>
    );
  if (!user || !isAdmin)
    return (
      <main className={styles.page}>
        <h1>Admin access required</h1>
        <p>Sign in with an admin account to manage attendance.</p>
        <Link href="/login">Sign in</Link>
      </main>
    );
  return (
    <AttendanceRoster
      key={`${user.id}:${workshopId}`}
      workshopId={workshopId}
      userId={user.id}
    />
  );
}

function AttendanceRoster({
  workshopId,
  userId,
}: {
  workshopId: string;
  userId: string;
}) {
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    workshopId: string;
    data: WorkshopAttendance | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const generation = useRef(0);
  const locked = useRef(false);

  async function refresh() {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await loadWorkshopAttendance(supabase, workshopId);
      if (request === generation.current) {
        setSnapshot({ owner: userId, workshopId, data });
        setNeedsRefresh(false);
      }
    } catch (err) {
      if (request === generation.current) {
        setError(
          err instanceof Error ? err.message : "Could not load attendance.",
        );
        setNeedsRefresh(true);
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    const request = ++generation.current;
    void loadWorkshopAttendance(supabase, workshopId)
      .then(data => {
        if (request === generation.current)
          setSnapshot({ owner: userId, workshopId, data });
      })
      .catch(err => {
        if (request === generation.current) {
          setError(
            err instanceof Error ? err.message : "Could not load attendance.",
          );
          setNeedsRefresh(true);
        }
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => {
      generation.current += 1;
    };
  }, [userId, workshopId]);

  async function markAttendance(
    registrant: Registrant,
    status: AttendanceChoice,
  ) {
    if (locked.current || loading || needsRefresh) return;
    locked.current = true;
    const request = ++generation.current;
    setSaving(registrant.id);
    setError("");
    setMessage("");
    let saved = false;
    try {
      await saveWorkshopAttendance(supabase, workshopId, registrant, status);
      saved = true;
      const data = await loadWorkshopAttendance(supabase, workshopId);
      if (request === generation.current) {
        setSnapshot({ owner: userId, workshopId, data });
        setMessage(
          `${registrantName(registrant)}: ${attendanceLabels[status].toLowerCase()}. Attendance saved.`,
        );
      }
    } catch (err) {
      if (request === generation.current) {
        setNeedsRefresh(true);
        setError(
          saved
            ? "Attendance was saved, but the roster could not refresh. Refresh to see the latest numbers."
            : err instanceof Error
              ? err.message
              : "Could not save attendance. Please refresh and try again.",
        );
      }
    } finally {
      locked.current = false;
      setSaving(null);
    }
  }

  const data =
    snapshot && snapshot.owner === userId && snapshot.workshopId === workshopId
      ? snapshot.data
      : undefined;
  const busy = loading || saving !== null;
  const stats = data ? attendanceStats(data) : null;

  function exportCsv() {
    if (!data || busy || needsRefresh) return;
    const url = URL.createObjectURL(
      new Blob([attendanceCsv(data)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `workshop-${workshopId}-attendance.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className={styles.page}>
      <Link href="/workshops" className={styles.back}>
        ← All workshops
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workshop attendance</p>
          <h1>{data?.workshop.name ?? "Attendance"}</h1>
          {data && (
            <p className={styles.meta}>
              {data.workshop.start_date ?? "Date not set"}
              {data.workshop.end_date &&
              data.workshop.end_date !== data.workshop.start_date
                ? ` – ${data.workshop.end_date}`
                : ""}{" "}
              · {data.workshop.location ?? "Location not set"}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => void refresh()} disabled={busy}>
            {loading ? "Refreshing…" : "Refresh roster"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || busy || needsRefresh}
          >
            Export CSV
          </button>
        </div>
      </header>
      <div aria-live="polite" role="status">
        {message && <p className={styles.success}>{message}</p>}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {loading && <p role="status">Loading attendance…</p>}
      {!loading && data === null && (
        <p>Workshop not found. It may have been removed.</p>
      )}
      {data && stats && (
        <>
          <dl
            className={styles.stats}
            aria-label="Workshop statistics"
            aria-busy={busy}
          >
            <div>
              <dt>Registered</dt>
              <dd>{stats.registered}</dd>
            </div>
            <div>
              <dt>Attended</dt>
              <dd>{stats.attended}</dd>
            </div>
            <div>
              <dt>No-show</dt>
              <dd>{stats.noShow}</dd>
            </div>
            <div>
              <dt>Cancelled</dt>
              <dd>{stats.cancelled}</dd>
            </div>
            <div>
              <dt>Capacity filled</dt>
              <dd>
                {stats.capacityFilled === null
                  ? "Unlimited"
                  : `${stats.capacityFilled}%`}
              </dd>
              <span>
                {data.workshop.capacity === null
                  ? `${stats.registered} registered`
                  : `${stats.registered} / ${data.workshop.capacity} places`}
              </span>
            </div>
          </dl>
          <p className={styles.note}>
            Registered includes everyone except cancelled registrations.
            Attendance does not free a place. Cancelled records remain in the
            history.
          </p>
          <section
            className={styles.roster}
            aria-labelledby="registrants-heading"
            aria-busy={busy}
          >
            <div className={styles.rosterHeader}>
              <h2 id="registrants-heading">Registrants</h2>
              <span>{data.registrants.length} records</span>
            </div>
            {data.registrants.length === 0 ? (
              <p className={styles.empty}>
                No registrations yet. Registrants will appear here after they
                sign up.
              </p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <caption className={styles.srOnly}>
                    Workshop registrants and attendance controls
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Status</th>
                      <th scope="col">Mark attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.registrants.map(registrant => {
                      const status =
                        registrant.attendance_status ?? "registered";
                      return (
                        <tr key={registrant.id}>
                          <th scope="row">{registrantName(registrant)}</th>
                          <td>
                            <span className={styles.badge} data-status={status}>
                              {attendanceLabels[status]}
                            </span>
                          </td>
                          <td>
                            {status === "cancelled" ? (
                              <span className={styles.muted}>
                                Cancelled registration
                              </span>
                            ) : (
                              <div
                                className={styles.rowActions}
                                role="group"
                                aria-label={`Attendance for ${registrantName(registrant)}`}
                              >
                                {(
                                  ["attended", "no_show", "registered"] as const
                                ).map(choice => (
                                  <button
                                    key={choice}
                                    type="button"
                                    aria-pressed={status === choice}
                                    disabled={
                                      busy || needsRefresh || status === choice
                                    }
                                    onClick={() =>
                                      void markAttendance(registrant, choice)
                                    }
                                  >
                                    {choice === "registered"
                                      ? "Clear mark"
                                      : attendanceLabels[choice]}
                                  </button>
                                ))}
                                {saving === registrant.id && (
                                  <span role="status">Saving…</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
