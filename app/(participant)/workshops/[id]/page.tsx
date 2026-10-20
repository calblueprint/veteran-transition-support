"use client";

import type { Workshop } from "@/types/workshop";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  isRegisteredForWorkshop,
  registerForWorkshop,
} from "@/actions/supabase/queries/registrations";
import {
  fetchWorkshop,
  fetchWorkshopRegistrationCount,
} from "@/actions/supabase/queries/workshops";

export default function WorkshopDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const [registeredCount, setRegisteredCount] = useState(0);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadWorkshop() {
      setLoading(true);
      setError(null);
      setWorkshop(null);
      setRegistered(false);
      setRegistrationError(null);

      try {
        const data = await fetchWorkshop(id);
        // Invalid or missing workshops must not trigger registration queries.
        const [alreadyRegistered, count] = data
          ? await Promise.all([
              isRegisteredForWorkshop(id),
              fetchWorkshopRegistrationCount(id),
            ])
          : ([false, 0] as const);

        if (!ignore) {
          setWorkshop(data);
          setRegistered(alreadyRegistered);
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

  async function handleRegister() {
    if (
      registering ||
      registered ||
      !workshop ||
      (workshop.capacity !== null && registeredCount >= workshop.capacity)
    )
      return;

    setRegistering(true);
    setRegistrationError(null);

    try {
      await registerForWorkshop(id);
      setRegistered(true);
      setRegisteredCount(count => count + 1);
    } catch (err) {
      setRegistrationError(
        err instanceof Error ? err.message : "Could not register for workshop.",
      );
    } finally {
      // Refresh capacity after success or a race for the last available spot.
      try {
        const latest = await fetchWorkshop(id);
        const count = latest ? await fetchWorkshopRegistrationCount(id) : 0;
        setWorkshop(latest);
        setRegisteredCount(count);
        setRegistered(latest ? await isRegisteredForWorkshop(id) : false);
      } catch {
        setError(
          "Could not refresh workshop availability. Please reload the page.",
        );
      }
      setRegistering(false);
    }
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

  const remainingSpots =
    workshop.capacity === null
      ? null
      : Math.max(0, workshop.capacity - registeredCount);
  const full = remainingSpots === 0;

  return (
    <main>
      <h1>{workshop.name}</h1>

      <p>{workshop.description ?? "No description provided."}</p>

      <dl>
        <dt>Start date</dt>
        <dd>{workshop.start_date ?? "Not set"}</dd>

        <dt>End date</dt>
        <dd>{workshop.end_date ?? "Not set"}</dd>

        <dt>Location</dt>
        <dd>{workshop.location ?? "Not set"}</dd>

        <dt>Capacity</dt>
        <dd>{workshop.capacity ?? "Unlimited"}</dd>
        <dt>Remaining spots</dt>
        <dd>{remainingSpots ?? "Unlimited"}</dd>
      </dl>

      {registrationError && <p role="alert">{registrationError}</p>}

      {registered ? (
        <p role="status">You’re registered for this workshop.</p>
      ) : (
        <button
          type="button"
          onClick={handleRegister}
          disabled={registering || full}
        >
          {registering ? "Registering..." : full ? "Workshop full" : "Register"}
        </button>
      )}
    </main>
  );
}
