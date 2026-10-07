import type {
  ParticipantProfile,
  ParticipantProfileInput,
} from "@/lib/participant-profile";
import supabase from "../client";

/**
 * Shared development identity required by Sprint 1 until auth is connected.
 * Replace it with the authenticated participant ID when adding auth support.
 */
export const TEST_PARTICIPANT_ID = "e591e956-fb53-41f2-9b28-fc7881ba6c56";

// Keep this projection aligned with ParticipantProfile; unrelated participant
// fields are neither needed by this page nor included in its edit controls.
const PROFILE_COLUMNS =
  "id,first_name,last_name,email,military_branch,rank,mos,service_start_date,service_end_date,education_level";

/**
 * Loads the development participant's editable profile fields.
 * Returns null when no row is visible and propagates Supabase errors so the
 * caller can distinguish a failed request from an empty profile.
 */
export async function fetchParticipantProfile(): Promise<ParticipantProfile | null> {
  const { data, error } = await supabase
    .from("participants")
    .select(PROFILE_COLUMNS)
    .eq("id", TEST_PARTICIPANT_ID)
    .maybeSingle<ParticipantProfile>();

  if (error) throw error;
  return data;
}

/**
 * Inserts or updates the development participant and returns the stored row.
 * Supabase errors propagate to the caller; a failed update is never retried as
 * an insert, which could hide an access error or a stale page state.
 *
 * @param profile Editable fields normalized by validateProfile.
 * @param exists Whether the row was present at load time or has since been
 *     created by this page. Another session can invalidate this snapshot.
 */
export async function saveParticipantProfile(
  profile: ParticipantProfileInput,
  exists: boolean,
): Promise<ParticipantProfile> {
  const query = exists
    ? supabase
        .from("participants")
        .update(profile)
        .eq("id", TEST_PARTICIPANT_ID)
    : supabase
        .from("participants")
        .insert({ ...profile, id: TEST_PARTICIPANT_ID });

  // Require the saved row so a denied/no-op update cannot look successful.
  const { data, error } = await query
    .select(PROFILE_COLUMNS)
    .single<ParticipantProfile>();

  if (error) throw error;
  return data;
}
