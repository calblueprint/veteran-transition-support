"use client";

import type { Workshop } from "@/types/workshop";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchUpcomingWorkshops } from "@/actions/supabase/queries/workshops";

export default function EventsPage() {
  const [events, setEvents] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadEvents() {
      try {
        const data = await fetchUpcomingWorkshops();
        if (!ignore) setEvents(data);
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Could not load events.",
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadEvents();

    return () => {
      ignore = true;
    };
  }, []);

  if (loading) return <p role="status">Loading events...</p>;

  if (error) return <p role="alert">{error}</p>;

  return (
    <main>
      <h1>Upcoming events</h1>

      {events.length === 0 ? (
        <p>There are no upcoming events right now. Please check back soon.</p>
      ) : (
        <ul>
          {events.map(event => (
            <li key={event.id}>
              <h2>
                <Link href={`/events/${event.id}`}>{event.name}</Link>
              </h2>
              <p>Start date: {event.start_date ?? "Not set"}</p>
              <p>Location: {event.location ?? "Not set"}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
