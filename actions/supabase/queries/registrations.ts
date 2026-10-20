import type { Workshop } from "@/types/workshop";
import { workshopErrorMessage } from "@/lib/workshop-errors";
import supabase from "../client";

async function getCurrentUser(loginMessage?: string) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error("Could not check your login status. Please try again.");
  }
  if ((!user || error) && loginMessage) throw new Error(loginMessage);
  return error ? null : user;
}

export async function registerForWorkshop(workshopId: string): Promise<void> {
  const user = await getCurrentUser(
    "Please log in to register for a workshop.",
  );
  if (!user) return;

  const { data: participant, error: profileError } = await supabase
    .from("participants")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError)
    throw new Error(
      "Could not check your participant profile. Please try again.",
    );
  if (!participant)
    throw new Error(
      "Please complete your participant profile before registering for a workshop.",
    );

  // Only active registrations are unique; cancelled history is preserved.
  const { error } = await supabase.from("registrations").insert({
    participant_id: user.id,
    workshop_id: workshopId,
  });
  if (error) {
    throw new Error(
      workshopErrorMessage(
        error,
        "Could not register for workshop. Please try again.",
      ),
    );
  }
}

export async function isRegisteredForWorkshop(
  workshopId: string,
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("registrations")
    .select("id")
    .eq("participant_id", user.id)
    .eq("workshop_id", workshopId)
    .or("attendance_status.is.null,attendance_status.neq.cancelled")
    .limit(1);
  if (error) throw new Error("Could not check registration. Please try again.");
  return data.length > 0;
}

export async function fetchMyWorkshops(): Promise<Workshop[]> {
  const user = await getCurrentUser(
    "Please log in to view your registered workshops.",
  );
  if (!user) return [];
  const { data, error } = await supabase
    .from("registrations")
    .select("workshop:workshops(*)")
    .eq("participant_id", user.id)
    .or("attendance_status.is.null,attendance_status.neq.cancelled")
    .order("registration_date", { ascending: false })
    .returns<{ workshop: Workshop | null }[]>();
  if (error)
    throw new Error("Could not load your workshops. Please try again.");
  return data.flatMap(row => (row.workshop ? [row.workshop] : []));
}
