"use client";

import { notFound, useParams } from "next/navigation";
import {
  ONBOARDING_PATHS,
  OnboardingStep,
} from "@/components/participant/onboarding-steps";

/** Serves /onboarding/start, contact, military, branch and done. */
export default function OnboardingStepPage() {
  const { step } = useParams<{ step: string }>();
  if (!ONBOARDING_PATHS.includes(step)) notFound();
  return <OnboardingStep path={step} />;
}
