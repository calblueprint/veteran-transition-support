"use client";

import type {
  ProfileErrors,
  ProfileFormValues,
} from "@/lib/participant-profile";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  fetchParticipantProfile,
  saveParticipantProfile,
} from "@/actions/supabase/queries/participants";
import {
  EDUCATION_LEVELS,
  EMPTY_PROFILE,
  MILITARY_BRANCHES,
  profileToForm,
  validateProfile,
} from "@/lib/participant-profile";
import styles from "./profile.module.css";

function Field({
  name,
  label,
  error,
  children,
}: {
  name: keyof ProfileFormValues;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={name}>{label}</label>
      {children}
      {error && (
        <p id={`${name}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [values, setValues] = useState<ProfileFormValues>(EMPTY_PROFILE);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const saveInProgress = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const profile = await fetchParticipantProfile();
        if (active) {
          setExists(profile !== null);
          setValues(profile ? profileToForm(profile) : EMPTY_PROFILE);
        }
      } catch {
        if (active) {
          setLoadError("We couldn’t load your profile. Please try again.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  function updateField(name: keyof ProfileFormValues, value: string) {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
    setSuccess("");
    setSaveError("");
  }

  function inputProps(name: keyof ProfileFormValues) {
    return {
      id: name,
      name,
      value: values[name],
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
      ) => updateField(name, event.target.value),
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `${name}-error` : undefined,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || loadError || saveInProgress.current) return;
    setSaveError("");
    setSuccess("");
    const result = validateProfile(values);
    if (!result.success) {
      setErrors(result.errors);
      const firstInvalidField = Object.keys(result.errors)[0];
      const field = formRef.current?.elements.namedItem(firstInvalidField);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setErrors({});
    saveInProgress.current = true;
    setSaving(true);
    try {
      const profile = await saveParticipantProfile(result.data, exists);
      setValues(profileToForm(profile));
      setExists(true);
      setSuccess("Your profile has been saved.");
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      setSaveError(
        code === "23505" || code === "PGRST116"
          ? "This profile changed in another session. Reload the page and try again."
          : "We couldn’t save your profile. Your changes are still here. Please try again.",
      );
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Veteran Transition Support</p>
        <h1>Participant profile</h1>
        <p>
          Tell us about yourself, your military service, and your education.
        </p>
      </header>

      {loading && <p role="status">Loading your profile…</p>}
      {loadError && (
        <div className={styles.error} role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError("");
              setLoadAttempt(attempt => attempt + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        <p className={styles.requiredNote}>Fields marked * are required.</p>
        <fieldset disabled={loading || saving || Boolean(loadError)}>
          <legend>Personal information</legend>
          <div className={styles.grid}>
            <Field
              name="first_name"
              label="First name *"
              error={errors.first_name}
            >
              <input
                {...inputProps("first_name")}
                autoComplete="given-name"
                required
              />
            </Field>
            <Field
              name="last_name"
              label="Last name *"
              error={errors.last_name}
            >
              <input
                {...inputProps("last_name")}
                autoComplete="family-name"
                required
              />
            </Field>
            <Field name="email" label="Email *" error={errors.email}>
              <input
                {...inputProps("email")}
                type="email"
                autoComplete="email"
                required
              />
            </Field>
          </div>
        </fieldset>

        <fieldset disabled={loading || saving || Boolean(loadError)}>
          <legend>Military service</legend>
          <div className={styles.grid}>
            <Field
              name="military_branch"
              label="Military branch *"
              error={errors.military_branch}
            >
              <select {...inputProps("military_branch")} required>
                <option value="">Select a branch</option>
                {MILITARY_BRANCHES.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="rank" label="Rank *" error={errors.rank}>
              <input {...inputProps("rank")} required />
            </Field>
            <Field
              name="mos"
              label="MOS / military occupation *"
              error={errors.mos}
            >
              <input {...inputProps("mos")} required />
            </Field>
            <Field
              name="service_start_date"
              label="Service start date *"
              error={errors.service_start_date}
            >
              <input
                {...inputProps("service_start_date")}
                type="date"
                required
              />
            </Field>
            <Field
              name="service_end_date"
              label="Service end date"
              error={errors.service_end_date}
            >
              <input {...inputProps("service_end_date")} type="date" />
              <p className={styles.hint}>
                Leave blank if you are still serving.
              </p>
            </Field>
          </div>
        </fieldset>

        <fieldset disabled={loading || saving || Boolean(loadError)}>
          <legend>Education</legend>
          <Field
            name="education_level"
            label="Highest education level *"
            error={errors.education_level}
          >
            <select {...inputProps("education_level")} required>
              <option value="">Select an education level</option>
              {EDUCATION_LEVELS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>

        {Object.values(errors).some(Boolean) && (
          <p className={styles.error} role="alert">
            Please check the highlighted fields.
          </p>
        )}
        {saveError && (
          <p className={styles.error} role="alert">
            {saveError}
          </p>
        )}
        <p className={styles.success} role="status">
          {success}
        </p>
        <button
          className={styles.saveButton}
          type="submit"
          disabled={loading || saving || Boolean(loadError)}
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </main>
  );
}
