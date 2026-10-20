import type { CreateWorkshopInput, Workshop } from "@/types/workshop";
import { workshopErrorMessage } from "@/lib/workshop-errors";
import supabase from "../client";

export async function fetchWorkshops(): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select("*")
    .order("start_date", { ascending: true, nullsFirst: false });

  if (error) throw new Error("Could not load workshops. Please try again.");
  return data;
}

export async function fetchWorkshop(id: string): Promise<Workshop | null> {
  const { data, error } = await supabase
    .from("workshops")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Malformed UUIDs should show the same not-found screen as missing rows.
  if (error?.code === "22P02") return null;
  if (error) throw new Error("Could not load workshop. Please try again.");
  return data;
}

export async function fetchWorkshopRegistrationCount(
  id: string,
): Promise<number> {
  // Count all active registrations, even when RLS hides other participants.
  const { data, error } = await supabase.rpc("workshop_registration_count", {
    target_workshop_id: id,
  });
  if (error || data === null) {
    throw new Error("Could not load available spots. Please refresh the page.");
  }
  return Number(data);
}

export async function createWorkshop(
  workshop: CreateWorkshopInput,
): Promise<void> {
  const { error } = await supabase.from("workshops").insert(workshop);
  if (error) {
    throw new Error(
      workshopErrorMessage(
        error,
        "Could not create workshop. Please try again.",
      ),
    );
  }
}

export async function updateWorkshop(
  id: string,
  workshop: CreateWorkshopInput,
): Promise<void> {
  const { data, error } = await supabase
    .from("workshops")
    .update(workshop)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      workshopErrorMessage(
        error,
        "Could not update workshop. Please try again.",
      ),
    );
  }
  if (!data)
    throw new Error(
      "Workshop not found or you don’t have permission to update it.",
    );
}

export async function deleteWorkshop(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("workshops")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      workshopErrorMessage(
        error,
        "Could not delete workshop. Please try again.",
      ),
    );
  }
  if (!data)
    throw new Error(
      "Workshop not found or you don’t have permission to delete it.",
    );
}
