import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requestMilitaryVerification } from "@/lib/mil-verification/flow";
import {
  verificationAppOrigin,
  verificationBackend,
} from "@/lib/mil-verification/server";
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
      { ok: false, code: "invalid_email" },
      { status: 400, headers: NO_CACHE },
    );
  }
  const email =
    body && typeof body === "object" && "email" in body ? body.email : null;

  try {
    const result = await requestMilitaryVerification(
      data.user.id,
      email,
      verificationAppOrigin(),
      verificationBackend(),
    );
    const status = result.ok
      ? 200
      : result.code === "invalid_email"
        ? 400
        : result.code === "cooldown" || result.code === "rate_limited"
          ? 429
          : result.code === "already_verified"
            ? 409
            : result.code === "profile_missing"
              ? 404
              : 503;
    return NextResponse.json(result, { status, headers: NO_CACHE });
  } catch {
    return NextResponse.json(
      { ok: false, code: "unavailable" },
      { status: 503, headers: NO_CACHE },
    );
  }
}
