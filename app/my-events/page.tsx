"use client";

import type { MyEvent } from "@/lib/my-events";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ParticipantAccess } from "@/components/participant/participant-access";
import { createMyEventsData, localToday, splitEvents } from "@/lib/my-events";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

const api = createMyEventsData(supabase);

function MyEvents({ userId }: { userId: string }) {
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState("");
  const [message, setMessage] = useState("");
  const [today, setToday] = useState(localToday);
  const busy = useRef(false);
  const mounted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);
  const keepRegistration = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) keepRegistration.current?.focus();
  }, [confirming]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setToday(localToday()), 30_000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    api
      .list(userId)
      .then(data => {
        if (active) setEvents(data);
      })
      .catch(() => {
        if (active) setError("Could not load your events. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  function refresh() {
    setLoading(true);
    setError("");
    setCancelError("");
    setMessage("");
    setConfirming(null);
    setAttempt(value => value + 1);
  }

  async function cancel(event: MyEvent) {
    if (busy.current) return;
    busy.current = true;
    setPending(event.id);
    setCancelError("");
    setMessage("");
    try {
      await api.cancel(userId, event.id);
      if (!mounted.current) return;
      setEvents(rows => rows.filter(row => row.id !== event.id));
      setMessage(`Registration for ${event.workshop.name} cancelled.`);
      setConfirming(null);
      heading.current?.focus();
    } catch (err) {
      if (mounted.current)
        setCancelError(
          err instanceof Error
            ? err.message
            : "Could not cancel your registration.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  }

  const { upcoming, past } = splitEvents(events, today);
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Participant navigation">
        <Link href="/profile">Profile</Link>
        <Link href="/workshops">Browse events</Link>
      </nav>
      <header className={styles.header}>
        <div>
          <h1 ref={heading} tabIndex={-1}>
            My Events
          </h1>
          <p>Your registered workshops, all in one place.</p>
        </div>
        <button
          type="button"
          disabled={loading || pending !== null}
          onClick={refresh}
        >
          Refresh events
        </button>
      </header>
      <p role="status" className={message ? styles.success : undefined}>
        {message}
      </p>
      {cancelError && (
        <p role="alert" className={styles.error}>
          {cancelError}
        </p>
      )}
      {loading ? (
        <p role="status">Loading your events…</p>
      ) : error ? (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button type="button" onClick={refresh}>
            Try again
          </button>
        </div>
      ) : (
        <>
          {!events.length && (
            <p className={styles.empty}>
              You haven’t registered for any events yet.{" "}
              <Link href="/workshops">Browse events</Link> to get started.
            </p>
          )}
          {[
            { title: "Upcoming", rows: upcoming },
            { title: "Past", rows: past },
          ].map(({ title, rows }) => (
            <section key={title} aria-label={title} className={styles.section}>
              <h2>
                {title} <span className={styles.count}>({rows.length})</span>
              </h2>
              {!rows.length ? (
                <p className={styles.empty}>No {title.toLowerCase()} events.</p>
              ) : (
                <ul className={styles.list}>
                  {rows.map(event => (
                    <li key={event.id} className={styles.card}>
                      <h3>
                        <Link href={`/workshops/${event.workshop.id}`}>
                          {event.workshop.name}
                        </Link>
                      </h3>
                      <p className={styles.meta}>
                        {event.workshop.start_date ? (
                          <time dateTime={event.workshop.start_date}>
                            {event.workshop.start_date}
                          </time>
                        ) : (
                          "Date to be announced"
                        )}
                        {event.workshop.end_date &&
                          event.workshop.end_date !==
                            event.workshop.start_date && (
                            <>
                              {" "}
                              –{" "}
                              <time dateTime={event.workshop.end_date}>
                                {event.workshop.end_date}
                              </time>
                            </>
                          )}
                      </p>
                      <p className={styles.meta}>
                        {event.workshop.location || "Location to be announced"}
                      </p>
                      {title === "Upcoming" && (
                        <>
                          <button
                            className={styles.cancel}
                            type="button"
                            disabled={pending !== null}
                            onClick={click => {
                              confirmTrigger.current = click.currentTarget;
                              setConfirming(event.id);
                              setCancelError("");
                              setMessage("");
                            }}
                            aria-expanded={confirming === event.id}
                            aria-controls={
                              confirming === event.id
                                ? `cancel-${event.id}`
                                : undefined
                            }
                            aria-label={`Cancel registration for ${event.workshop.name}`}
                          >
                            Cancel registration
                          </button>
                          {confirming === event.id && (
                            <div
                              className={styles.confirmation}
                              id={`cancel-${event.id}`}
                            >
                              <p>
                                Cancel your registration for{" "}
                                {event.workshop.name}?
                              </p>
                              <div className={styles.confirmActions}>
                                <button
                                  type="button"
                                  ref={keepRegistration}
                                  disabled={pending !== null}
                                  onClick={() => {
                                    setConfirming(null);
                                    confirmTrigger.current?.focus();
                                  }}
                                >
                                  Keep registration
                                </button>
                                <button
                                  type="button"
                                  disabled={pending !== null}
                                  onClick={() => void cancel(event)}
                                >
                                  {pending === event.id
                                    ? "Cancelling…"
                                    : "Yes, cancel registration"}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}

export default function MyEventsPage() {
  return (
    <ParticipantAccess>
      {user => <MyEvents key={user.id} userId={user.id} />}
    </ParticipantAccess>
  );
}
