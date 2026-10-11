import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  // This endpoint is for local development only.
  if (
    process.env.NODE_ENV !== "development" ||
    !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const origin = request.headers.get("origin");

  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Basic development-only rate limiting.
  const now = Date.now();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";

  const current = attempts.get(ip);

  const attempt =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + 60_000 }
      : current;

  attempt.count += 1;
  attempts.set(ip, attempt);

  if (attempt.count > 10) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const email = body?.email;

    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = createAdminClient();

    const perPage = 200;
    let page = 1;

    while (page <= 100) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        throw error;
      }

      const exists = data.users.some(
        user => user.email?.toLowerCase() === normalizedEmail,
      );

      if (exists) {
        return NextResponse.json({ exists: true });
      }

      if (data.users.length < perPage) {
        return NextResponse.json({ exists: false });
      }

      page += 1;
    }

    return NextResponse.json(
      { error: "Account lookup exceeded its limit." },
      { status: 503 },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to check account." },
      { status: 500 },
    );
  }
}
