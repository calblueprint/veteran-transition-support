import { createBrowserClient } from "@supabase/ssr";

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  throw new Error(
    "No Supabase environment variables detected, please make sure they are in place!",
  );
}

// CHANGED: this file owns the client and imports nothing from "@/lib/supabase"
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default supabase;
