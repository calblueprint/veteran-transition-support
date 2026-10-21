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

/** Affiliation values shared by onboarding, profile editing, and the database. */
export const AFFILIATIONS = [
  { value: "veteran", label: "Veteran" },
  { value: "active-duty", label: "Active-duty" },
  { value: "reserve", label: "Reserve" },
  { value: "Guard", label: "Guard" },
  { value: "spouse", label: "Spouse" },
  { value: "base-staff", label: "Base staff" },
] as const;

export type MilitaryBranch = (typeof MILITARY_BRANCHES)[number]["value"];
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]["value"];
export type Affiliation = (typeof AFFILIATIONS)[number]["value"];

export type OnboardingValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  affiliation: string;
};

/** Empty strings represent unfilled controls; nullable columns are normalized on save. */
export type ProfileFormValues = OnboardingValues & {
  secondary_email: string;
  military_branch: string;
  rank: string;
  mos: string;
  service_start_date: string;
  service_end_date: string;
  education_level: string;
  education_history: string;
  employment_history: string;
};
export type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>;
export type OnboardingInput = Omit<OnboardingValues, "affiliation"> & {
  affiliation: Affiliation;
};
export type ParticipantProfileInput = OnboardingInput & {
  secondary_email: string | null;
  military_branch: MilitaryBranch | null;
  rank: string | null;
  mos: string | null;
  service_start_date: string | null;
  service_end_date: string | null;
  education_level: EducationLevel | null;
  education_history: string | null;
  employment_history: string | null;
};

/** Verification is read-only for participants and excluded from all edit payloads. */
export type ParticipantProfile = Omit<
  ParticipantProfileInput,
  "affiliation" | "phone_number"
> & {
  id: string;
  affiliation: Affiliation | null;
  phone_number: string | null;
  verification_status: boolean;
};

type ValidationResult<T> =
  { success: true; data: T } | { success: false; errors: ProfileErrors };

export const EMPTY_ONBOARDING: OnboardingValues = {
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  affiliation: "",
};
export const EMPTY_PROFILE: ProfileFormValues = {
  ...EMPTY_ONBOARDING,
  secondary_email: "",
  military_branch: "",
  rank: "",
  mos: "",
  service_start_date: "",
  service_end_date: "",
  education_level: "",
  education_history: "",
  employment_history: "",
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns only controlled form fields, never IDs or verification state. */
export function profileToForm(profile: ParticipantProfile): ProfileFormValues {
  return Object.fromEntries(
    Object.keys(EMPTY_PROFILE).map(key => [
      key,
      profile[key as keyof ProfileFormValues] ?? "",
    ]),
  ) as ProfileFormValues;
}

/** Validates the minimum details needed to create an unverified participant. */
export function validateOnboarding(
  values: Readonly<OnboardingValues>,
): ValidationResult<OnboardingInput> {
  const data = {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    email: values.email.trim(),
    phone_number: values.phone_number.trim(),
    affiliation: values.affiliation.trim(),
  };
  const errors: ProfileErrors = {};
  for (const [field, label] of [
    ["first_name", "First name"],
    ["last_name", "Last name"],
    ["email", "Email"],
    ["phone_number", "Phone number"],
  ] as const) {
    if (!data[field]) errors[field] = `${label} is required.`;
    else if (data[field].length > (field === "phone_number" ? 40 : 254))
      errors[field] = `${label} is too long.`;
  }
  if (data.email && !EMAIL_PATTERN.test(data.email))
    errors.email = "Enter a valid email address.";
  if (
    data.phone_number &&
    (!/^[+()\d\s.-]+$/.test(data.phone_number) ||
      data.phone_number.replace(/\D/g, "").length < 7 ||
      data.phone_number.replace(/\D/g, "").length > 15)
  ) {
    errors.phone_number = "Enter a phone number with 7–15 digits.";
  }
  const affiliation = AFFILIATIONS.find(
    option => option.value === data.affiliation,
  )?.value;
  if (!affiliation) errors.affiliation = "Select an affiliation.";
  if (!affiliation || Object.keys(errors).length)
    return { success: false, errors };
  return { success: true, data: { ...data, affiliation } };
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  // A round trip rejects impossible dates that Date would silently normalize.
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/**
 * Validates an incremental profile edit. Military and history fields are
 * optional because some affiliations have no military service or employment.
 *
 * @param currentDate Inclusive service-date limit in the user's local timezone.
 */
export function validateProfile(
  values: Readonly<ProfileFormValues>,
  currentDate: Date = new Date(),
): ValidationResult<ParticipantProfileInput> {
  const personal = validateOnboarding(values);
  const errors: ProfileErrors = personal.success ? {} : { ...personal.errors };
  // Enumerate editable fields so callers cannot inject IDs or verification state.
  const trimmed = Object.fromEntries(
    Object.keys(EMPTY_PROFILE).map(key => [
      key,
      values[key as keyof ProfileFormValues].trim(),
    ]),
  ) as ProfileFormValues;
  const branch =
    MILITARY_BRANCHES.find(option => option.value === trimmed.military_branch)
      ?.value ?? null;
  const education =
    EDUCATION_LEVELS.find(option => option.value === trimmed.education_level)
      ?.value ?? null;
  if (trimmed.military_branch && !branch)
    errors.military_branch = "Select a military branch.";
  if (trimmed.education_level && !education)
    errors.education_level = "Select an education level.";
  if (trimmed.secondary_email && !EMAIL_PATTERN.test(trimmed.secondary_email))
    errors.secondary_email = "Enter a valid email address.";
  for (const field of [
    "secondary_email",
    "rank",
    "mos",
    "education_history",
    "employment_history",
  ] as const) {
    const limit = field.endsWith("_history") ? 10000 : 254;
    if (trimmed[field].length > limit)
      errors[field] = `Use ${limit.toLocaleString()} characters or fewer.`;
  }
  // Calendar dates must not shift across midnight when converted to UTC.
  const today = [
    String(currentDate.getFullYear()).padStart(4, "0"),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
  for (const field of ["service_start_date", "service_end_date"] as const) {
    if (trimmed[field] && !isValidDate(trimmed[field]))
      errors[field] = "Enter a valid date.";
    else if (trimmed[field] > today)
      errors[field] = "Service date cannot be in the future.";
  }
  if (trimmed.service_end_date && !trimmed.service_start_date)
    errors.service_start_date = "Enter a start date before an end date.";
  if (
    !errors.service_start_date &&
    !errors.service_end_date &&
    trimmed.service_end_date &&
    trimmed.service_end_date < trimmed.service_start_date
  )
    errors.service_end_date =
      "Service end date cannot be before the start date.";
  if (!personal.success || Object.keys(errors).length)
    return { success: false, errors };
  return {
    success: true,
    data: {
      ...personal.data,
      secondary_email: trimmed.secondary_email || null,
      military_branch: branch,
      rank: trimmed.rank || null,
      mos: trimmed.mos || null,
      service_start_date: trimmed.service_start_date || null,
      service_end_date: trimmed.service_end_date || null,
      education_level: education,
      education_history: trimmed.education_history || null,
      employment_history: trimmed.employment_history || null,
    },
  };
}
