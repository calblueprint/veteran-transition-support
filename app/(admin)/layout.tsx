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

  // CHANGED: removed the participant profile completeness check; those fields
  // are optional on main's profile page and would lock out non-veteran admins

  return <>{children}</>;
}
