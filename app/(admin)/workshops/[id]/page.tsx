import WorkshopAttendanceContent from "@/components/admin/workshop-attendance-content";

export default async function WorkshopAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkshopAttendanceContent workshopId={id} />;
}
