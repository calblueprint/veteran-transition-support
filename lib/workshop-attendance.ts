import type { SupabaseClient } from "@supabase/supabase-js";

export type AttendanceStatus =
  "registered" | "attended" | "no_show" | "cancelled";
export type AttendanceChoice = Exclude<AttendanceStatus, "cancelled">;
export type Registrant = {
  id: string;
  participant_id: string;
  first_name: string | null;
  last_name: string | null;
  attendance_status: AttendanceStatus | null;
  registration_date: string | null;
};
export type WorkshopAttendance = {
  workshop: {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    location: string | null;
    capacity: number | null;
  };
  registrants: Registrant[];
};

export const attendanceLabels: Record<AttendanceStatus, string> = {
  registered: "Not marked",
  attended: "Attended",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export function registrantName(registrant: Registrant): string {
  return (
    [registrant.first_name, registrant.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Unavailable participant"
  );
}

export function attendanceStats({ workshop, registrants }: WorkshopAttendance) {
  const cancelled = registrants.filter(
    row => row.attendance_status === "cancelled",
  ).length;
  const registered = registrants.length - cancelled;
  return {
    registered,
    attended: registrants.filter(row => row.attendance_status === "attended")
      .length,
    noShow: registrants.filter(row => row.attendance_status === "no_show")
      .length,
    cancelled,
    capacityFilled:
      workshop.capacity === null
        ? null
        : workshop.capacity === 0
          ? 0
          : Math.round((registered / workshop.capacity) * 100),
  };
}

export async function loadWorkshopAttendance(
  client: SupabaseClient,
  workshopId: string,
): Promise<WorkshopAttendance | null> {
  const { data, error } = await client.rpc("admin_workshop_attendance", {
    target_workshop_id: workshopId,
  });
  if (error?.code === "22P02") return null;
  if (error)
    throw new Error(
      error.code === "42501"
        ? "Admin access required. Please sign in with an admin account."
        : "Could not load attendance. Please try again.",
    );
  return data as WorkshopAttendance | null;
}

export async function saveWorkshopAttendance(
  client: SupabaseClient,
  workshopId: string,
  registrant: Registrant,
  status: AttendanceChoice,
): Promise<void> {
  const { error } = await client.rpc("admin_mark_workshop_attendance", {
    target_workshop_id: workshopId,
    target_registration_id: registrant.id,
    new_status: status,
    expected_status: registrant.attendance_status,
  });
  if (error) {
    if (error.code === "42501")
      throw new Error(
        "Admin access required. Please sign in with an admin account.",
      );
    if (error.code === "P1004" || error.code === "P0002")
      throw new Error(
        "This registration changed. Refresh the roster and try again.",
      );
    throw new Error(
      "Could not save attendance. Please refresh the roster before trying again.",
    );
  }
}

function csvCell(value: string): string {
  // Quote every cell and neutralize spreadsheet formulas, including leading
  // whitespace/control characters. Names are participant-controlled input.
  const safe =
    /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value)
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function attendanceCsv({
  workshop,
  registrants,
}: WorkshopAttendance): string {
  const rows = [
    [
      "Workshop",
      "Registration ID",
      "Participant ID",
      "Name",
      "Status",
      "Registration date",
    ],
    ...registrants.map(row => [
      workshop.name,
      row.id,
      row.participant_id,
      registrantName(row),
      attendanceLabels[row.attendance_status ?? "registered"],
      row.registration_date ?? "",
    ]),
  ];
  return (
    "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
  );
}
