import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui";
import { displayDate, type DisplayPreferences } from "@/features/candidate/preferences";
import { masterChanges, type MasterBlock } from "./document";
import type { Master } from "./service";
import { CopyMasterWording, MasterUpload } from "./upload";

function SourceBlocks({ blocks }: { blocks: MasterBlock[] }) {
  return (
    <>
      {blocks.map((block, index) =>
        block.kind === "heading" ? (
          <h3 key={index} className="mb-2 mt-7 text-sm font-semibold first:mt-0">
            {block.text}
          </h3>
        ) : (
          <p
            key={index}
            className={`m-0 my-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed ${block.kind === "bullet" ? "relative pl-4 before:absolute before:left-0 before:content-['•'] before:text-muted-foreground" : ""}`}
          >
            {block.text}
          </p>
        ),
      )}
    </>
  );
}
export function MasterView({
  master,
  familyName,
  preferences,
  legacyNotes,
}: {
  master: Master;
  familyName: string;
  preferences: DisplayPreferences;
  legacyNotes: string;
}) {
  const fileUrl = `/api/v1/resumes/${master.versionId}/master/file`;
  const date = (value: Date) => displayDate(value, preferences);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 text-xs text-muted-foreground">{familyName}</p>
          <h2 className="m-0 mt-1.5 text-xl font-semibold tracking-tight">Master résumé</h2>
          <p className="m-0 mt-2 break-all text-xs text-muted-foreground">
            {master.current.originalFilename}
          </p>
          <span className="mt-3 inline-flex rounded-full bg-selected px-2.5 py-0.5 text-[11px] font-medium text-selected-foreground">
            Source for application résumés
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="!h-10 !px-4" asChild>
            <a href={fileUrl}>
              <Download size={15} aria-hidden />
              Download DOCX
            </a>
          </Button>
          <MasterUpload versionId={master.versionId} revisionId={master.current.id} />
          {master.current.pdfStoragePath && (
            <Button variant="outline" className="!h-10 !px-4" asChild>
              <a href={`${fileUrl}?format=pdf`} target="_blank" rel="noopener">
                <ExternalLink size={15} aria-hidden />
                Preview PDF
              </a>
            </Button>
          )}
        </div>
      </header>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <section aria-label="Complete master source" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Complete source · no page limit</span>
            <span>Recorded {date(master.current.createdAt)}</span>
          </div>
          <div className="rounded-2xl border border-border bg-background px-5 py-6 sm:px-7">
            <SourceBlocks blocks={master.current.blocks} />
          </div>
        </section>
        <aside aria-label="Master ledger" className="min-w-0 rounded-3xl bg-rail px-5 pt-5">
          <h3 className="m-0 text-sm font-semibold">Master ledger</h3>
          <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
            Added and removed wording, with its date and reason.
          </p>
          <div className="mt-5 space-y-6">
            {master.revisions.map((revision, index) => {
              const previous = master.revisions[index + 1];
              const changes = previous ? masterChanges(previous.blocks, revision.blocks) : null;
              const excluded = revision.removedDisposition === "incorrect";
              const revisionUrl = `${fileUrl}?revision=${revision.id}`;
              return (
                <section
                  key={revision.id}
                  className="relative ml-1 border-l border-border pl-5 before:absolute before:-left-[4px] before:top-1.5 before:size-[7px] before:rounded-full before:bg-primary"
                >
                  <p className="m-0 text-[11px] text-muted-foreground">
                    {revision.sourceDate ? (
                      <>
                        Source dated {revision.sourceDate}
                        <span className="mt-0.5 block text-[10px]">
                          Recorded {date(revision.createdAt)}
                        </span>
                      </>
                    ) : (
                      date(revision.createdAt)
                    )}
                  </p>
                  <p className="m-0 mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {revision.reason}
                  </p>
                  {!changes ? (
                    <p className="m-0 mt-2 text-[11px] text-muted-foreground">
                      Initial source · {revision.blocks.length} paragraphs retained
                    </p>
                  ) : (
                    <>
                      {changes.added.length > 0 && (
                        <details open className="mt-3">
                          <summary className="cursor-pointer text-[11px] font-medium text-link">
                            Added · {changes.added.length}
                          </summary>
                          <div className="mt-2 space-y-2">
                            {changes.added.map((block, i) => (
                              <p
                                key={i}
                                className="m-0 break-words rounded-xl bg-selected px-3 py-2 text-[11px] leading-relaxed text-selected-foreground"
                              >
                                {block.text}
                              </p>
                            ))}
                          </div>
                        </details>
                      )}
                      {changes.removed.length > 0 && (
                        <details open className="mt-3">
                          <summary className="cursor-pointer text-[11px] font-medium text-danger-action">
                            {excluded ? "Corrected facts — excluded" : "Earlier wording retained"} ·{" "}
                            {changes.removed.length}
                          </summary>
                          <div className="mt-2 space-y-3">
                            {changes.removed.map((block, i) => (
                              <div
                                key={i}
                                className="rounded-xl border-l-2 border-danger-action bg-background px-3 py-2"
                              >
                                <p className="m-0 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                                  {block.text}
                                </p>
                                {!excluded && <CopyMasterWording text={block.text} />}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {!changes.added.length && !changes.removed.length && (
                        <p className="m-0 mt-2 text-[11px] text-muted-foreground">
                          Content retained; wording order or formatting updated.
                        </p>
                      )}
                    </>
                  )}
                  <a
                    href={revisionUrl}
                    className="mt-3 inline-flex text-[11px] font-medium text-link"
                  >
                    Download this DOCX
                  </a>
                </section>
              );
            })}
          </div>
          <section className="mt-6 border-t border-border py-4">
            <h3 className="m-0 text-xs font-medium">Editable source</h3>
            <p className="m-0 mt-2 text-xs leading-relaxed text-muted-foreground">
              Edit the DOCX in Word or with your agent, then use Update master to record the new
              source and its changes. Leaving a line out of an application copy keeps it available
              here.
            </p>
            {!master.current.pdfStoragePath && (
              <p className="m-0 mt-2 text-xs text-muted-foreground">
                No PDF export attached to this revision. Export the DOCX in Word or with your agent
                if needed.
              </p>
            )}
          </section>
          {legacyNotes && (
            <details className="border-t border-border py-4">
              <summary className="cursor-pointer text-xs font-medium">Earlier source notes</summary>
              <p className="m-0 mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                {legacyNotes}
              </p>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
