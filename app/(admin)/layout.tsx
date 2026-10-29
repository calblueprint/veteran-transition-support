import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/login");
  }

  const adminSupabase = createAdminClient();

  const { data: adminUser, error: adminError } = await adminSupabase
    .from("admin_users")
    .select("id")
    .eq("id", data.claims.sub)
    .maybeSingle();

  if (adminError) {
    throw new Error("Unable to verify admin access.");
  }

  if (!adminUser) {
    redirect("/profile");
  }

  // Require the fields collected by this branch's initial profile form.
  // A logged-in administrator must complete that form before viewing workshops.
  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select(
      "first_name,last_name,email,military_branch,rank,mos,service_start_date,education_level",
    )
    .eq("id", data.claims.sub)
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
