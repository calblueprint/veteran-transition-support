"use client";

import type { SubmitEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkshop } from "@/actions/supabase/queries/workshops";
import {
  MAX_WORKSHOP_CAPACITY,
  validateWorkshopForm,
} from "@/lib/workshop-form";

export default function NewWorkshopPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    setSubmitting(true);

    try {
      await createWorkshop(
        validateWorkshopForm(new FormData(event.currentTarget)),
      );
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
          <input
            id="capacity"
            name="capacity"
            type="number"
            step="1"
            min="0"
            max={MAX_WORKSHOP_CAPACITY}
          />
        </div>

        <p>
          Leave capacity blank for unlimited spots. Set it to 0 to close
          registration.
        </p>

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
