import { Field, Button } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { candidateProfiles } from "@/db/schema";
import { saveCandidate } from "./actions";
import { remotePreferences } from "./validation";

type Candidate = typeof candidateProfiles.$inferSelect;
const fields: [keyof Candidate, string, string?][] = [
  ["fullName", "Full name"],
  ["preferredName", "Preferred name"],
  ["primaryEmail", "Primary email", "email"],
  ["phone", "Phone", "tel"],
  ["currentCity", "Current city"],
  ["country", "Country"],
  ["yearsOfExperience", "Years of experience", "number"],
  ["currentCompany", "Current company"],
  ["currentRole", "Current role"],
  ["noticePeriod", "Notice period"],
  ["lastWorkingDay", "Last working day", "date"],
  ["currentCompensation", "Current compensation (optional)"],
  ["expectedCompensation", "Expected compensation (optional)"],
  ["linkedinUrl", "LinkedIn URL", "url"],
  ["githubUrl", "GitHub URL", "url"],
  ["portfolioUrl", "Portfolio URL", "url"],
];
export function CandidateForm({ candidate }: { candidate?: Candidate }) {
  return (
    <ActionForm action={saveCandidate}>
      <div className="form-grid">
        {fields.map(([name, label, type]) => (
          <Field
            key={name}
            name={name}
            label={label}
            type={type ?? "text"}
            defaultValue={
              name === "lastWorkingDay"
                ? (candidate?.lastWorkingDay?.toISOString().slice(0, 10) ?? "")
                : String(candidate?.[name] ?? "")
            }
            step={name === "yearsOfExperience" ? "0.1" : undefined}
            min={type === "number" ? 0 : undefined}
          />
        ))}
        <Field
          label="Preferred locations"
          id="candidatePreferredLocations"
          name="preferredLocations"
          defaultValue={candidate?.preferredLocations.join(", ") ?? ""}
          hint="Comma-separated locations"
        />
        <Field
          label="Desired roles"
          id="candidateDesiredRoles"
          name="desiredRoles"
          defaultValue={candidate?.desiredRoles.join(", ") ?? ""}
          hint="Comma-separated roles"
        />
        <Field label="Remote preference" name="candidateRemotePreference">
          <select
            id="candidateRemotePreference"
            name="remotePreference"
            defaultValue={candidate?.remotePreference ?? "UNKNOWN"}
          >
            {remotePreferences.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field
          name="workAuthorization"
          label="Work authorization"
          defaultValue={candidate?.workAuthorization ?? "UNKNOWN"}
          hint="Use UNKNOWN until you supply an explicit answer"
        />
        <Field
          name="sponsorship"
          label="Sponsorship requirement"
          defaultValue={candidate?.sponsorship ?? "UNKNOWN"}
        />
        <Field
          name="relocationPreference"
          label="Relocation preference"
          defaultValue={candidate?.relocationPreference ?? "UNKNOWN"}
        />
        <div className="full">
          <Field name="careerSummary" label="Career summary">
            <textarea
              id="careerSummary"
              name="careerSummary"
              rows={4}
              defaultValue={candidate?.careerSummary ?? ""}
            />
          </Field>
        </div>
        <div className="full" id="standard-answers">
          <Field
            name="standardAnswers"
            label="Standard application answers"
            hint={
              'JSON object of question → answer. Use "UNKNOWN" when you have not answered a question.'
            }
          >
            <textarea
              id="standardAnswers"
              name="standardAnswers"
              rows={7}
              className="font-mono text-xs"
              defaultValue={JSON.stringify(
                candidate?.standardAnswers ?? {
                  "Are you authorized to work in India?": "UNKNOWN",
                  "Do you require sponsorship?": "UNKNOWN",
                },
                null,
                2,
              )}
            />
          </Field>
        </div>
        <div className="full">
          <details>
            <summary>Additional structured metadata</summary>
            <Field name="metadata" label="Metadata (JSON object)">
              <textarea
                id="metadata"
                name="metadata"
                rows={5}
                className="font-mono text-xs"
                defaultValue={JSON.stringify(candidate?.metadata ?? {}, null, 2)}
              />
            </Field>
          </details>
        </div>
      </div>
      <div className="form-footer">
        <Button type="submit">Save candidate profile</Button>
        <span className="field-hint">Canonical facts used by approved missions.</span>
      </div>
    </ActionForm>
  );
}
