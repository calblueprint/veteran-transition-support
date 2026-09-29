// Match the public.military_branch and public.education_level database enums.
export const MILITARY_BRANCHES = [
  { value: "army", label: "Army" },
  { value: "navy", label: "Navy" },
  { value: "air_force", label: "Air Force" },
  { value: "marines", label: "Marines" },
  { value: "coast_guard", label: "Coast Guard" },
  { value: "space_force", label: "Space Force" },
] as const;

export const EDUCATION_LEVELS = [
  { value: "high_school", label: "High school" },
  { value: "some_college", label: "Some college" },
  { value: "associates", label: "Associate degree" },
  { value: "bachelors", label: "Bachelor’s degree" },
  { value: "masters", label: "Master’s degree" },
  { value: "doctorate", label: "Doctorate" },
] as const;

export type MilitaryBranch = (typeof MILITARY_BRANCHES)[number]["value"];
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]["value"];

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

export type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>;

export type ParticipantProfileInput = Omit<
  ProfileFormValues,
  "military_branch" | "education_level" | "service_end_date"
> & {
  military_branch: MilitaryBranch;
  education_level: EducationLevel;
  service_end_date: string | null;
};

// Existing records may have incomplete service/education information.
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
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function validateProfile(
  values: ProfileFormValues,
):
  | { success: true; data: ParticipantProfileInput }
  | { success: false; errors: ProfileErrors } {
  const trimmed = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.trim()]),
  ) as ProfileFormValues;
  const errors: ProfileErrors = {};

  const requiredFields = {
    first_name: "First name",
    last_name: "Last name",
    email: "Email",
    rank: "Rank",
    mos: "MOS / military occupation",
    service_start_date: "Service start date",
  } as const;
  for (const [field, label] of Object.entries(requiredFields)) {
    if (!trimmed[field as keyof typeof requiredFields]) {
      errors[field as keyof typeof requiredFields] = `${label} is required.`;
    }
  }
  if (trimmed.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (
    !MILITARY_BRANCHES.some(option => option.value === trimmed.military_branch)
  ) {
    errors.military_branch = "Select a military branch.";
  }
  if (
    !EDUCATION_LEVELS.some(option => option.value === trimmed.education_level)
  ) {
    errors.education_level = "Select an education level.";
  }
  for (const field of ["service_start_date", "service_end_date"] as const) {
    if (trimmed[field] && !isValidDate(trimmed[field])) {
      errors[field] = "Enter a valid date.";
    }
  }
  if (
    !errors.service_start_date &&
    !errors.service_end_date &&
    trimmed.service_end_date &&
    trimmed.service_end_date < trimmed.service_start_date
  ) {
    errors.service_end_date =
      "Service end date cannot be before the start date.";
  }
  if (Object.keys(errors).length) return { success: false, errors };

  return {
    success: true,
    data: {
      ...trimmed,
      military_branch: trimmed.military_branch as MilitaryBranch,
      education_level: trimmed.education_level as EducationLevel,
      service_end_date: trimmed.service_end_date || null,
    },
  };
}
