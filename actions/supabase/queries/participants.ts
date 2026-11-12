// RESOLVED: type imports first, then the factory and client
import type {
  Participant,
  ParticipantCertification,
  ParticipantListItem,
  ParticipantRegistration,
} from "@/types/participant";
import { createParticipantData } from "@/lib/participant-data";
import supabase from "../client";

// RESOLVED: kept HEAD (main) factory exports, including the ID verification functions
export const {
  fetchProfile: fetchParticipantProfile,
  createProfile: createParticipantProfile,
  saveMilitaryBranch,
  saveProfile: saveParticipantProfile,
  saveProfileFields: saveParticipantProfileFields,
  listDocuments,
  uploadDocument,
  downloadDocument,
  submitIdVerification,
  fetchLatestIdVerification,
} = createParticipantData(supabase);

// RESOLVED: dropped this commit's TEST_PARTICIPANT_ID, PROFILE_COLUMNS,
// fetchParticipantProfile and saveParticipantProfile (replaced by the factory on main).
// Kept the four admin functions below, which are new in this commit.

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
