import type { CreateWorkshopInput, Workshop } from "@/types/workshop";
import { createEventbriteEvent } from "@/actions/eventbrite/createEventbriteEvent";
import supabase from "../client";

export async function fetchWorkshops(): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select("*")
    .order("start_date", {
      ascending: true,
      nullsFirst: false,
    });

  if (error) {
    throw new Error(`Could not load workshops: ${error.message}`);
  }

  return data;
}

export async function createWorkshop(
  workshop: CreateWorkshopInput,
): Promise<void> {
  // Save the workshop locally first, so it exists even if Eventbrite is down.
  const { data, error } = await supabase
    .from("workshops")
    .insert(workshop)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create workshop: ${error.message}`);
  }

  // Then try to create the matching Eventbrite event and save its id on the row.
  // Any failure here is only logged: the workshop is already saved.
  try {
    const eventbriteEventId = await createEventbriteEvent(workshop);

    const { error: updateError } = await supabase
      .from("workshops")
      .update({ eventbrite_event_id: eventbriteEventId })
      .eq("id", data.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } catch (err) {
    console.error(
      `[Eventbrite] Failed to sync workshop ${data.id} (${workshop.name}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
