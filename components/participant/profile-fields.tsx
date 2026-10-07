import type {
  OnboardingValues,
  ProfileErrors,
  ProfileFormValues,
} from "@/lib/participant-profile";
import type { ChangeEvent, ReactNode } from "react";
import styles from "@/app/(participant)/profile/profile.module.css";
import { AFFILIATIONS } from "@/lib/participant-profile";

/** Keep the warning beside each field so its status remains clear while scrolling. */
export function UnverifiedBadge() {
  return <span className={styles.badge}>Unverified</span>;
}

export function Field({
  name,
  label,
  error,
  unverified = false,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  unverified?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={name}>
        {label} {unverified && <UnverifiedBadge />}
      </label>
      {children}
      {unverified && (
        <p id={`${name}-verification`} className={styles.hint}>
          Self-reported; not yet verified.
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Common contact fields have identical validation and labels in both flows. */
export function PersonalFields({
  values,
  errors,
  onChange,
}: {
  values: OnboardingValues;
  errors: ProfileErrors;
  onChange: (name: keyof ProfileFormValues, value: string) => void;
}) {
  function props(name: keyof OnboardingValues) {
    return {
      id: name,
      name,
      value: values[name],
      required: true,
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `${name}-error` : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        onChange(name, event.target.value),
    };
  }
  return (
    <div className={styles.grid}>
      <Field name="first_name" label="First name *" error={errors.first_name}>
        <input
          {...props("first_name")}
          maxLength={254}
          autoComplete="given-name"
        />
      </Field>
      <Field name="last_name" label="Last name *" error={errors.last_name}>
        <input
          {...props("last_name")}
          maxLength={254}
          autoComplete="family-name"
        />
      </Field>
      <Field name="email" label="Contact email *" error={errors.email}>
        <input
          {...props("email")}
          type="email"
          maxLength={254}
          autoComplete="email"
        />
        <p className={styles.hint}>
          Updating this address does not change your login email.
        </p>
      </Field>
      <Field
        name="phone_number"
        label="Phone number *"
        error={errors.phone_number}
      >
        <input
          {...props("phone_number")}
          type="tel"
          maxLength={40}
          autoComplete="tel"
        />
      </Field>
      <Field
        name="affiliation"
        label="Affiliation *"
        error={errors.affiliation}
      >
        <select {...props("affiliation")}>
          <option value="">Select an affiliation</option>
          {AFFILIATIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
