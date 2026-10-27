"use client";

import type {
  ParticipantProfile,
  ProfileErrors,
  ProfileFormValues,
} from "@/lib/participant-profile";
import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveParticipantProfile } from "@/actions/supabase/queries/participants";
import { DocumentUploads } from "@/components/participant/document-uploads";
import { ParticipantAccess } from "@/components/participant/participant-access";
import { Field, PersonalFields } from "@/components/participant/profile-fields";
import {
  EDUCATION_LEVELS,
  MILITARY_BRANCHES,
  profileToForm,
  validateProfile,
} from "@/lib/participant-profile";
import { supabase } from "@/lib/supabase";
import styles from "./profile.module.css";

/** Edits an existing authenticated profile; only onboarding creates participant rows. */
function ProfileEditor({
  initialProfile,
}: {
  initialProfile: ParticipantProfile;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [values, setValues] = useState(() => profileToForm(initialProfile));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const pending = useRef(false);
  const unverified = !profile.verification_status;

  function updateField(name: keyof ProfileFormValues, value: string) {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
    setSuccess("");
    setError("");
  }
  function inputProps(name: keyof ProfileFormValues, flagged = true) {
    return {
      id: name,
      name,
      value: values[name],
      onChange: (
        event: ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >,
      ) => updateField(name, event.target.value),
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby":
        [
          errors[name] ? `${name}-error` : "",
          flagged && unverified ? `${name}-verification` : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
    };
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    setSuccess("");
    const result = validateProfile(values);
    if (!result.success) {
      setErrors(result.errors);
      (
        event.currentTarget.elements.namedItem(
          Object.keys(result.errors)[0],
        ) as HTMLElement | null
      )?.focus();
      return;
    }
    setErrors({});
    pending.current = true;
    setSaving(true);
    try {
      const saved = await saveParticipantProfile(profile.id, result.data);
      setProfile(saved);
      setValues(profileToForm(saved));
      setSuccess("Your profile has been saved.");
    } catch {
      setError(
        "We couldn’t save your profile. Your changes are still here. Please try again.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError("We couldn’t log you out. Please try again.");
    else router.replace("/login");
  }
  return (
    <>
      <div className={styles.accountBar}>
        <p>
          Verification status:{" "}
          <strong>{unverified ? "Unverified" : "Verified"}</strong>
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void signOut();
          }}
        >
          Log out
        </button>
      </div>
      {unverified && (
        <section
          className={styles.verification}
          aria-label="Profile verification"
        >
          <p>
            Military details, education, employment, and files are self-reported
            and remain unverified.
          </p>
          <button
            type="button"
            onClick={() =>
              setVerificationMessage(
                "Verification is not available yet. Your profile remains unverified; no verification request has been submitted.",
              )
            }
          >
            Verify
          </button>
          <p role="status">{verificationMessage}</p>
        </section>
      )}
      <form onSubmit={submit} noValidate>
        <p className={styles.requiredNote}>
          Fields marked * are required. Save the rest whenever you are ready.
        </p>
        <fieldset disabled={saving}>
          <legend>Personal information</legend>
          <PersonalFields
            values={values}
            errors={errors}
            onChange={updateField}
          />
          <div className={styles.secondaryEmail}>
            <Field
              name="secondary_email"
              label="Secondary email (affiliated with Coursera access)"
              error={errors.secondary_email}
            >
              <input
                {...inputProps("secondary_email", false)}
                type="email"
                maxLength={254}
              />
              <p className={styles.hint}>
                Use the email associated with your Coursera access, if you have
                one.
              </p>
            </Field>
          </div>
        </fieldset>
        <fieldset disabled={saving}>
          <legend>Military service</legend>
          <div className={styles.grid}>
            <Field
              name="military_branch"
              label="Military branch"
              error={errors.military_branch}
              unverified={unverified}
            >
              <select {...inputProps("military_branch")}>
                <option value="">Not provided / not applicable</option>
                {MILITARY_BRANCHES.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name="rank"
              label="Rank"
              error={errors.rank}
              unverified={unverified}
            >
              <input {...inputProps("rank")} maxLength={254} />
            </Field>
            <Field
              name="mos"
              label="MOS / military occupation"
              error={errors.mos}
              unverified={unverified}
            >
              <input {...inputProps("mos")} maxLength={254} />
            </Field>
            <Field
              name="service_start_date"
              label="Service start date"
              error={errors.service_start_date}
              unverified={unverified}
            >
              <input {...inputProps("service_start_date")} type="date" />
            </Field>
            <Field
              name="service_end_date"
              label="Service end date"
              error={errors.service_end_date}
              unverified={unverified}
            >
              <input {...inputProps("service_end_date")} type="date" />
              <p className={styles.hint}>
                Leave blank if you are still serving or this does not apply.
              </p>
            </Field>
          </div>
        </fieldset>
        <fieldset disabled={saving}>
          <legend>Education and employment</legend>
          <div className={styles.historyFields}>
            <Field
              name="education_level"
              label="Highest education level"
              error={errors.education_level}
              unverified={unverified}
            >
              <select {...inputProps("education_level")}>
                <option value="">Not provided</option>
                {EDUCATION_LEVELS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name="education_history"
              label="Education history"
              error={errors.education_history}
              unverified={unverified}
            >
              <textarea
                {...inputProps("education_history")}
                rows={5}
                maxLength={10000}
                placeholder="Schools, degrees or training, and dates"
              />
            </Field>
            <Field
              name="employment_history"
              label="Employment history"
              error={errors.employment_history}
              unverified={unverified}
            >
              <textarea
                {...inputProps("employment_history")}
                rows={5}
                maxLength={10000}
                placeholder="Employers, roles, responsibilities, and dates"
              />
            </Field>
          </div>
        </fieldset>
        {Object.values(errors).some(Boolean) && (
          <p className={styles.error} role="alert">
            Please check the highlighted fields.
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <p className={styles.success} role="status">
          {success}
        </p>
        <button className={styles.saveButton} type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
      <section className={styles.documents} aria-labelledby="uploads-heading">
        <h2 id="uploads-heading">Resume and documents</h2>
        <p>
          Enter your history above manually. Uploading a file does not fill in
          your profile.
        </p>
        <DocumentUploads
          userId={profile.id}
          verified={profile.verification_status}
          kind="resumes"
        />
        <DocumentUploads
          userId={profile.id}
          verified={profile.verification_status}
          kind="documents"
        />
      </section>
    </>
  );
}

export default function ProfilePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Veteran Transition Support</p>
        <h1>Participant profile</h1>
        <p>
          View and edit your personal information, service history, and
          documents.
        </p>
      </header>
      <ParticipantAccess>
        {(_user, profile) =>
          profile && <ProfileEditor initialProfile={profile} />
        }
      </ParticipantAccess>
    </main>
  );
}
