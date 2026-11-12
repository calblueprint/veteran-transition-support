import type { ParticipantProfile } from "@/lib/participant-profile";
import type { Workshop } from "@/types/workshop";

export type ParticipantListItem = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type Participant = ParticipantProfile & {
  phone_number: string | null;
  resume_url: string | null;
  duplicate_of_participant_id: string | null;
  created_at: string;
  affiliation:
    | "veteran"
    | "active-duty"
    | "reserve"
    | "Guard"
    | "spouse"
    | "base-staff"
    | null;
  verification_status: boolean;
  secondary_email: string | null;
  education_history: string | null;
  employment_history: string | null;
};

export type ParticipantRegistration = {
  id: string;
  participant_id: string;
  workshop_id: string;
  registration_date: string;
  attendance_status: string;
  workshop: Pick<
    Workshop,
    "id" | "name" | "start_date" | "end_date" | "location"
  > | null;
};

export type ParticipantCertification = {
  id: string;
  participant_id: string;
  certification_id: string;
  date_earned: string | null;
  expiration_date: string | null;
  certificate_file_url: string | null;
  certification: {
    id: string;
    name: string;
    issuing_org: string | null;
    description: string | null;
  } | null;
};
