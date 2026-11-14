import type { Workshop } from "@/types/workshop";
import {
  UNVERIFIED_WORKSHOP_MESSAGE,
  workshopErrorMessage,
} from "@/lib/workshop-errors";
import supabase from "../client";

export type WorkshopRegistrationEligibility =
  "verified" | "unverified" | "profile-missing" | "signed-out";

export type WorkshopRegistration = {
  id: string;
  workshop: Workshop;
};

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

async function getEligibilityForUser(
  userId: string,
): Promise<WorkshopRegistrationEligibility> {
  const { data, error } = await supabase
    .from("participants")
    .select("verification_status")
    .eq("id", userId)
    .maybeSingle<{ verification_status: boolean }>();

  if (error)
    throw new Error(
      "Could not check your participant profile. Please try again.",
    );
  if (!data) return "profile-missing";
  return data.verification_status === true ? "verified" : "unverified";
}

export async function fetchWorkshopRegistrationEligibility(): Promise<WorkshopRegistrationEligibility> {
  const user = await getCurrentUser();
  return user ? getEligibilityForUser(user.id) : "signed-out";
}

export async function registerForWorkshop(workshopId: string): Promise<void> {
  const user = await getCurrentUser(
    "Please log in to register for a workshop.",
  );
  if (!user) return;

  const eligibility = await getEligibilityForUser(user.id);
  if (eligibility === "profile-missing")
    throw new Error(
      "Please complete your participant profile before registering for a workshop.",
    );
  if (eligibility !== "verified") throw new Error(UNVERIFIED_WORKSHOP_MESSAGE);

  // The database trigger also checks verification on every INSERT, including
  // direct API calls and any registration made after this client-side check.
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

export async function fetchMyWorkshops(): Promise<WorkshopRegistration[]> {
  const user = await getCurrentUser(
    "Please log in to view your registered workshops.",
  );
  if (!user) return [];
  const { data, error } = await supabase
    .from("registrations")
    .select("id,workshop:workshops(*)")
    .eq("participant_id", user.id)
    .or("attendance_status.is.null,attendance_status.neq.cancelled")
    .order("registration_date", { ascending: false })
    .returns<{ id: string; workshop: Workshop | null }[]>();
  if (error)
    throw new Error("Could not load your workshops. Please try again.");
  return data.flatMap(row =>
    row.workshop ? [{ id: row.id, workshop: row.workshop }] : [],
  );
}

/** Cancel only the signed-in participant's still-active registration. */
export async function cancelWorkshopRegistration(
  registrationId: string,
): Promise<void> {
  const user = await getCurrentUser(
    "Please log in to cancel a workshop registration.",
  );
  if (!user) return;

  const { count, error } = await supabase
    .from("registrations")
    .update({ attendance_status: "cancelled" }, { count: "exact" })
    .eq("id", registrationId)
    .eq("participant_id", user.id)
    .or("attendance_status.is.null,attendance_status.neq.cancelled");

  if (error)
    throw new Error(
      workshopErrorMessage(
        error,
        "Could not cancel registration. Please try again.",
      ),
    );
  if (count !== 1)
    throw new Error(
      "This registration is no longer active. Refresh your workshops and try again.",
    );
}
