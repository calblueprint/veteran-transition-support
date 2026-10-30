import { createParticipantData } from "@/lib/participant-data";
import supabase from "../client";

export const {
  fetchProfile: fetchParticipantProfile,
  createProfile: createParticipantProfile,
  saveMilitaryBranch,
  saveProfile: saveParticipantProfile,
  listDocuments,
  uploadDocument,
  downloadDocument,
} = createParticipantData(supabase);
