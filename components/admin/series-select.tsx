"use client";

import type { WorkshopSeries } from "@/types/workshop";
import { useEffect, useState } from "react";
import { fetchSeriesList } from "@/actions/supabase/queries/series";

// Optional "Series" dropdown for the workshop forms.
// While series load (or if loading fails) a hidden input keeps the current
// value, so saving the form can never silently remove a workshop from its series.
export function SeriesSelect({ defaultValue = "" }: { defaultValue?: string }) {
  const [series, setSeries] = useState<WorkshopSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetchSeriesList()
      .then(rows => {
        if (!ignore) setSeries(rows);
      })
      .catch(err => {
        if (!ignore)
          setError(
            err instanceof Error ? err.message : "Could not load series.",
          );
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (!series) {
    return (
      <div>
        <input type="hidden" name="series_id" value={defaultValue} />
        {error ? (
          <p role="alert">{error} The series will stay unchanged.</p>
        ) : (
          <p>Loading series...</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="series_id">Series</label>
      <select id="series_id" name="series_id" defaultValue={defaultValue}>
        <option value="">No series</option>
        {series.map(item => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}
