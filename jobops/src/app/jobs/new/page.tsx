import { ActionForm } from "@/components/action-form";
import { PageHeader, Panel, Field, Button } from "@/components/ui";
import { addJob } from "@/features/jobs/actions";
export default function NewJob() {
  return (
    <>
      <PageHeader
        title="Add job"
        description="Save the source and description now so you can return even if the listing disappears."
      />
      <Panel className="max-w-4xl">
        <ActionForm action={addJob}>
          <div className="form-grid">
            <Field label="Company" name="company" required maxLength={200} />
            <Field label="Role / title" name="title" required maxLength={300} />
            <Field label="Location" name="location" />
            <Field label="Original job URL" name="url" type="url" required />
            <Field label="Source" name="source">
              <select name="source" id="source">
                {[
                  "MANUAL",
                  "COMPANY_CAREERS",
                  "NAUKRI",
                  "LINKEDIN",
                  "INSTAHYRE",
                  "WELLFOUND",
                  "CUTSHORT",
                  "OTHER",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Work mode" name="workMode">
              <select name="workMode" id="workMode">
                {["UNKNOWN", "REMOTE", "HYBRID", "ONSITE"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Minimum experience (years)"
              name="experienceMin"
              type="number"
              min="0"
              step="0.5"
            />
            <Field
              label="Maximum experience (years)"
              name="experienceMax"
              type="number"
              min="0"
              step="0.5"
            />
            <Field label="Posted date" name="postedAt" type="date" />
            <Field label="Employment type" name="employmentType" defaultValue="FULL_TIME" />
            <Field label="Minimum salary" name="salaryMin" type="number" min="0" />
            <Field label="Maximum salary" name="salaryMax" type="number" min="0" />
            <Field label="Currency" name="currency" placeholder="INR" />
          </div>
          <Field label="Job description" name="description">
            <textarea id="description" name="description" rows={10} />
          </Field>
          <Field label="Notes" name="notes">
            <textarea id="notes" name="notes" />
          </Field>
          <Button>Save job</Button>
        </ActionForm>
      </Panel>
    </>
  );
}
