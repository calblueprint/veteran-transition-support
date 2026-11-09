import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workshop } from "../types/workshop";

export type MyEvent = { id: string; workshop: Workshop };

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isPastEvent(workshop: Workshop, today = localToday()): boolean {
  // Workshop dates are SQL DATE values. An event stays upcoming through its
  // final calendar day, including multi-day events that have already started.
  const lastDay = workshop.end_date ?? workshop.start_date;
  return lastDay !== null && lastDay < today;
}

export function splitEvents(events: MyEvent[], today = localToday()) {
  const upcoming = events.filter(event => !isPastEvent(event.workshop, today));
  const past = events.filter(event => isPastEvent(event.workshop, today));
  upcoming.sort((a, b) =>
    (a.workshop.start_date ?? "9999").localeCompare(
      b.workshop.start_date ?? "9999",
    ),
  );
  past.sort((a, b) =>
    (b.workshop.end_date ?? b.workshop.start_date ?? "").localeCompare(
      a.workshop.end_date ?? a.workshop.start_date ?? "",
    ),
  );
  return { upcoming, past };
}

/** Bind every operation to the account whose page is currently mounted. */
export function createMyEventsData(client: SupabaseClient) {
  async function authenticate(expectedUserId: string) {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.id !== expectedUserId)
      throw new Error("Your session changed. Please sign in again.");
    return user.id;
  }

  async function list(expectedUserId: string): Promise<MyEvent[]> {
    const userId = await authenticate(expectedUserId);
    const { data, error } = await client
      .from("registrations")
      .select("id, workshop:workshops(*)")
      .eq("participant_id", userId)
      .or("attendance_status.is.null,attendance_status.neq.cancelled")
      .returns<{ id: string; workshop: Workshop | null }[]>();
    if (error) throw new Error("Could not load your events. Please try again.");
    return data.flatMap(row =>
      row.workshop ? [{ id: row.id, workshop: row.workshop }] : [],
    );
  }

  async function cancel(
    expectedUserId: string,
    registrationId: string,
  ): Promise<void> {
    const events = await list(expectedUserId);
    const event = events.find(row => row.id === registrationId);
    if (!event)
      throw new Error(
        "This registration is no longer available. Refresh your events.",
      );
    if (isPastEvent(event.workshop))
      throw new Error("Past events cannot be cancelled.");
    await authenticate(expectedUserId);
    const { data, error } = await client
      .from("registrations")
      .update({ attendance_status: "cancelled" })
      .eq("id", registrationId)
      .eq("participant_id", expectedUserId)
      .or("attendance_status.is.null,attendance_status.neq.cancelled")
      .select("id");
    if (error || !data?.length)
      throw new Error(
        "Could not cancel your registration. Please refresh and try again.",
      );
  }
  return { list, cancel };
}
