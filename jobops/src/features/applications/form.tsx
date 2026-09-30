import { ActionForm } from "@/components/action-form";
import { Field, Button } from "@/components/ui";
import { applicationStages } from "@/db/schema";
import { createApplication, updateApplication } from "./actions";
type Choice = { id: string; label: string };
type Existing = {
  id: string;
  jobId: string;
  resumeVersionId: string | null;
  status: (typeof applicationStages)[number];
  applicationUrl: string | null;
  notes: string;
  nextActionAt: Date | null;
  appliedAt?: Date | null;
};
export function ApplicationForm({
  jobChoices,
  versionChoices,
  selectedJob,
  existing,
}: {
  jobChoices: Choice[];
  versionChoices: Choice[];
  selectedJob?: string;
  existing?: Existing;
}) {
  return (
    <ActionForm action={existing ? updateApplication : createApplication}>
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <div className="form-grid">
        <Field label="Job" name="jobId">
          {existing ? (
            <>
              <input type="hidden" name="jobId" value={existing.jobId} />
              <p>{jobChoices.find((j) => j.id === existing.jobId)?.label}</p>
            </>
          ) : (
            <select id="jobId" name="jobId" defaultValue={selectedJob} required>
              <option value="">Select a job</option>
              {jobChoices.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Resume version used" name="resumeVersionId">
          {existing?.appliedAt ? (
            <>
              <input type="hidden" name="resumeVersionId" value={existing.resumeVersionId ?? ""} />
              <p>
                {versionChoices.find((version) => version.id === existing.resumeVersionId)?.label ||
                  "No file recorded"}
              </p>
            </>
          ) : (
            <select
              name="resumeVersionId"
              id="resumeVersionId"
              defaultValue={existing?.resumeVersionId ?? ""}
            >
              <option value="">Not selected</option>
              {versionChoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Application stage" name="status">
          <select name="status" id="status" defaultValue={existing?.status ?? "PREPARING"}>
            {applicationStages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Follow-up / next action date"
          name="nextActionAt"
          type="date"
          defaultValue={existing?.nextActionAt?.toISOString().slice(0, 10)}
        />
      </div>
      <Field
        label="Application URL"
        name="applicationUrl"
        type="url"
        defaultValue={existing?.applicationUrl ?? ""}
      />
      <Field label="Notes" name="notes">
        <textarea id="notes" name="notes" defaultValue={existing?.notes} />
      </Field>
      <input type="hidden" name="humanConfirmed" value="on" />
      <p className="text-sm text-muted-foreground">
        Choose Applied only after the application was actually submitted. This form records the
        outcome; it does not send anything.
      </p>
      <Button>{existing ? "Save application" : "Create application"}</Button>
    </ActionForm>
  );
}
