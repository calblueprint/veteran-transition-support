"use client";

import type { SeriesWithCount } from "@/actions/supabase/queries/series";
import type { SubmitEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createSeries,
  fetchSeriesWithCounts,
  validateSeriesForm,
} from "@/actions/supabase/queries/series";

export default function SeriesPage() {
  const [series, setSeries] = useState<SeriesWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Bumping this reloads the list after a series is created.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadSeries() {
      try {
        const rows = await fetchSeriesWithCounts();
        if (!ignore) {
          setSeries(rows);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Could not load series.",
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadSeries();

    return () => {
      ignore = true;
    };
  }, [reloads]);

  async function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setCreateError(null);
    setSubmitting(true);

    const form = event.currentTarget;
    try {
      await createSeries(validateSeriesForm(new FormData(form)));
      form.reset();
      setReloads(count => count + 1);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not create series.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading series...</p>;

  return (
    <main>
      <h1>Series</h1>

      <form onSubmit={handleCreate}>
        <h2>Create series</h2>
        <div>
          <label htmlFor="name">Name (required)</label>
          <input id="name" name="name" type="text" required />
        </div>
        <div>
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" />
        </div>
        {createError && <p role="alert">{createError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create series"}
        </button>
      </form>

      {error ? (
        <p role="alert">{error}</p>
      ) : series.length === 0 ? (
        <p>No series yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Workshops</th>
            </tr>
          </thead>
          <tbody>
            {series.map(item => (
              <tr key={item.id}>
                <td>
                  <Link href={`/series/${item.id}`}>{item.name}</Link>
                </td>
                <td>{item.workshop_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
