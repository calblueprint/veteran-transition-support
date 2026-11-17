"use client";

import type { Workshop, WorkshopSeries } from "@/types/workshop";
import type { SubmitEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  fetchSeries,
  fetchSeriesRegistrationTotal,
  fetchSeriesWorkshops,
  updateSeries,
  validateSeriesForm,
} from "@/actions/supabase/queries/series";

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [series, setSeries] = useState<WorkshopSeries | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [totalRegistrations, setTotalRegistrations] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadSeries() {
      setLoading(true);
      setError(null);
      setSeries(null);

      try {
        const data = await fetchSeries(id);
        // A missing series skips the workshop queries and shows "not found".
        const rows = data ? await fetchSeriesWorkshops(id) : [];
        const total = await fetchSeriesRegistrationTotal(rows);

        if (!ignore) {
          setSeries(data);
          setWorkshops(rows);
          setTotalRegistrations(total);
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
  }, [id]);

  async function handleSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaveError(null);
    setSaved(false);
    setSaving(true);

    try {
      const input = validateSeriesForm(new FormData(event.currentTarget));
      await updateSeries(id, input);
      setSeries(current => (current ? { ...current, ...input } : current));
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not update series.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading series...</p>;

  if (error) return <p role="alert">{error}</p>;

  if (!series) return <p>Series not found.</p>;

  return (
    <main>
      <Link href="/series">Back to series</Link>
      <h1>{series.name}</h1>

      <form onSubmit={handleSave}>
        <fieldset disabled={saving}>
          <div>
            <label htmlFor="name">Name (required)</label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={series.name}
              required
            />
          </div>
          <div>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              defaultValue={series.description ?? ""}
            />
          </div>
          {saveError && <p role="alert">{saveError}</p>}
          {saved && <p role="status">Series saved.</p>}
          <button type="submit">{saving ? "Saving..." : "Save changes"}</button>
        </fieldset>
      </form>

      <h2>Workshops</h2>
      <p>Total registrations across the series: {totalRegistrations}</p>

      {workshops.length === 0 ? (
        <p>No workshops in this series yet.</p>
      ) : (
        <ul>
          {workshops.map(workshop => (
            <li key={workshop.id}>
              <Link href={`/workshops/${workshop.id}/edit`}>
                {workshop.name}
              </Link>{" "}
              — {workshop.start_date ?? "Date not set"}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
