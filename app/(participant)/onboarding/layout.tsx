"use client";

import type { ReactNode } from "react";
import { OnboardingProvider } from "@/components/participant/onboarding-steps";
import styles from "@/components/participant/onboarding.module.css";
import { ParticipantAccess } from "@/components/participant/participant-access";

/** Wraps every onboarding page so the answers stay in place between steps. */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <ParticipantAccess onboarding>
        {user => (
          <OnboardingProvider user={user}>{children}</OnboardingProvider>
        )}
      </ParticipantAccess>
    </main>
  );
}
