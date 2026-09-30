import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { recordAction } from "./tracking-actions";
import { methodNames } from "./domain";
type Choice = { id: string; label: string };
export function RecordForm({
  jobChoices,
  versionChoices,
  jobId,
  method = "DIRECT",
}: {
  jobChoices: Choice[];
  versionChoices: Choice[];
  jobId?: string;
  method?: string;
}) {
  return (
    <ActionForm action={recordAction}>
      <input type="hidden" name="method" value={method} />
      <Field label="Opening" name="jobId">
        <select id="jobId" name="jobId" required defaultValue={jobId ?? ""}>
          <option value="">Choose a saved opening</option>
          {jobChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Resume file used" name="resumeVersionId">
        <select id="resumeVersionId" name="resumeVersionId" defaultValue="">
          <option value="">No file used / not selected</option>
          {versionChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What happened?" name="recordState">
        <select name="recordState" id="recordState" defaultValue="planned">
          <option value="planned">I am preparing this</option>
          <option value="sent">
            {method === "DIRECT"
              ? "I submitted the application"
              : `I sent the ${methodNames[method]?.toLowerCase() || "message"}`}
          </option>
        </select>
      </Field>
      <p className="text-sm text-muted-foreground">
        Record what you already did on the external site or in your assistant. Saving here does not
        send anything.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Date, destination and notes
        </summary>
        <div className="mt-4 space-y-4">
          <Field
            label="Date sent (India time)"
            name="sentDate"
            type="date"
            hint="Leave blank to use today when recording a sent action."
          />
          <Field label="Destination link" name="applicationUrl" type="url" />
          {method !== "DIRECT" && (
            <Field
              label="Recipient or contact"
              name="recipient"
              placeholder="Name, public profile or verified email"
            />
          )}
          <Field label="Notes" name="notes">
            <textarea id="notes" name="notes" rows={3} />
          </Field>
        </div>
      </details>
      <Button>{method === "DIRECT" ? "Save application record" : "Save outreach record"}</Button>
    </ActionForm>
  );
}
