import type {
  ParticipantProfile,
  ParticipantProfileInput,
} from "@/lib/participant-profile";
import supabase from "../client";

/** Require the current session to match the profile being accessed. */
async function requireParticipant(userId: string): Promise<void> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== userId) {
    throw new Error("Your session changed. Please log in again.");
  }
}

// Keep this projection aligned with ParticipantProfile; unrelated participant
// fields are neither needed by this page nor included in its edit controls.
const PROFILE_COLUMNS =
  "id,first_name,last_name,email,military_branch,rank,mos,service_start_date,service_end_date,education_level";

/**
 * Loads the authenticated participant's editable profile fields.
 * Returns null when no row is visible and propagates Supabase errors so the
 * caller can distinguish a failed request from an empty profile.
 */
export async function fetchParticipantProfile(
  userId: string,
): Promise<ParticipantProfile | null> {
  await requireParticipant(userId);

  const { data, error } = await supabase
    .from("participants")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle<ParticipantProfile>();

  if (error) throw error;
  return data;
}

/**
 * Inserts or updates the authenticated participant and returns the stored row.
 * Supabase errors propagate to the caller; a failed update is never retried as
 * an insert, which could hide an access error or a stale page state.
 *
 * @param userId Authenticated participant ID loaded by the profile page.
 * @param profile Editable fields normalized by validateProfile.
 * @param exists Whether the row was present at load time or has since been
 *     created by this page. Another session can invalidate this snapshot.
 */
export async function saveParticipantProfile(
  userId: string,
  profile: ParticipantProfileInput,
  exists: boolean,
  onboarding?: { phone_number: string; affiliation: string },
): Promise<ParticipantProfile> {
  await requireParticipant(userId);

  if (!exists) {
    if (!onboarding?.phone_number.trim() || !onboarding.affiliation) {
      throw new Error("Phone number and affiliation are required.");
    }

    // The deployed database permits these columns during initial INSERT.
    // Military and education details are saved through UPDATE afterward.
    const { error: createError } = await supabase.from("participants").insert({
      id: userId,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone_number: onboarding.phone_number.trim(),
      affiliation: onboarding.affiliation,
      verification_status: false,
    });
    if (createError) throw createError;
  }

  // Require the saved row so a denied/no-op update cannot look successful.
  const { data, error } = await supabase
    .from("participants")
    .update(profile)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single<ParticipantProfile>();

  if (error) throw error;
  return data;
}
