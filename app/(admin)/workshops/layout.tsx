import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function WorkshopsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("participants")
    .select(
      "first_name,last_name,email,military_branch,rank,mos,service_start_date,education_level",
    )
    .eq("id", data.claims.sub)
    .maybeSingle();

  if (profileError) {
    throw new Error("Unable to verify participant profile.");
  }

  const profileComplete = Boolean(
    profile?.first_name?.trim() &&
    profile?.last_name?.trim() &&
    profile?.email?.trim() &&
    profile?.military_branch &&
    profile?.rank?.trim() &&
    profile?.mos?.trim() &&
    profile?.service_start_date &&
    profile?.education_level,
  );

  if (!profileComplete) {
    redirect("/profile");
  }

  return <>{children}</>;
}
