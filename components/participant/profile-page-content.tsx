"use client";

import type {
  ParticipantProfile,
  ProfileErrors,
  ProfileFormValues,
  ProfileSection,
} from "@/lib/participant-profile";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveParticipantProfileFields } from "@/actions/supabase/queries/participants";
import styles from "@/app/(participant)/profile/profile-page.module.css";
import { Button } from "@/components/Button";
import {
  AFFILIATIONS,
  EDUCATION_LEVELS,
  MILITARY_BRANCHES,
  PROFILE_SECTION_FIELDS,
  profileToForm,
  validateProfileSection,
} from "@/lib/participant-profile";
import { supabase } from "@/lib/supabase";
import { DocumentUploads } from "./document-uploads";
import { ParticipantAccess } from "./participant-access";
import { Field, PersonalFields, UnverifiedBadge } from "./profile-fields";

type InputProps = {
  id: string;
  name: string;
  value: string;
  onChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};
type EditorFields = {
  values: ProfileFormValues;
  errors: ProfileErrors;
  update: (name: keyof ProfileFormValues, value: string) => void;
  input: (name: keyof ProfileFormValues) => InputProps;
};

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{value || <span className={styles.empty}>Not provided</span>}</dd>
    </div>
  );
}

/** Each card owns its draft and feedback, and only patches that card's columns. */
function EditableCard({
  title,
  section,
  profile,
  onSaved,
  children,
  fields,
  wide = false,
}: {
  title: string;
  section: ProfileSection;
  profile: ParticipantProfile;
  onSaved: (saved: ParticipantProfile, section: ProfileSection) => void;
  children: ReactNode;
  fields: (editor: EditorFields) => ReactNode;
  wide?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => profileToForm(profile));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const unverified = !profile.verification_status;

  useEffect(() => {
    if (editing)
      formRef.current
        ?.querySelector<HTMLElement>("input, select, textarea")
        ?.focus();
  }, [editing]);
  function update(name: keyof ProfileFormValues, value: string) {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
    setError("");
  }
  function input(name: keyof ProfileFormValues): InputProps {
    return {
      id: name,
      name,
      value: values[name],
      onChange: event => update(name, event.target.value),
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `${name}-error` : undefined,
    };
  }
  function close() {
    setEditing(false);
    requestAnimationFrame(() => editRef.current?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    const result = validateProfileSection(values, section);
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
      const saved = await saveParticipantProfileFields(profile.id, result.data);
      onSaved(saved, section);
      setSuccess(`${title} saved.`);
      close();
    } catch {
      setError(
        "We couldn’t save your changes. Your entries are still here. Please try again.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      className={`${styles.card} ${wide ? styles.wideCard : ""}`}
      aria-labelledby={`${section}-heading`}
    >
      <div className={styles.cardHeader}>
        <h2 id={`${section}-heading`}>{title}</h2>
        {!editing && (
          <Button
            ref={editRef}
            className={styles.textButton}
            aria-label={`Edit ${title.toLowerCase()}`}
            onClick={() => {
              setValues(profileToForm(profile));
              setErrors({});
              setError("");
              setSuccess("");
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>
      {unverified && section !== "personal" && (
        <p className={styles.cardNotice}>
          <UnverifiedBadge />{" "}
          {section === "coursera"
            ? "Saving an email does not activate Coursera access."
            : "Self-reported; not yet verified."}
        </p>
      )}
      {editing ? (
        <form
          ref={formRef}
          onSubmit={submit}
          aria-label={`Edit ${title.toLowerCase()}`}
          noValidate
          aria-busy={saving}
        >
          <fieldset disabled={saving} className={styles.editFields}>
            <legend className={styles.srOnly}>{title}</legend>
            {fields({ values, errors, update, input })}
          </fieldset>
          {Object.values(errors).some(Boolean) && (
            <p role="alert" className={styles.error}>
              Please check the highlighted fields.
            </p>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.formActions}>
            <Button
              type="submit"
              className={styles.primaryButton}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              className={styles.secondaryButton}
              disabled={saving}
              onClick={close}
            >
              Cancel
            </Button>
            {saving && <span role="status">Saving {title.toLowerCase()}…</span>}
          </div>
        </form>
      ) : (
        children
      )}
      <p role="status" className={styles.success}>
        {success}
      </p>
    </section>
  );
}

function ProfileEditor({
  initialProfile,
  joinedAt,
}: {
  initialProfile: ParticipantProfile;
  joinedAt: string;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [editingFiles, setEditingFiles] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const verificationRef = useRef<HTMLDialogElement>(null);
  const unverified = !profile.verification_status;
  const joined = new Date(joinedAt);
  const memberSince = Number.isNaN(joined.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(joined);
  const initials =
    `${profile.first_name.slice(0, 1)}${profile.last_name.slice(0, 1)}`.toUpperCase();
  const branch = MILITARY_BRANCHES.find(
    option => option.value === profile.military_branch,
  )?.label;
  const affiliation = AFFILIATIONS.find(
    option => option.value === profile.affiliation,
  )?.label;
  const education = EDUCATION_LEVELS.find(
    option => option.value === profile.education_level,
  )?.label;
  const serviceDates = profile.service_start_date
    ? `${profile.service_start_date.slice(0, 4)}–${profile.service_end_date?.slice(0, 4) || "present"}`
    : undefined;

  useEffect(() => {
    if (verificationOpen) verificationRef.current?.showModal();
    else verificationRef.current?.close();
  }, [verificationOpen]);
  function saved(next: ParticipantProfile, section: ProfileSection) {
    // A slower save response must not replace a different card's newer values.
    setProfile(current => ({
      ...current,
      ...Object.fromEntries(
        PROFILE_SECTION_FIELDS[section].map(key => [key, next[key]]),
      ),
      verification_status: next.verification_status,
    }));
  }
  async function signOut() {
    setSigningOut(true);
    setAccountError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/login");
    } catch {
      setAccountError("We couldn’t log you out. Please try again.");
      setSigningOut(false);
    }
  }
  return (
    <>
      <header className={styles.navbar}>
        <Link href="/profile" aria-label="Veteran Transition Support profile">
          <Image
            src="/images/vts-logo.png"
            width={87}
            height={64}
            alt="Veteran Transition Support"
            priority
            className={styles.logo}
          />
        </Link>
        <nav aria-label="Participant navigation" className={styles.navActions}>
          <Link href="/my-workshops">My events</Link>
          {unverified && (
            <Button
              className={styles.verifyButton}
              onClick={() => setVerificationOpen(true)}
            >
              Verify veteran status
            </Button>
          )}
          <details className={styles.accountMenu}>
            <summary aria-label="Account menu" className={styles.avatar}>
              {initials || "VTS"}
            </summary>
            <div className={styles.accountDropdown}>
              <p>
                {profile.first_name} {profile.last_name}
              </p>
              <Button onClick={() => void signOut()} disabled={signingOut}>
                {signingOut ? "Logging out…" : "Log out"}
              </Button>
            </div>
          </details>
        </nav>
      </header>
      <main className={styles.content}>
        <div className={styles.pageHeading}>
          <h1>Your profile</h1>
          <div className={styles.goldRule} />
          <p>
            {memberSince && `Member since ${memberSince} · `}
            {unverified ? "Unverified" : "Verified"}
          </p>
        </div>
        {accountError && (
          <p role="alert" className={styles.error}>
            {accountError}
          </p>
        )}
        {unverified && (
          <section
            className={styles.statusBanner}
            aria-label="Profile verification"
          >
            <span className={styles.infoIcon}>
              <Image src="/images/info.svg" width={17} height={17} alt="" />
            </span>
            <div>
              <h2>Your profile is unverified</h2>
              <p>
                You can add your details and upload files now. Your military
                service, education, employment, and documents remain
                self-reported until VTS verifies your status.
              </p>
              <Button
                className={styles.textButton}
                onClick={() => setVerificationOpen(true)}
              >
                Verify veteran status →
              </Button>
            </div>
          </section>
        )}
        <div className={styles.cards}>
          <EditableCard
            title="Personal info"
            section="personal"
            profile={profile}
            onSaved={saved}
            wide
            fields={({ values, errors, update }) => (
              <>
                <p className={styles.editHint}>Fields marked * are required.</p>
                <PersonalFields
                  values={values}
                  errors={errors}
                  onChange={update}
                />
              </>
            )}
          >
            <dl className={styles.personalDetails}>
              <Detail
                label="Full name"
                value={`${profile.first_name} ${profile.last_name}`}
              />
              <Detail label="Email" value={profile.email} />
              <Detail label="Phone" value={profile.phone_number} />
              <Detail label="Affiliation" value={affiliation} />
            </dl>
          </EditableCard>
          <EditableCard
            title="Military service"
            section="military"
            profile={profile}
            onSaved={saved}
            fields={({ errors, input }) => (
              <div className={styles.fieldStack}>
                <Field
                  name="military_branch"
                  label="Military branch"
                  error={errors.military_branch}
                >
                  <select {...input("military_branch")}>
                    <option value="">Not provided / not applicable</option>
                    {MILITARY_BRANCHES.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field name="rank" label="Rank" error={errors.rank}>
                  <input {...input("rank")} maxLength={254} />
                </Field>
                <Field
                  name="mos"
                  label="MOS / military occupation"
                  error={errors.mos}
                >
                  <input {...input("mos")} maxLength={254} />
                </Field>
                <div className={styles.dateFields}>
                  <Field
                    name="service_start_date"
                    label="Service start date"
                    error={errors.service_start_date}
                  >
                    <input {...input("service_start_date")} type="date" />
                  </Field>
                  <Field
                    name="service_end_date"
                    label="Service end date"
                    error={errors.service_end_date}
                  >
                    <input {...input("service_end_date")} type="date" />
                  </Field>
                </div>
                <p className={styles.editHint}>
                  Leave the end date blank if you are still serving or it does
                  not apply.
                </p>
              </div>
            )}
          >
            <dl className={styles.details}>
              <Detail label="Branch" value={branch} />
              <Detail label="Rank" value={profile.rank} />
              <Detail label="MOS" value={profile.mos} />
              <Detail label="Years served" value={serviceDates} />
            </dl>
          </EditableCard>
          <EditableCard
            title="Education & employment"
            section="history"
            profile={profile}
            onSaved={saved}
            fields={({ errors, input }) => (
              <div className={styles.fieldStack}>
                <Field
                  name="education_level"
                  label="Highest education level"
                  error={errors.education_level}
                >
                  <select {...input("education_level")}>
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
                >
                  <textarea
                    {...input("education_history")}
                    rows={4}
                    maxLength={10000}
                    placeholder="Schools, degrees or training, and dates"
                  />
                </Field>
                <Field
                  name="employment_history"
                  label="Employment history"
                  error={errors.employment_history}
                >
                  <textarea
                    {...input("employment_history")}
                    rows={4}
                    maxLength={10000}
                    placeholder="Employers, roles, responsibilities, and dates"
                  />
                </Field>
              </div>
            )}
          >
            <dl className={styles.details}>
              <Detail label="Highest education level" value={education} />
              <Detail
                label="Education history"
                value={profile.education_history}
              />
              <Detail
                label="Employment history"
                value={profile.employment_history}
              />
            </dl>
          </EditableCard>
          <section
            className={styles.card}
            aria-labelledby="documents-card-heading"
          >
            <div className={styles.cardHeader}>
              <h2 id="documents-card-heading">Resume & documents</h2>
              <Button
                className={styles.textButton}
                aria-label={
                  editingFiles
                    ? "Done editing documents"
                    : "Edit resume and documents"
                }
                aria-expanded={editingFiles}
                onClick={() => setEditingFiles(current => !current)}
              >
                {editingFiles ? "Done" : "Edit"}
              </Button>
            </div>
            {unverified && (
              <p className={styles.cardNotice}>
                <UnverifiedBadge /> Files are not yet verified.
              </p>
            )}
            {editingFiles && (
              <p className={styles.editHint}>
                Uploads save immediately. Enter your history manually; files do
                not fill out your profile.
              </p>
            )}
            <DocumentUploads
              userId={profile.id}
              verified={profile.verification_status}
              kind="resumes"
              compact
              editable={editingFiles}
            />
            <DocumentUploads
              userId={profile.id}
              verified={profile.verification_status}
              kind="documents"
              compact
              editable={editingFiles}
            />
          </section>
          <EditableCard
            title="Coursera access"
            section="coursera"
            profile={profile}
            onSaved={saved}
            fields={({ errors, input }) => (
              <Field
                name="secondary_email"
                label="Secondary email (Coursera)"
                error={errors.secondary_email}
              >
                <input
                  {...input("secondary_email")}
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                />
                <p className={styles.editHint}>
                  Use the email associated with your Coursera access. This does
                  not change your login email or enroll you in Coursera.
                </p>
              </Field>
            )}
          >
            <dl className={styles.details}>
              <Detail label="Coursera email" value={profile.secondary_email} />
              <Detail
                label="Status"
                value={
                  profile.secondary_email
                    ? "Email saved · enrollment managed by VTS"
                    : "Add your Coursera email"
                }
              />
            </dl>
          </EditableCard>
        </div>
      </main>
      {unverified && (
        <dialog
          ref={verificationRef}
          className={styles.dialog}
          aria-labelledby="verification-title"
          onCancel={() => setVerificationOpen(false)}
          onClose={() => setVerificationOpen(false)}
        >
          <h2 id="verification-title">Veteran status verification</h2>
          <p>
            Verification is not available here yet. You can continue editing
            your profile and uploading supporting documents.
          </p>
          <p>
            Your profile remains unverified. No verification request has been
            submitted.
          </p>
          <Button
            className={styles.primaryButton}
            onClick={() => setVerificationOpen(false)}
          >
            Got it
          </Button>
        </dialog>
      )}
    </>
  );
}

export function ProfilePageContent() {
  return (
    <ParticipantAccess>
      {(user, profile) =>
        profile && (
          <ProfileEditor initialProfile={profile} joinedAt={user.created_at} />
        )
      }
    </ParticipantAccess>
  );
}
