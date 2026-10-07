"use client";

import type { ParticipantProfile } from "@/lib/participant-profile";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchParticipantProfile } from "@/actions/supabase/queries/participants";
import { supabase } from "@/lib/supabase";

/**
 * Routes signed-out users to login and missing profiles to onboarding.
 * Children unmount when the session changes, clearing the previous user's form
 * and files. Database and Storage policies independently enforce ownership.
 */
export function ParticipantAccess({
  onboarding = false,
  children,
}: {
  onboarding?: boolean;
  children: (user: User, profile: ParticipantProfile | null) => ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<{
    user: User;
    profile: ParticipantProfile | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let currentUserId: string | null | undefined;
    async function load(user: User | null) {
      if (!active || (user?.id ?? null) === currentUserId) return;
      currentUserId = user?.id ?? null;
      const request = ++generation;
      setState(null);
      setError("");
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const profile = await fetchParticipantProfile(user.id);
        if (!active || request !== generation) return;
        if (onboarding && profile) router.replace("/profile");
        else if (!onboarding && !profile) router.replace("/onboarding");
        else setState({ user, profile });
      } catch {
        if (active && request === generation)
          setError("We couldn’t load your account. Please try again.");
      }
    }
    // Do not await Supabase calls inside onAuthStateChange: the auth client can
    // hold its session lock during the callback. Defer the profile request.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        void load(session?.user ?? null);
      }, 0);
    });
    return () => {
      active = false;
      generation++;
      subscription.unsubscribe();
    };
  }, [attempt, onboarding, router]);

  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => {
            setError("");
            setAttempt(value => value + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!state) return <p role="status">Loading your account…</p>;
  return (
    <Fragment key={state.user.id}>
      {children(state.user, state.profile)}
    </Fragment>
  );
}
