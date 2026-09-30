import { PageHeader } from "@/components/ui";
import { ImportForm } from "@/features/jobs/import-form";
export default function ImportJobs() {
  return (
    <>
      <PageHeader
        title="Import jobs"
        description="Paste structured discoveries, validate every row, then import with an explicit duplicate strategy."
      />
      <ImportForm />
    </>
  );
}
