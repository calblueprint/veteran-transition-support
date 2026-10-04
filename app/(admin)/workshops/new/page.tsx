"use client";

import type { SubmitEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkshop } from "@/actions/supabase/queries/workshops";

export default function NewWorkshopPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    // These fields are text inputs, not file inputs.
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "");
    const endDate = String(formData.get("end_date") ?? "");
    const capacityText = String(formData.get("capacity") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();

    if (!name) {
      setError("Please enter a workshop name.");
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    const capacity = capacityText === "" ? null : Number(capacityText);

    if (
      capacity !== null &&
      (!Number.isInteger(capacity) || capacity < 0 || capacity > 2147483647)
    ) {
      setError("Capacity must be a whole number between 0 and 2,147,483,647.");
      return;
    }

    const workshop = {
      name,
      description: description || null,
      start_date: startDate || null,
      end_date: endDate || null,
      capacity,
      location: location || null,
    };

    setSubmitting(true);

    try {
      await createWorkshop(workshop);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create workshop.",
      );
      setSubmitting(false);
      return;
    }

    router.push("/workshops");
  }

  return (
    <main>
      <h1>Create workshop</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Name (required)</label>
          <input id="name" name="name" type="text" required />
        </div>

        <div>
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" />
        </div>

        <div>
          <label htmlFor="start_date">Start date</label>
          <input id="start_date" name="start_date" type="date" />
        </div>

        <div>
          <label htmlFor="end_date">End date</label>
          <input id="end_date" name="end_date" type="date" />
        </div>

        <div>
          <label htmlFor="capacity">Capacity</label>
          <input id="capacity" name="capacity" type="number" step="1" />
        </div>

        <div>
          <label htmlFor="location">Location</label>
          <input id="location" name="location" type="text" />
        </div>

        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create workshop"}
        </button>
      </form>
    </main>
  );
}
