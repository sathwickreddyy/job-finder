import Link from "next/link";
import { Panel, PageHeader } from "@/components/ui";
import { TaskForm } from "@/features/tasks/form";
import { taskOptions } from "@/features/tasks/read";
export default async function NewTask({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; jobId?: string; profileId?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="mb-5 inline-block text-sm text-link">
        ← Home
      </Link>
      <PageHeader
        title="Start a task"
        description="Set the outcome. Refine the details with your assistant."
      />
      <Panel>
        <TaskForm
          options={await taskOptions()}
          kind={params.kind}
          jobId={params.jobId}
          profileId={params.profileId}
        />
      </Panel>
    </div>
  );
}
