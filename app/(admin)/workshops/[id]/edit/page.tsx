"use client";

import type { Workshop } from "@/types/workshop";
import type { SubmitEvent } from "react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  deleteWorkshop,
  fetchWorkshop,
  fetchWorkshopRegistrationCount,
  updateWorkshop,
} from "@/actions/supabase/queries/workshops";
import {
  MAX_WORKSHOP_CAPACITY,
  validateWorkshopForm,
} from "@/lib/workshop-form";

export default function EditWorkshopPage() {
  const { id } = useParams<{ id: string }>();

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadWorkshop() {
      setLoading(true);
      setError(null);
      setWorkshop(null);

      try {
        const data = await fetchWorkshop(id);
        const count = data ? await fetchWorkshopRegistrationCount(id) : 0;

        if (!ignore) {
          setWorkshop(data);
          setRegisteredCount(count);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Could not load workshop.",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadWorkshop();

    return () => {
      ignore = true;
    };
  }, [id]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    setSubmitting(true);

    try {
      await updateWorkshop(
        id,
        validateWorkshopForm(
          new FormData(event.currentTarget),
          registeredCount,
        ),
      );
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not update workshop.",
      );
      setSubmitting(false);
      return;
    }

    router.push("/workshops");
  }

  async function handleDelete() {
    if (!workshop || deleting || submitting) return;

    const confirmed = window.confirm(
      `Delete "${workshop.name}"? This action cannot be undone. Workshops with registration records (including cancelled registrations) cannot be deleted.`,
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteWorkshop(id);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete workshop.",
      );
      setDeleting(false);
      return;
    }

    router.push("/workshops");
  }

  if (loading) {
    return <p>Loading workshop...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!workshop) {
    return <p>Workshop not found.</p>;
  }

  return (
    <main>
      <h1>Edit workshop</h1>

      <p>
        {registeredCount} active registrations. Capacity cannot be lower than
        this count.
      </p>
      <p>
        Leave capacity blank for unlimited spots. Set it to 0 to close
        registration.
      </p>

      <form onSubmit={handleSubmit}>
        <fieldset disabled={submitting || deleting}>
          <div>
            <label htmlFor="name">Name (required)</label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={workshop.name}
              required
            />
          </div>

          <div>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              defaultValue={workshop.description ?? ""}
            />
          </div>

          <div>
            <label htmlFor="start_date">Start date</label>
            <input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={workshop.start_date?.slice(0, 10) ?? ""}
            />
          </div>

          <div>
            <label htmlFor="end_date">End date</label>
            <input
              id="end_date"
              name="end_date"
              type="date"
              defaultValue={workshop.end_date?.slice(0, 10) ?? ""}
            />
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
              defaultValue={workshop.capacity ?? ""}
            />
          </div>

          <div>
            <label htmlFor="location">Location</label>
            <input
              id="location"
              name="location"
              type="text"
              defaultValue={workshop.location ?? ""}
            />
          </div>

          {saveError && <p role="alert">{saveError}</p>}

          <button type="submit">
            {submitting ? "Saving..." : "Save changes"}
          </button>
        </fieldset>
      </form>
      {deleteError && <p role="alert">{deleteError}</p>}

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting || submitting}
      >
        {deleting ? "Deleting..." : "Delete workshop"}
      </button>
    </main>
  );
}
