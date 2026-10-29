import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/supabase/admin-access";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const access = await getAdminAccess(supabase);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (access.status === "error") {
    return NextResponse.json(
      { error: "Unable to check admin status" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { isAdmin: access.isAdmin },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
