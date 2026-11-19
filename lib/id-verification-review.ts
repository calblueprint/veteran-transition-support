import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingVerification = {
  id: string;
  participant_id: string;
  first_name: string;
  last_name: string;
  affiliation: string | null;
  created_at: string;
  document_image_url: string;
};
export const ID_PHOTO_URL_SECONDS = 60;

export function skipVerification<T extends { id: string }>(
  queue: T[],
  id: string,
): T[] {
  return [
    ...queue.filter(item => item.id !== id),
    ...queue.filter(item => item.id === id),
  ];
}

export function createVerificationReview(client: SupabaseClient) {
  return {
    async pending(): Promise<PendingVerification[]> {
      const { data, error } = await client.rpc("pending_id_verifications");
      if (error) throw error;
      return data ?? [];
    },
    async photo(submission: PendingVerification): Promise<string> {
      if (
        !submission.document_image_url.startsWith(
          `${submission.participant_id}/id-verification/`,
        )
      ) {
        throw new Error("The submission has an invalid ID photo path.");
      }
      const { data, error } = await client.storage
        .from("participant-documents")
        .createSignedUrl(submission.document_image_url, ID_PHOTO_URL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
    async review(
      id: string,
      decision: "approve" | "reject",
      reason = "",
    ): Promise<void> {
      if (
        decision === "reject" &&
        (!reason.trim() || reason.trim().length > 2000)
      ) {
        throw new Error("Enter a rejection reason of 1–2000 characters.");
      }
      const { error } = await client.rpc("review_id_verification", {
        submission_id: id,
        decision,
        reason: decision === "reject" ? reason.trim() : null,
      });
      if (error) throw error;
    },
  };
}
