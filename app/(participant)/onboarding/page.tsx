import { redirect } from "next/navigation";

/** /onboarding is the entry point other pages link to; begin at the first step. */
export default function OnboardingPage() {
  redirect("/onboarding/start");
}
