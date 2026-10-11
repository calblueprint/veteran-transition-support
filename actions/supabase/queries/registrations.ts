import type { Workshop } from "@/types/workshop";
import supabase from "../client";

export async function registerForWorkshop(workshopId: string): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Please log in to register for a workshop.");
  }

  const { error } = await supabase
    .from("registrations")
    .insert({
      participant_id: user.id,
      workshop_id: workshopId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not register for workshop: ${error.message}`);
  }
}

export async function isRegisteredForWorkshop(
  workshopId: string,
): Promise<boolean> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    if (authError.name === "AuthSessionMissingError") {
      return false;
    }

    throw new Error("Could not check your login status. Please try again.");
  }

  if (!user) return false;

  const { data, error } = await supabase
    .from("registrations")
    .select("id")
    .eq("participant_id", user.id)
    .eq("workshop_id", workshopId)
    .limit(1);

  if (error) {
    throw new Error(`Could not check registration: ${error.message}`);
  }

  return data.length > 0;
}

export async function fetchMyWorkshops(): Promise<Workshop[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Please log in to view your registered workshops.");
  }

  const { data, error } = await supabase
    .from("registrations")
    .select("workshop:workshops(*)")
    .eq("participant_id", user.id)
    .neq("attendance_status", "cancelled")
    .order("registration_date", { ascending: false })
    .returns<{ workshop: Workshop | null }[]>();

  if (error) {
    throw new Error(`Could not load your workshops: ${error.message}`);
  }

  return data.flatMap(row => (row.workshop ? [row.workshop] : []));
}
