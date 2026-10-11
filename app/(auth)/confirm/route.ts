import { NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const next = searchParams.get("next") ?? "/profile";

  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/profile";

  if (tokenHash && (type === "email" || type === "recovery")) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (!error) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  const errorUrl = new URL("/login", origin);

  errorUrl.searchParams.set("error", "The email link is invalid or expired.");

  return NextResponse.redirect(errorUrl);
}
