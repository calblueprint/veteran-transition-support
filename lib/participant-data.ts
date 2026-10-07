import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OnboardingInput,
  ParticipantProfile,
  ParticipantProfileInput,
} from "./participant-profile";

export const DOCUMENT_BUCKET = "participant-documents";
export const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;
export type DocumentKind = "resumes" | "documents";
export type ParticipantDocument = {
  name: string;
  path: string;
  createdAt: string;
};
const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
const PERSONAL_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone_number",
  "affiliation",
] as const;
const EDITABLE_COLUMNS = [
  ...PERSONAL_COLUMNS,
  "secondary_email",
  "military_branch",
  "rank",
  "mos",
  "service_start_date",
  "service_end_date",
  "education_level",
  "education_history",
  "employment_history",
] as const;
const PROFILE_COLUMNS = ["id", "verification_status", ...EDITABLE_COLUMNS].join(
  ",",
);

/** Checks size and file type before any network request; the bucket also enforces limits. */
export function validateDocument(
  file: Pick<File, "name" | "size" | "type">,
  kind: DocumentKind,
): string | null {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!file.size) return "Choose a file that is not empty.";
  if (file.size > MAX_DOCUMENT_BYTES)
    return "Choose a file no larger than 6 MB.";
  if (
    !MIME_TYPES[extension] ||
    (kind === "resumes" && !["pdf", "doc", "docx"].includes(extension))
  ) {
    return kind === "resumes"
      ? "Choose a PDF, DOC, or DOCX resume."
      : "Choose a PDF, DOC, DOCX, PNG, or JPEG document.";
  }
  // Some operating systems omit MIME types. Derive those from an allowed
  // extension, but reject a conflicting type instead of relabeling it.
  if (file.type && file.type !== MIME_TYPES[extension])
    return "The file type does not match its extension.";
  return null;
}

/** Removes path separators and control characters while retaining a readable filename. */
export function documentFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150) || "document";
}

/**
 * Builds participant operations around the shared authenticated client.
 * Injecting the client also allows request-contract tests without a live project.
 * RLS is the authorization boundary; session checks prevent stale UI submissions
 * from being attributed to a different account after a sign-in change.
 */
export function createParticipantData(client: SupabaseClient) {
  async function requireUser(expectedId: string) {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.id !== expectedId)
      throw new Error("Your session changed. Please log in again.");
    return user;
  }

  async function fetchProfile(
    userId: string,
  ): Promise<ParticipantProfile | null> {
    await requireUser(userId);
    const { data, error } = await client
      .from("participants")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle<ParticipantProfile>();
    if (error) throw error;
    return data;
  }

  async function createProfile(
    userId: string,
    profile: OnboardingInput,
  ): Promise<ParticipantProfile> {
    await requireUser(userId);
    const fields = Object.fromEntries(
      PERSONAL_COLUMNS.map(key => [key, profile[key]]),
    );
    // Never upsert: revisiting onboarding must not reset an existing profile or
    // its verification. A concurrent insert is surfaced to the page for recovery.
    const { data, error } = await client
      .from("participants")
      .insert({ ...fields, id: userId, verification_status: false })
      .select(PROFILE_COLUMNS)
      .single<ParticipantProfile>();
    if (error) throw error;
    return data;
  }

  async function saveProfile(
    userId: string,
    profile: ParticipantProfileInput,
  ): Promise<ParticipantProfile> {
    await requireUser(userId);
    const fields = Object.fromEntries(
      EDITABLE_COLUMNS.map(key => [key, profile[key]]),
    );
    const { data, error } = await client
      .from("participants")
      .update(fields)
      .eq("id", userId)
      .select(PROFILE_COLUMNS)
      .single<ParticipantProfile>();
    // Requiring a returned row prevents denied/no-op writes looking successful.
    if (error) throw error;
    return data;
  }

  async function listDocuments(
    userId: string,
    kind: DocumentKind,
  ): Promise<ParticipantDocument[]> {
    await requireUser(userId);
    const files: ParticipantDocument[] = [];
    const folder = `${userId}/${kind}`;
    // Paginate so an older upload does not disappear after the first 100 files.
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.storage
        .from(DOCUMENT_BUCKET)
        .list(folder, {
          limit: 100,
          offset,
          sortBy: { column: "created_at", order: "desc" },
        });
      if (error) throw error;
      for (const file of data) {
        if (file.id)
          files.push({
            name: file.name.replace(/^[0-9a-f-]{36}--/, ""),
            path: `${folder}/${file.name}`,
            createdAt: file.created_at ?? "",
          });
      }
      if (data.length < 100) return files;
    }
  }

  async function uploadDocument(
    userId: string,
    kind: DocumentKind,
    file: File,
  ): Promise<ParticipantDocument> {
    const validationError = validateDocument(file, kind);
    if (validationError) throw new Error(validationError);
    await requireUser(userId);
    const name = documentFilename(file.name);
    const path = `${userId}/${kind}/${crypto.randomUUID()}--${name}`;
    const extension = name.split(".").at(-1)!.toLowerCase();
    const { error } = await client.storage
      .from(DOCUMENT_BUCKET)
      .upload(path, file, {
        contentType: MIME_TYPES[extension],
        upsert: false,
      });
    if (error) throw error;
    // Storage is the source of truth. A second metadata write could fail after
    // uploading and orphan the file; listing the user's folder avoids that race.
    return { name, path, createdAt: new Date().toISOString() };
  }

  async function downloadDocument(
    userId: string,
    document: ParticipantDocument,
  ): Promise<Blob> {
    await requireUser(userId);
    if (
      !document.path.startsWith(`${userId}/resumes/`) &&
      !document.path.startsWith(`${userId}/documents/`)
    )
      throw new Error("This file does not belong to your profile.");
    const { data, error } = await client.storage
      .from(DOCUMENT_BUCKET)
      .download(document.path);
    if (error) throw error;
    return data;
  }

  return {
    fetchProfile,
    createProfile,
    saveProfile,
    listDocuments,
    uploadDocument,
    downloadDocument,
  };
}
