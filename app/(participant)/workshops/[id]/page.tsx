"use client";

import type { Workshop } from "@/types/workshop";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  isRegisteredForWorkshop,
  registerForWorkshop,
} from "@/actions/supabase/queries/registrations";
import { fetchWorkshop } from "@/actions/supabase/queries/workshops";

export default function WorkshopDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
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
        const [data, alreadyRegistered] = await Promise.all([
          fetchWorkshop(id),
          isRegisteredForWorkshop(id),
        ]);

        if (!ignore) {
          setWorkshop(data);
          setRegistered(alreadyRegistered);
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
    if (registering || registered) return;

    setRegistering(true);
    setRegistrationError(null);

    try {
      await registerForWorkshop(id);
      setRegistered(true);
    } catch (err) {
      setRegistrationError(
        err instanceof Error ? err.message : "Could not register for workshop.",
      );
    } finally {
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
        <dd>{workshop.capacity ?? "Not set"}</dd>
      </dl>

      {registrationError && <p role="alert">{registrationError}</p>}

      {registered ? (
        <p role="status">You’re registered for this workshop.</p>
      ) : (
        <button type="button" onClick={handleRegister} disabled={registering}>
          {registering ? "Registering..." : "Register"}
        </button>
      )}
    </main>
  );
}
