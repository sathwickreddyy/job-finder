"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui";

export function MasterUpload({ versionId, revisionId }: { versionId: string; revisionId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const data = new FormData(form);
      data.set("expectedRevisionId", revisionId);
      const response = await fetch(`/api/v1/resumes/${versionId}/master`, {
        method: "POST",
        body: data,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The master could not be saved.");
      form.reset();
      dialog.current?.close();
      setSaved(true);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The master could not be saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        className="!h-10 !px-4"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
        aria-haspopup="dialog"
      >
        <Upload size={15} aria-hidden />
        Update master
      </Button>
      {saved && (
        <span role="status" className="text-xs text-muted-foreground">
          Master saved
        </span>
      )}
      <dialog
        ref={dialog}
        aria-label="Update the master résumé"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="ml-auto mr-0 mt-0 h-dvh max-h-none w-[min(32rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-6">
          <div>
            <h2 className="m-0 text-xl font-semibold">Update the master</h2>
            <p className="m-0 mt-2 text-xs text-muted-foreground">
              Save the edited DOCX and record what changed.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={pending}
            aria-label="Close master update"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden />
          </Button>
        </header>
        <form className="space-y-5 p-6" onSubmit={submit}>
          <label className="block space-y-2 text-sm">
            <span>Edited master DOCX</span>
            <input
              type="file"
              name="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required
              disabled={pending}
            />
            <span className="block text-xs font-normal text-muted-foreground">
              DOCX up to 10 MiB. The complete document becomes the new source.
            </span>
          </label>
          <label className="block space-y-2 text-sm">
            <span>Why did it change?</span>
            <textarea
              name="reason"
              required
              maxLength={4000}
              rows={3}
              disabled={pending}
              placeholder="Added project detail, corrected a date, or made wording clearer"
            />
          </label>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              PDF export and removed wording
            </summary>
            <div className="mt-4 space-y-4">
              <label className="block space-y-2 text-sm">
                <span>PDF export from this DOCX (optional)</span>
                <input type="file" name="pdf" accept=".pdf,application/pdf" disabled={pending} />
              </label>
              <p className="m-0 text-xs text-muted-foreground">
                Export the edited DOCX to PDF in Word or with your agent, then attach it here if you
                want a PDF preview for this revision.
              </p>
              <label className="block space-y-2 text-sm">
                <span>Removed wording</span>
                <select name="removedDisposition" defaultValue="retained" disabled={pending}>
                  <option value="retained">Keep earlier wording available for reuse</option>
                  <option value="incorrect">Facts were corrected — exclude removed claims</option>
                </select>
              </label>
            </div>
          </details>
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-action">
              {error}
            </p>
          )}
          <div className="flex gap-3 border-t border-border pt-4">
            <Button disabled={pending}>{pending ? "Saving master…" : "Save master"}</Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function CopyMasterWording({ text }: { text: string }) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mt-1 text-[11px] font-medium text-link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? "Copied" : "Copy wording"}
      </button>
      {failed && (
        <p role="status" className="text-xs text-muted-foreground">
          Select and copy the wording above.
        </p>
      )}
    </>
  );
}
