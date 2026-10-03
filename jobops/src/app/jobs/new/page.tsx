import Link from "next/link";
import { readOpeningMail } from "@/features/mail/handled";
import { actionError } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Panel, Field, Button } from "@/components/ui";
import { addJob } from "@/features/jobs/actions";
export default async function NewJob({
  searchParams,
}: {
  searchParams: Promise<{ fromMail?: string }>;
}) {
  const { fromMail } = await searchParams;
  let mail: Awaited<ReturnType<typeof readOpeningMail>> | undefined;
  let error: string | undefined;
  if (fromMail !== undefined) {
    try {
      mail = await readOpeningMail(fromMail);
    } catch (cause) {
      error = actionError(cause).error;
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Save a job description"
        description="Bring back the exact company, role, source link and full description."
      />
      <Panel>
        {error ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-2xl bg-danger-soft p-4 text-destructive">
              {error}
            </p>
            <Link href="/applications?tab=emails" className="text-link">
              Return to Emails
            </Link>
          </div>
        ) : (
          <ActionForm action={addJob}>
            {mail && (
              <>
                <input type="hidden" name="fromMailId" value={mail.id} />
                <div className="space-y-2 rounded-2xl bg-selected p-4 text-sm text-selected-foreground">
                  <p className="m-0 break-words font-medium">
                    Saving a role from mail: {mail.subject}
                  </p>
                  <p className="m-0 break-words">
                    From {mail.senderName || mail.sender}. Confirm the company, role and original
                    job link below.
                  </p>
                  <Link className="text-link underline" href={`/mail/${mail.id}`}>
                    Read source email
                  </Link>
                </div>
              </>
            )}
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
                defaultValue={mail ? mail.bodyText || mail.snippet : undefined}
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
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    maxLength={20000}
                    defaultValue={
                      mail
                        ? `From ${mail.senderName || mail.sender}: ${mail.subject}\nSource email: /mail/${mail.id}`
                        : undefined
                    }
                  />
                </Field>
              </div>
            </details>
            <Button>Save job</Button>
          </ActionForm>
        )}
      </Panel>
    </div>
  );
}
