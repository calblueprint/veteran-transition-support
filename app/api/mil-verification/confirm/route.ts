import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { confirmMilitaryVerification } from "@/lib/mil-verification/flow";
import { verificationBackend } from "@/lib/mil-verification/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json(
      { ok: false, code: "forbidden" },
      { status: 403, headers: NO_CACHE },
    );

  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    return NextResponse.json(
      { ok: false, code: "unauthenticated" },
      { status: 401, headers: NO_CACHE },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_link" },
      { status: 400, headers: NO_CACHE },
    );
  }
  const token =
    body && typeof body === "object" && "token" in body ? body.token : null;
  try {
    const result = await confirmMilitaryVerification(
      data.user.id,
      token,
      verificationBackend(),
    );
    return NextResponse.json(result, {
      status: result.ok
        ? 200
        : ["invalid_link", "expired_link", "used_link"].includes(result.code)
          ? 410
          : 503,
      headers: NO_CACHE,
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: "unavailable" },
      { status: 503, headers: NO_CACHE },
    );
  }
}
