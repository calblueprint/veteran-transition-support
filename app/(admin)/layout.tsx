import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/supabase/admin-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const access = await getAdminAccess(supabase);

  if (access.status === "unauthenticated") {
    redirect("/login");
  }

  if (access.status === "error") {
    throw new Error("Unable to verify admin access.");
  }

  if (!access.isAdmin) {
    redirect("/profile");
  }

  // Require the fields collected by this branch's initial profile form.
  // A logged-in administrator must complete that form before viewing workshops.
  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select(
      "first_name,last_name,email,military_branch,rank,mos,service_start_date,education_level",
    )
    .eq("id", access.userId)
    .maybeSingle();

  if (participantError) {
    throw new Error("Unable to verify participant profile completion.");
  }

  const profileComplete =
    participant &&
    participant.first_name?.trim() &&
    participant.last_name?.trim() &&
    participant.email?.trim() &&
    participant.military_branch &&
    participant.rank?.trim() &&
    participant.mos?.trim() &&
    participant.service_start_date &&
    participant.education_level;

  if (!profileComplete) {
    redirect("/profile");
  }

  return <>{children}</>;
}
