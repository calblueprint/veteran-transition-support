"use client";

import type { Workshop } from "@/types/workshop";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMyWorkshops } from "@/actions/supabase/queries/registrations";

export default function MyWorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadWorkshops() {
      try {
        const data = await fetchMyWorkshops();

        if (!ignore) {
          setWorkshops(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load your workshops.",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadWorkshops();

    return () => {
      ignore = true;
    };
  }, []);

  if (loading) {
    return <p>Loading your workshops...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <h1>My workshops</h1>

      {workshops.length === 0 ? (
        <p>You haven’t registered for any workshops yet.</p>
      ) : (
        <ul>
          {workshops.map(workshop => (
            <li key={workshop.id}>
              <h2>
                <Link href={`/workshops/${workshop.id}`}>{workshop.name}</Link>
              </h2>
              <p>Start date: {workshop.start_date ?? "Not set"}</p>
              <p>End date: {workshop.end_date ?? "Not set"}</p>
              <p>Location: {workshop.location ?? "Not set"}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
