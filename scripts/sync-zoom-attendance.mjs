import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { calculateAttendance } from "../lib/zoom-attendance.ts";
import { fetchZoomReport } from "../lib/zoom-report.ts";

const usage = `Usage: pnpm attendance:sync --workshop-id <UUID> --meeting-uuid <Zoom instance UUID> [--apply]

Defaults to a read-only preview. --apply saves matched registrations atomically.
Configure server credentials in .env.local; see docs/zoom-attendance.md.`;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "workshop-id": { type: "string" },
      "meeting-uuid": { type: "string" },
      apply: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const workshopId = values["workshop-id"];
  const meetingUuid = values["meeting-uuid"];
  if (
    !workshopId ||
    !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(workshopId) ||
    !meetingUuid
  ) {
    throw new Error(usage);
  }

  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const report = await fetchZoomReport(
    {
      accountId: required("ZOOM_ACCOUNT_ID"),
      clientId: required("ZOOM_CLIENT_ID"),
      clientSecret: required("ZOOM_CLIENT_SECRET"),
    },
    meetingUuid,
  );
  const { totals, missingEmailCount } = calculateAttendance(report);
  const { data, error } = await supabase.rpc("sync_zoom_attendance", {
    p_workshop_id: workshopId,
    p_meeting_uuid: meetingUuid,
    p_attendance: totals,
    p_apply: values.apply,
  });
  if (error) throw new Error(`Attendance import failed: ${error.message}`);
  console.log(
    JSON.stringify(
      {
        mode: values.apply ? "saved" : "preview",
        report_rows: report.length,
        missing_email_rows: missingEmailCount,
        ...data,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Attendance import failed.",
  );
  process.exitCode = 1;
});
