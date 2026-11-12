import "server-only";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Verify session and admin membership through the caller's RLS-scoped client. */
export async function getAdminAccess(supabase: ServerClient) {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return { status: "unauthenticated" } as const;
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", data.claims.sub)
    .maybeSingle();

  if (adminError) {
    console.error("Unable to check admin status:", adminError.message);
    return { status: "error" } as const;
  }

  return {
    status: "authenticated",
    userId: data.claims.sub,
    isAdmin: Boolean(adminUser),
  } as const;
}
