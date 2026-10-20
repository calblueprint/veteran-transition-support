"use client";

import type { Workshop } from "@/types/workshop";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWorkshops } from "@/actions/supabase/queries/workshops";

export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadWorkshops() {
      try {
        const rows = await fetchWorkshops();

        if (!ignore) {
          setWorkshops(rows);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Could not load workshops.",
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
    return <p>Loading workshops...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <h1>Workshops</h1>

      {workshops.length === 0 ? (
        <p>No workshops yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Start date</th>
              <th scope="col">End date</th>
              <th scope="col">Capacity</th>
              <th scope="col">Location</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workshops.map(workshop => (
              <tr key={workshop.id}>
                <td>{workshop.name}</td>
                <td>{workshop.start_date ?? "Not set"}</td>
                <td>{workshop.end_date ?? "Not set"}</td>
                <td>{workshop.capacity ?? "Not set"}</td>
                <td>{workshop.location ?? "Not set"}</td>
                <td>
                  <Link href={`/workshops/${workshop.id}/edit`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
