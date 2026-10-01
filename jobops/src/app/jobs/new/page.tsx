import { ActionForm } from "@/components/action-form";
import { PageHeader, Panel, Field, Button } from "@/components/ui";
import { addJob } from "@/features/jobs/actions";
export default function NewJob() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Save a job description"
        description="Bring back the exact company, role, source link and full description."
      />
      <Panel>
        <ActionForm action={addJob}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" name="company" required maxLength={200} />
            <Field label="Role / title" name="title" required maxLength={300} />
          </div>
          <Field label="Original job URL" name="url" type="url" required />
          <Field label="Job description" name="description">
            <textarea
              id="description"
              name="description"
              required
              rows={12}
              maxLength={100000}
              placeholder="Paste the complete description from the original listing."
            />
          </Field>
          <details>
            <summary className="cursor-pointer font-medium">Location and extra details</summary>
            <div className="mt-4 space-y-4">
              <Field
                label="Location"
                name="location"
                placeholder="Bengaluru, Pune, remote in India…"
              />
              <Field label="Source" name="source">
                <select id="source" name="source">
                  <option value="">Detect from job link</option>
                  {[
                    "LINKEDIN",
                    "NAUKRI",
                    "INSTAHYRE",
                    "CUTSHORT",
                    "HIRIST",
                    "COMPANY_CAREERS",
                    "OTHER",
                  ].map((source) => (
                    <option key={source} value={source}>
                      {source.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes" name="notes">
                <textarea id="notes" name="notes" rows={3} />
              </Field>
            </div>
          </details>
          <Button>Save job</Button>
        </ActionForm>
      </Panel>
    </div>
  );
}
