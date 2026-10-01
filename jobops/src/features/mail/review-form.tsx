import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { mailClassifications, mailEvents } from "@/db/schema";
import { reviewMailEvent } from "./actions";
export function MailReviewForm({
  event,
  applications,
}: {
  event: typeof mailEvents.$inferSelect;
  applications: { id: string; company: string; title: string; status: string }[];
}) {
  const suggested =
    event.linkedApplicationId ??
    (typeof event.details.suggestedApplicationId === "string"
      ? event.details.suggestedApplicationId
      : "");
  return (
    <ActionForm action={reviewMailEvent}>
      <input type="hidden" name="eventId" value={event.id} />
      <div className="form-grid">
        <Field name={`application-${event.id}`} label="Link to record">
          <select id={`application-${event.id}`} name="applicationId" defaultValue={suggested}>
            <option value="">Choose a record</option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.company} — {application.title} ({application.status})
              </option>
            ))}
          </select>
        </Field>
        <Field name={`classification-${event.id}`} label="Message category">
          <select id={`classification-${event.id}`} name="type" defaultValue={event.type}>
            {mailClassifications.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Also change the application stage
        </summary>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="updateStage" className="mt-1" />
          <span>
            Also update the application stage using this classification.
            <span className="field-hint block">
              Acknowledgement → Acknowledged; Assessment → Assessment; Interview → Recruiter screen;
              Rejection → Rejected; Offer → Offer. Leave unchecked to append history only.
            </span>
          </span>
        </label>
      </details>
      <div className="actions">
        <Button name="decision" value="APPEND" type="submit">
          Link message
        </Button>
        <Button variant="outline" name="decision" value="DISMISS" type="submit">
          Keep unlinked
        </Button>
      </div>
    </ActionForm>
  );
}
