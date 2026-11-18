import { JobForm } from "@/components/jobs/job-form";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobForm key={id} id={id} />;
}
