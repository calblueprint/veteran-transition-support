"use client";

import type { WorkshopRegistration } from "@/actions/supabase/queries/registrations";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  cancelWorkshopRegistration,
  fetchMyWorkshops,
} from "@/actions/supabase/queries/registrations";
import { isPastWorkshop } from "@/lib/workshop-registration";

export default function MyWorkshopsPage() {
  const [registrations, setRegistrations] = useState<WorkshopRegistration[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelPending = useRef(false);

  useEffect(() => {
    let ignore = false;

    async function loadWorkshops() {
      try {
        const rows = await fetchMyWorkshops();
        if (!ignore) setRegistrations(rows);
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load your workshops.",
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadWorkshops();
    return () => {
      ignore = true;
    };
  }, [attempt]);

  async function handleCancel(registrationId: string) {
    if (cancelPending.current) return;
    cancelPending.current = true;
    setCancelingId(registrationId);
    setCancelError(null);
    try {
      await cancelWorkshopRegistration(registrationId);
      // Cancelled registrations no longer occupy a place or appear in this list.
      setRegistrations(rows => rows.filter(row => row.id !== registrationId));
    } catch (err) {
      setCancelError(
        err instanceof Error
          ? err.message
          : "Could not cancel registration. Please try again.",
      );
    } finally {
      setCancelingId(null);
      cancelPending.current = false;
    }
  }

  if (loading) return <p role="status">Loading your workshops...</p>;
  if (error)
    return (
      <main>
        <h1>My workshops</h1>
        <p role="alert">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setLoading(true);
            setAttempt(value => value + 1);
          }}
        >
          Try again
        </button>
      </main>
    );

  const now = new Date();
  const upcoming = registrations.filter(
    row => !isPastWorkshop(row.workshop, now),
  );
  const past = registrations.filter(row => isPastWorkshop(row.workshop, now));

  function section(
    title: string,
    rows: WorkshopRegistration[],
    canCancel: boolean,
  ) {
    return (
      <section aria-label={title}>
        <h2>{title}</h2>
        {rows.length === 0 ? (
          <p>No {title.toLowerCase()} workshops.</p>
        ) : (
          <ul>
            {rows.map(({ id, workshop }) => (
              <li key={id}>
                <h3>
                  <Link href={`/workshops/${workshop.id}`}>
                    {workshop.name}
                  </Link>
                </h3>
                <p>Start date: {workshop.start_date ?? "Not set"}</p>
                <p>End date: {workshop.end_date ?? "Not set"}</p>
                <p>Location: {workshop.location ?? "Not set"}</p>
                {canCancel && (
                  <button
                    type="button"
                    disabled={cancelingId !== null}
                    onClick={() => void handleCancel(id)}
                    aria-label={`Cancel registration for ${workshop.name}`}
                  >
                    {cancelingId === id
                      ? "Cancelling..."
                      : "Cancel registration"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <main>
      <h1>My workshops</h1>
      {cancelError && <p role="alert">{cancelError}</p>}
      {registrations.length === 0 && (
        <p>You haven’t registered for any active workshops yet.</p>
      )}
      {section("Upcoming", upcoming, true)}
      {section("Past", past, false)}
    </main>
  );
}
