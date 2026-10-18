import type {
  ParticipantProfile,
  ParticipantProfileInput,
} from "@/lib/participant-profile";
import type {
  Participant,
  ParticipantCertification,
  ParticipantListItem,
  ParticipantRegistration,
} from "@/types/participant";
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

export async function fetchParticipants(
  search = "",
): Promise<ParticipantListItem[]> {
  let query = supabase
    .from("participants")
    .select("id, first_name, last_name, email")
    .order("last_name")
    .order("first_name")
    .order("id");

  const term = search.trim();

  if (term) {
    const pattern = JSON.stringify(`%${term}%`);

    query = query.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Could not load participants: ${error.message}`);
  }

  return data;
}

export async function fetchParticipantById(
  id: string,
): Promise<Participant | null> {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("id", id)
    .maybeSingle<Participant>();

  if (error) {
    throw new Error(`Could not load participant: ${error.message}`);
  }

  return data;
}

export async function fetchParticipantRegistrations(
  participantId: string,
): Promise<ParticipantRegistration[]> {
  const { data, error } = await supabase
    .from("registrations")
    .select(
      `
      id,
      participant_id,
      workshop_id,
      registration_date,
      attendance_status,
      workshop:workshops (
        id,
        name,
        start_date,
        end_date,
        location
      )
    `,
    )
    .eq("participant_id", participantId)
    .order("registration_date", { ascending: false })
    .order("id")
    .overrideTypes<ParticipantRegistration[], { merge: false }>();

  if (error) {
    throw new Error(`Could not load registrations: ${error.message}`);
  }

  return data;
}

export async function fetchParticipantCertifications(
  participantId: string,
): Promise<ParticipantCertification[]> {
  const { data, error } = await supabase
    .from("participant_certifications")
    .select(
      `
      id,
      participant_id,
      certification_id,
      date_earned,
      expiration_date,
      certificate_file_url,
      certification:certifications (
        id,
        name,
        issuing_org,
        description
      )
    `,
    )
    .eq("participant_id", participantId)
    .order("date_earned", { ascending: false, nullsFirst: false })
    .order("id")
    .overrideTypes<ParticipantCertification[], { merge: false }>();

  if (error) {
    throw new Error(`Could not load certifications: ${error.message}`);
  }

  return data;
}
