"use client";

import type {
  Participant,
  ParticipantCertification,
  ParticipantRegistration,
} from "@/types/participant";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  fetchParticipantById,
  fetchParticipantCertifications,
  fetchParticipantRegistrations,
} from "@/actions/supabase/queries/participants";
import { EDUCATION_LEVELS, MILITARY_BRANCHES } from "@/lib/participant-profile";

export default function ParticipantDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [participant, setParticipant] = useState<Participant | null>(null);
  const [registrations, setRegistrations] = useState<ParticipantRegistration[]>(
    [],
  );
  const [certifications, setCertifications] = useState<
    ParticipantCertification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadParticipant() {
      setLoading(true);
      setError(null);
      setParticipant(null);
      setRegistrations([]);
      setCertifications([]);

      try {
        const [record, registrationRows, certificationRows] = await Promise.all(
          [
            fetchParticipantById(id),
            fetchParticipantRegistrations(id),
            fetchParticipantCertifications(id),
          ],
        );

        if (!ignore) {
          setParticipant(record);
          setRegistrations(registrationRows);
          setCertifications(certificationRows);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load participant details.",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadParticipant();

    return () => {
      ignore = true;
    };
  }, [id]);

  if (loading) {
    return <p role="status">Loading participant...</p>;
  }

  if (error) {
    return (
      <main>
        <Link href="/participants">Back to participants</Link>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!participant) {
    return (
      <main>
        <Link href="/participants">Back to participants</Link>
        <p>Participant not found or you do not have access to this record.</p>
      </main>
    );
  }

  const militaryBranch = MILITARY_BRANCHES.find(
    branch => branch.value === participant.military_branch,
  )?.label;

  const educationLevel = EDUCATION_LEVELS.find(
    level => level.value === participant.education_level,
  )?.label;

  const fields = [
    ["First name", participant.first_name],
    ["Last name", participant.last_name],
    ["Email", participant.email],
    ["Secondary email", participant.secondary_email],
    ["Phone number", participant.phone_number],
    ["Affiliation", participant.affiliation],
    ["Military branch", militaryBranch ?? participant.military_branch],
    ["Rank", participant.rank],
    ["MOS", participant.mos],
    ["Service start date", participant.service_start_date],
    ["Service end date", participant.service_end_date],
    ["Education level", educationLevel ?? participant.education_level],
    ["Education history", participant.education_history],
    ["Employment history", participant.employment_history],
    ["Resume URL", participant.resume_url],
    ["Verified", participant.verification_status ? "Yes" : "No"],
    ["Created at", participant.created_at],
  ] as const;

  // Workshop form dates use YYYY-MM-DD. Compare against today's local date.
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const upcoming: ParticipantRegistration[] = [];
  const past: ParticipantRegistration[] = [];
  const undated: ParticipantRegistration[] = [];

  for (const registration of registrations) {
    const workshop = registration.workshop;
    const lastDate = workshop?.end_date ?? workshop?.start_date;

    if (!lastDate) {
      undated.push(registration);
    } else if (lastDate < today) {
      past.push(registration);
    } else {
      upcoming.push(registration);
    }
  }

  upcoming.sort((a, b) =>
    (a.workshop?.start_date ?? a.workshop?.end_date ?? "").localeCompare(
      b.workshop?.start_date ?? b.workshop?.end_date ?? "",
    ),
  );

  past.sort((a, b) =>
    (b.workshop?.end_date ?? b.workshop?.start_date ?? "").localeCompare(
      a.workshop?.end_date ?? a.workshop?.start_date ?? "",
    ),
  );

  const workshopGroups = [
    { title: "Upcoming and ongoing workshops", rows: upcoming },
    { title: "Past workshops", rows: past },
    { title: "Undated or unavailable workshops", rows: undated },
  ];

  return (
    <main>
      <Link href="/participants">Back to participants</Link>

      <h1>
        {participant.first_name} {participant.last_name}
      </h1>

      <section>
        <h2>Profile information</h2>

        <dl>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>
                <strong>{label}</strong>
              </dt>
              <dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {value?.trim() ? value : "Not provided"}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2>Workshop registrations</h2>

        {registrations.length === 0 ? (
          <p>No workshop registrations found.</p>
        ) : (
          workshopGroups.map(group => (
            <section key={group.title}>
              <h3>{group.title}</h3>

              {group.rows.length === 0 ? (
                <p>No workshops in this category.</p>
              ) : (
                <ul>
                  {group.rows.map(registration => (
                    <li key={registration.id}>
                      <h4>
                        {registration.workshop?.name ??
                          "Workshop details unavailable"}
                      </h4>
                      <p>
                        Start:{" "}
                        {registration.workshop?.start_date ?? "Not provided"}
                      </p>
                      <p>
                        End: {registration.workshop?.end_date ?? "Not provided"}
                      </p>
                      <p>
                        Location:{" "}
                        {registration.workshop?.location ?? "Not provided"}
                      </p>
                      <p>Registered: {registration.registration_date}</p>
                      <p>Status: {registration.attendance_status}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </section>

      <section>
        <h2>Certifications</h2>

        {certifications.length === 0 ? (
          <p>No certifications found.</p>
        ) : (
          <ul>
            {certifications.map(award => (
              <li key={award.id}>
                <h3>
                  {award.certification?.name ??
                    "Certification details unavailable"}
                </h3>
                <p>
                  Issued by:{" "}
                  {award.certification?.issuing_org ?? "Not provided"}
                </p>

                {award.certification?.description && (
                  <p>{award.certification.description}</p>
                )}

                <p>Earned: {award.date_earned ?? "Not provided"}</p>
                <p>Expires: {award.expiration_date ?? "Not provided"}</p>

                {award.expiration_date && award.expiration_date < today && (
                  <p>Expired</p>
                )}

                {award.certificate_file_url &&
                  (/^https?:\/\//i.test(award.certificate_file_url) ? (
                    <a
                      href={award.certificate_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View certificate
                    </a>
                  ) : (
                    <p>Certificate file: {award.certificate_file_url}</p>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
