/**
 * @fileoverview Defines the profile form's data contract and validation rules.
 * This module has no React or Supabase dependencies so its rules can be tested
 * without a browser, credentials, or database writes.
 */

/** Maps public.military_branch enum values to participant-facing labels. */
export const MILITARY_BRANCHES = [
  { value: "army", label: "Army" },
  { value: "navy", label: "Navy" },
  { value: "air_force", label: "Air Force" },
  { value: "marines", label: "Marines" },
  { value: "coast_guard", label: "Coast Guard" },
  { value: "space_force", label: "Space Force" },
] as const;

/** Maps public.education_level enum values to participant-facing labels. */
export const EDUCATION_LEVELS = [
  { value: "high_school", label: "High school" },
  { value: "some_college", label: "Some college" },
  { value: "associates", label: "Associate degree" },
  { value: "bachelors", label: "Bachelor’s degree" },
  { value: "masters", label: "Master’s degree" },
  { value: "doctorate", label: "Doctorate" },
] as const;

/** A stored military branch value, derived from the dropdown's allowed values. */
export type MilitaryBranch = (typeof MILITARY_BRANCHES)[number]["value"];
/** A stored education value, derived from the dropdown's allowed values. */
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]["value"];

/** Raw input values; unfilled controls use empty strings rather than null. */
export type ProfileFormValues = {
  first_name: string;
  last_name: string;
  email: string;
  military_branch: string;
  rank: string;
  mos: string;
  service_start_date: string;
  service_end_date: string;
  education_level: string;
};

/** Field-specific messages; absent or undefined entries have no active error. */
export type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>;

/**
 * Editable database fields returned by validateProfile after normalization.
 * A null end date means the participant is still serving. Dates use YYYY-MM-DD.
 */
export type ParticipantProfileInput = Omit<
  ProfileFormValues,
  "military_branch" | "education_level" | "service_end_date"
> & {
  military_branch: MilitaryBranch;
  education_level: EducationLevel;
  service_end_date: string | null;
};

/**
 * The database projection loaded by the profile page.
 * Existing rows may have incomplete service or education information even
 * though the form requires those fields on its next save.
 */
export type ParticipantProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  military_branch: MilitaryBranch | null;
  rank: string | null;
  mos: string | null;
  service_start_date: string | null;
  service_end_date: string | null;
  education_level: EducationLevel | null;
};

/** Initial values for a participant who does not yet have a database row. */
export const EMPTY_PROFILE: ProfileFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  military_branch: "",
  rank: "",
  mos: "",
  service_start_date: "",
  service_end_date: "",
  education_level: "",
};

const REQUIRED_TEXT_FIELDS: ReadonlyArray<
  readonly [keyof ProfileFormValues, string]
> = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["email", "Email"],
  ["rank", "Rank"],
  ["mos", "MOS / military occupation"],
  ["service_start_date", "Service start date"],
];

/**
 * Converts a stored row into controlled input values without mutating it.
 * Database-only fields, including the participant ID, are omitted.
 */
export function profileToForm(profile: ParticipantProfile): ProfileFormValues {
  return {
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    military_branch: profile.military_branch ?? "",
    rank: profile.rank ?? "",
    mos: profile.mos ?? "",
    service_start_date: profile.service_start_date ?? "",
    service_end_date: profile.service_end_date ?? "",
    education_level: profile.education_level ?? "",
  };
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  // Date parsing can normalize impossible dates, such as February 30. A UTC
  // round trip rejects those values without depending on the browser's timezone.
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/**
 * Validates raw form values and returns either field errors or a save payload.
 * Trims input without mutating it and converts an empty end date to null.
 * Only editable fields are included in the result. These client-side checks
 * provide form feedback; database constraints and RLS enforce data access.
 *
 * @param currentDate Reference time for the inclusive service-date limit, using
 *     the participant's local calendar date. Defaults to the time of validation;
 *     tests can provide a fixed clock.
 */
export function validateProfile(
  values: Readonly<ProfileFormValues>,
  currentDate: Date = new Date(),
):
  | { success: true; data: ParticipantProfileInput }
  | { success: false; errors: ProfileErrors } {
  // Enumerate editable fields so unexpected properties cannot enter a write
  // payload if a caller passes an object that also contains database fields.
  const trimmed: ProfileFormValues = {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    email: values.email.trim(),
    military_branch: values.military_branch.trim(),
    rank: values.rank.trim(),
    mos: values.mos.trim(),
    service_start_date: values.service_start_date.trim(),
    service_end_date: values.service_end_date.trim(),
    education_level: values.education_level.trim(),
  };
  const errors: ProfileErrors = {};

  for (const [field, label] of REQUIRED_TEXT_FIELDS) {
    if (!trimmed[field]) {
      errors[field] = `${label} is required.`;
    }
  }
  if (trimmed.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
    errors.email = "Enter a valid email address.";
  }
  const militaryBranch = MILITARY_BRANCHES.find(
    option => option.value === trimmed.military_branch,
  )?.value;
  const educationLevel = EDUCATION_LEVELS.find(
    option => option.value === trimmed.education_level,
  )?.value;
  if (!militaryBranch) {
    errors.military_branch = "Select a military branch.";
  }
  if (!educationLevel) {
    errors.education_level = "Select an education level.";
  }
  // Service dates are calendar dates. UTC conversion could allow tomorrow in
  // western timezones or reject today in eastern timezones around midnight.
  const today = [
    String(currentDate.getFullYear()).padStart(4, "0"),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
  for (const field of ["service_start_date", "service_end_date"] as const) {
    if (trimmed[field] && !isValidDate(trimmed[field])) {
      errors[field] = "Enter a valid date.";
    } else if (trimmed[field] > today) {
      errors[field] = "Service date cannot be in the future.";
    }
  }
  // Valid YYYY-MM-DD strings sort chronologically, avoiding timezone conversion.
  if (
    !errors.service_start_date &&
    !errors.service_end_date &&
    trimmed.service_end_date &&
    trimmed.service_end_date < trimmed.service_start_date
  ) {
    errors.service_end_date =
      "Service end date cannot be before the start date.";
  }
  if (!militaryBranch || !educationLevel || Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      ...trimmed,
      military_branch: militaryBranch,
      education_level: educationLevel,
      service_end_date: trimmed.service_end_date || null,
    },
  };
}
