"use client";

import { useId, useState } from "react";
import { Download, FileText, PencilLine, X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { updateApplicationDetails } from "@/features/applications/record-actions";

function Header({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3 sm:px-6">
      <h2 id={id} className="m-0 min-w-0 truncate text-base font-semibold" title={title}>
        {title}
      </h2>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X aria-hidden size={18} />
      </button>
    </header>
  );
}

/** The application page URL, and the résumé while the record can still change it. */
export function EditDetails({
  recordId,
  applicationUrl,
  resumeVersionId,
  resumeLabel,
  editable,
  versions,
  addLink,
}: {
  recordId: string;
  applicationUrl: string | null;
  resumeVersionId: string | null;
  /** The sent résumé, shown locked once the application is sent. */
  resumeLabel: string | null;
  editable: boolean;
  versions: { id: string; label: string }[];
  /** Offers "Add link" beside Edit details, for an application with no page saved. */
  addLink?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const title = useId();
  return (
    <>
      {addLink && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full text-sm font-medium text-link"
        >
          Add link
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-link"
      >
        <PencilLine aria-hidden size={14} />
        Edit details
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} labelledBy={title}>
          <Header id={title} title="Edit details" onClose={() => setOpen(false)} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <ActionForm
              action={updateApplicationDetails}
              feedback="inverse"
              onSuccess={() => setOpen(false)}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={recordId} />
              <Field
                label="Application page URL"
                name="applicationUrl"
                type="url"
                defaultValue={applicationUrl ?? ""}
              />
              {editable ? (
                <Field label="Résumé file used" name="resumeVersionId">
                  <select
                    id="resumeVersionId"
                    name="resumeVersionId"
                    defaultValue={resumeVersionId ?? ""}
                  >
                    <option value="">No file used / not selected</option>
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <>
                  <input type="hidden" name="resumeVersionId" value={resumeVersionId ?? ""} />
                  <p className="m-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    The résumé sent stays fixed: {resumeLabel ?? "none recorded"}
                  </p>
                </>
              )}
              <Button variant="outline">Save details</Button>
            </ActionForm>
          </div>
        </Modal>
      )}
    </>
  );
}

/** The exact submitted PDF in a popup, with a download link. */
export function ResumePreview({
  versionId,
  label,
  filename,
}: {
  versionId: string;
  label: string;
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const title = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${label} · ${filename}`}
        className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-left text-link"
      >
        <FileText aria-hidden size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      <span className="block min-w-0 truncate text-xs text-muted-foreground" title={filename}>
        {filename}
      </span>
      {open && (
        <Modal open onClose={() => setOpen(false)} labelledBy={title} size="lg">
          <Header id={title} title={`${label} · ${filename}`} onClose={() => setOpen(false)} />
          <iframe
            title={`Preview of ${filename}`}
            src={`/api/resumes/${versionId}/file`}
            className="h-[70dvh] min-h-0 w-full flex-1 border-0 bg-muted max-sm:h-auto"
          />
          <footer className="shrink-0 border-t border-border bg-muted/30 px-5 py-3 sm:px-6">
            <a
              href={`/api/resumes/${versionId}/file?download=1`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-link"
            >
              <Download aria-hidden size={14} />
              Download
            </a>
          </footer>
        </Modal>
      )}
    </>
  );
}
