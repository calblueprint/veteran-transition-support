import type {
  ParticipantProfile,
  ParticipantProfileInput,
} from "@/lib/participant-profile";
import supabase from "../client";

// Sprint 1: replace this shared test ID with the authenticated participant ID.
export const TEST_PARTICIPANT_ID = "e591e956-fb53-41f2-9b28-fc7881ba6c56";

const PROFILE_COLUMNS =
  "id,first_name,last_name,email,military_branch,rank,mos,service_start_date,service_end_date,education_level";

export async function fetchParticipantProfile() {
  const { data, error } = await supabase
    .from("participants")
    .select(PROFILE_COLUMNS)
    .eq("id", TEST_PARTICIPANT_ID)
    .maybeSingle<ParticipantProfile>();

  if (error) throw error;
  return data;
}

export async function saveParticipantProfile(
  profile: ParticipantProfileInput,
  exists: boolean,
) {
  const query = exists
    ? supabase
        .from("participants")
        .update(profile)
        .eq("id", TEST_PARTICIPANT_ID)
    : supabase
        .from("participants")
        .insert({ id: TEST_PARTICIPANT_ID, ...profile });

  // Require the saved row so a denied/no-op update cannot look successful.
  const { data, error } = await query
    .select(PROFILE_COLUMNS)
    .single<ParticipantProfile>();

  if (error) throw error;
  return data;
}
