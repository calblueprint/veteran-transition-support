"use client";

import type {
  MilitaryBranch,
  OnboardingValues,
  ProfileErrors,
  ProfileFormValues,
} from "@/lib/participant-profile";
import type { User } from "@supabase/supabase-js";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createParticipantProfile,
  fetchParticipantProfile,
  saveMilitaryBranch,
} from "@/actions/supabase/queries/participants";
import profileStyles from "@/app/(participant)/profile/profile.module.css";
import {
  AFFILIATIONS,
  EMPTY_ONBOARDING,
  MILITARY_BRANCHES,
  validateOnboarding,
} from "@/lib/participant-profile";
import styles from "./onboarding.module.css";
import { PersonalFields } from "./profile-fields";

/**
 * The three numbered steps, in order. `fields` are the answers checked before
 * moving on; the branch step is optional, so it has none.
 */
const FORM_STEPS: {
  path: string;
  checklist: string;
  title: string;
  subtitle: string;
  fields: (keyof OnboardingValues)[];
}[] = [
  {
    path: "contact",
    checklist: "Confirm your contact info",
    title: "Confirm your contact info",
    subtitle:
      "We filled in what we could. Double-check it and add a phone number.",
    fields: ["first_name", "last_name", "email", "phone_number"],
  },
  {
    path: "military",
    checklist: "How you’re connected to the military",
    title: "How are you connected to the military?",
    subtitle: "Choose the one that fits best.",
    fields: ["affiliation"],
  },
  {
    path: "branch",
    checklist: "Your branch of service",
    title: "Which branch did you serve in?",
    subtitle: "If you served in more than one, pick the most recent.",
    fields: [],
  },
];

/** Every page at /onboarding/<path>: a welcome card, the steps, then a done card. */
export const ONBOARDING_PATHS = [
  "start",
  ...FORM_STEPS.map(step => step.path),
  "done",
];

type OnboardingState = {
  user: User;
  values: OnboardingValues;
  setValues: Dispatch<SetStateAction<OnboardingValues>>;
  errors: ProfileErrors;
  setErrors: Dispatch<SetStateAction<ProfileErrors>>;
  branch: string;
  setBranch: Dispatch<SetStateAction<string>>;
  branchFailed: boolean;
  setBranchFailed: Dispatch<SetStateAction<boolean>>;
};
const OnboardingContext = createContext<OnboardingState | null>(null);

function useOnboarding() {
  const state = useContext(OnboardingContext);
  if (!state)
    throw new Error("Onboarding pages must be inside OnboardingProvider.");
  return state;
}

/** Keeps the answers in one place so they survive moving between steps. */
export function OnboardingProvider({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const [values, setValues] = useState({
    ...EMPTY_ONBOARDING,
    email: user.email ?? "",
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [branch, setBranch] = useState("");
  const [branchFailed, setBranchFailed] = useState(false);
  return (
    <OnboardingContext.Provider
      value={{
        user,
        values,
        setValues,
        errors,
        setErrors,
        branch,
        setBranch,
        branchFailed,
        setBranchFailed,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

/** Radio buttons drawn as cards, used for affiliation and branch. */
function ChoiceCards({
  name,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-describedby={error ? `${name}-error` : undefined}
    >
      <div className={styles.choices}>
        {options.map(option => (
          <label
            key={option.value}
            className={`${styles.choice} ${value === option.value ? styles.chosen : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} className={profileStyles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

function Welcome() {
  const router = useRouter();
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>Welcome to VTS</p>
      <h1 className={styles.title}>Let’s finish your profile!</h1>
      <ol className={styles.checklist}>
        {FORM_STEPS.map((step, index) => (
          <li key={step.path}>
            <span className={styles.number}>{index + 1}</span>
            {step.checklist}
          </li>
        ))}
      </ol>
      <div className={styles.footer}>
        <button
          className={styles.primary}
          type="button"
          onClick={() => router.push(`/onboarding/${FORM_STEPS[0].path}`)}
        >
          Get started
        </button>
      </div>
    </section>
  );
}

function Done() {
  const router = useRouter();
  const { branchFailed } = useOnboarding();
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>Profile complete</p>
      <h1 className={styles.title}>You’re all set</h1>
      <p className={styles.subtitle}>
        Thanks! We’ll use this to recommend relevant events and benefits. You
        can edit it anytime.
      </p>
      {branchFailed && (
        <p role="alert" className={profileStyles.error}>
          We couldn’t save your branch of service. You can add it on your
          profile.
        </p>
      )}
      <div className={styles.footer}>
        <button
          className={styles.primary}
          type="button"
          onClick={() => router.replace("/profile")}
        >
          Go to my profile
        </button>
      </div>
    </section>
  );
}

/** One numbered step. The last step also creates the profile. */
function FormStep({ index }: { index: number }) {
  const router = useRouter();
  const {
    user,
    values,
    setValues,
    errors,
    setErrors,
    branch,
    setBranch,
    setBranchFailed,
  } = useOnboarding();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const step = FORM_STEPS[index];
  const isLast = index === FORM_STEPS.length - 1;

  function focusField(name: string | undefined) {
    // Radio groups have several inputs, so focus the first one with this name.
    formRef.current
      ?.querySelector<HTMLElement>(`[name="${name ?? ""}"]`)
      ?.focus();
  }

  async function advance(skipBranch = false) {
    if (pending.current) return;
    setError("");
    // Same validation as editing a profile, run on every field each time.
    const result = validateOnboarding(values);
    const allErrors: ProfileErrors = result.success ? {} : result.errors;

    if (!isLast) {
      // Only show this step's errors; later steps have not been filled in yet.
      const stepErrors = Object.fromEntries(
        step.fields
          .filter(name => allErrors[name])
          .map(name => [name, allErrors[name]]),
      ) as ProfileErrors;
      setErrors(stepErrors);
      const firstInvalid = step.fields.find(name => stepErrors[name]);
      if (firstInvalid) focusField(firstInvalid);
      else router.push(`/onboarding/${FORM_STEPS[index + 1].path}`);
      return;
    }

    // Last step: show every error and send the user to the earliest step with one
    // (for example, after refreshing the page and losing earlier answers).
    setErrors(allErrors);
    if (!result.success) {
      const badStep = FORM_STEPS.find(s => s.fields.some(f => allErrors[f]));
      if (badStep) router.push(`/onboarding/${badStep.path}`);
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      await createParticipantProfile(user.id, result.data);
      // The branch is optional and saved separately, so a failure here must not
      // undo the profile; the done card tells the user to add it later.
      if (branch && !skipBranch) {
        try {
          await saveMilitaryBranch(user.id, branch as MilitaryBranch);
        } catch {
          setBranchFailed(true);
        }
      }
      router.push("/onboarding/done");
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

  function updateField(name: keyof ProfileFormValues, value: string) {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
  }

  return (
    <form
      ref={formRef}
      className={styles.card}
      noValidate
      onSubmit={event => {
        event.preventDefault();
        void advance();
      }}
    >
      <div className={styles.progress} aria-hidden="true">
        {FORM_STEPS.map((s, position) => (
          <span
            key={s.path}
            className={position <= index ? styles.filled : ""}
          />
        ))}
      </div>
      <p className={styles.eyebrow}>
        Step {index + 1} of {FORM_STEPS.length}
      </p>
      <h1 className={styles.title}>{step.title}</h1>
      <p className={styles.subtitle}>{step.subtitle}</p>
      <fieldset className={styles.fieldset} disabled={saving}>
        {step.path === "contact" && (
          <PersonalFields
            fields={step.fields}
            values={values}
            errors={errors}
            onChange={updateField}
          />
        )}
        {step.path === "military" && (
          <ChoiceCards
            name="affiliation"
            options={AFFILIATIONS}
            value={values.affiliation}
            onChange={value => updateField("affiliation", value)}
            error={errors.affiliation}
          />
        )}
        {step.path === "branch" && (
          <ChoiceCards
            name="military_branch"
            options={MILITARY_BRANCHES}
            value={branch}
            onChange={setBranch}
          />
        )}
      </fieldset>
      {Object.values(errors).some(Boolean) && (
        <p role="alert" className={profileStyles.error}>
          Please check the highlighted fields.
        </p>
      )}
      {error && (
        <p role="alert" className={profileStyles.error}>
          {error}
        </p>
      )}
      <div className={styles.footer}>
        {isLast && (
          <button
            className={styles.skip}
            type="button"
            disabled={saving}
            onClick={() => void advance(true)}
          >
            Skip for now
          </button>
        )}
        {index > 0 && (
          <button
            className={styles.secondary}
            type="button"
            disabled={saving}
            onClick={() =>
              router.push(`/onboarding/${FORM_STEPS[index - 1].path}`)
            }
          >
            Back
          </button>
        )}
        <button className={styles.primary} type="submit" disabled={saving}>
          {isLast ? (saving ? "Creating profile…" : "Finish") : "Continue"}
        </button>
      </div>
    </form>
  );
}

/** Shows the welcome card, one numbered step, or the done card for a path. */
export function OnboardingStep({ path }: { path: string }) {
  if (path === "start") return <Welcome />;
  if (path === "done") return <Done />;
  return <FormStep index={FORM_STEPS.findIndex(step => step.path === path)} />;
}
