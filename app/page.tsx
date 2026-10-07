import { redirect } from "next/navigation";

/** The profile gate sends first-time participants to onboarding after authentication. */
export default function Home() {
  redirect("/profile");
}
