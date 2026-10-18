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

  return <>{children}</>;
}
