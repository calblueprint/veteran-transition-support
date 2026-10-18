import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  const { data: adminUser, error: adminError } = await adminSupabase
    .from("admin_users")
    .select("id")
    .eq("id", data.claims.sub)
    .maybeSingle();

  if (adminError) {
    console.error("Unable to check admin status:", adminError.message);

    return NextResponse.json(
      { error: "Unable to check admin status" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { isAdmin: Boolean(adminUser) },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
