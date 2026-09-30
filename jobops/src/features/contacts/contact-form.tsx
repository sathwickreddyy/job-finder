import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { contacts, contactVerificationStatuses } from "@/db/schema";
import { saveContact } from "./actions";
export function ContactForm({
  contact,
  company = "",
}: {
  contact?: typeof contacts.$inferSelect;
  company?: string;
}) {
  return (
    <ActionForm action={saveContact}>
      <input type="hidden" name="id" value={contact?.id ?? ""} />
      <div className="form-grid">
        <Field label="Company" name="company" required defaultValue={contact?.company ?? company} />
        <Field label="Name" name="name" required defaultValue={contact?.name ?? ""} />
        <Field label="Role / title" name="title" defaultValue={contact?.title ?? ""} />
        <Field
          label="Email (optional)"
          name="email"
          type="email"
          defaultValue={contact?.email ?? ""}
        />
        <Field
          label="LinkedIn or public profile URL"
          name="linkedinUrl"
          type="url"
          defaultValue={contact?.linkedinUrl ?? ""}
        />
        <Field
          label="Public source"
          name="source"
          required
          defaultValue={contact?.source ?? "MANUAL"}
          hint="Record a public URL or where this contact was found"
        />
        <Field label="Verification status" name="verificationStatus">
          <select
            id="verificationStatus"
            name="verificationStatus"
            defaultValue={contact?.verificationStatus ?? "UNKNOWN"}
          >
            {contactVerificationStatuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Verification evidence / source"
          name="verificationSource"
          defaultValue={contact?.verificationSource ?? ""}
          hint="Required for MANUAL_VERIFIED"
        />
        <div className="full">
          <Field label="Notes" name="notes">
            <textarea id="notes" name="notes" defaultValue={contact?.notes ?? ""} rows={4} />
          </Field>
        </div>
      </div>
      <Button type="submit">{contact ? "Save contact" : "Create contact"}</Button>
    </ActionForm>
  );
}
