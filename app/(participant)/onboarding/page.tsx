"use client";

import type { ProfileErrors } from "@/lib/participant-profile";
import type { User } from "@supabase/supabase-js";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createParticipantProfile,
  fetchParticipantProfile,
} from "@/actions/supabase/queries/participants";
import { ParticipantAccess } from "@/components/participant/participant-access";
import { PersonalFields } from "@/components/participant/profile-fields";
import {
  EMPTY_ONBOARDING,
  validateOnboarding,
} from "@/lib/participant-profile";
import styles from "../profile/profile.module.css";

function OnboardingForm({ user }: { user: User }) {
  const router = useRouter();
  const [values, setValues] = useState({
    ...EMPTY_ONBOARDING,
    email: user.email ?? "",
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const result = validateOnboarding(values);
    setErrors(result.success ? {} : result.errors);
    setError("");
    if (!result.success) {
      (
        event.currentTarget.elements.namedItem(
          Object.keys(result.errors)[0],
        ) as HTMLElement | null
      )?.focus();
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      await createParticipantProfile(user.id, result.data);
      router.replace("/profile");
    } catch (caught) {
      // A second tab or a retry after a lost response may already have created
      // the row. Never overwrite it; recover by loading it under the same user.
      if (
        typeof caught === "object" &&
        caught !== null &&
        "code" in caught &&
        caught.code === "23505"
      ) {
        try {
          if (await fetchParticipantProfile(user.id)) {
            router.replace("/profile");
            return;
          }
        } catch {
          /* Show the retryable error below. */
        }
      }
      setError(
        "We couldn’t create your profile. Your entries are still here. Please try again.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className={styles.requiredNote}>
        Fields marked * are required. You can add your service history and
        documents next.
      </p>
      <fieldset disabled={saving}>
        <legend>About you</legend>
        <PersonalFields
          values={values}
          errors={errors}
          onChange={(name, value) => {
            setValues(current => ({ ...current, [name]: value }));
            setErrors(current => ({ ...current, [name]: undefined }));
          }}
        />
      </fieldset>
      {Object.keys(errors).length > 0 && (
        <p role="alert" className={styles.error}>
          Please check the highlighted fields.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className={styles.saveButton} disabled={saving} type="submit">
        {saving ? "Creating profile…" : "Continue to profile"}
      </button>
    </form>
  );
}

export default function OnboardingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Veteran Transition Support</p>
        <h1>Welcome! Let’s get started.</h1>
        <p>
          Create your profile to continue. Your information starts as
          unverified.
        </p>
      </header>
      <ParticipantAccess onboarding>
        {user => <OnboardingForm user={user} />}
      </ParticipantAccess>
    </main>
  );
}
