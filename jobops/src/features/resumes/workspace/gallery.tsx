"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, Copy, Download, MoreVertical, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PdfPreview } from "../file-ui";
import { initialFile, type GalleryFamily, type GalleryFile } from "../view-types";
import { DetailSection, FileHeader, UsedFor } from "./pane";
import { FileStrip, ResumeRail, type RailVariant } from "./rail";

type Layout = "reader" | "inspector" | "strip";
type Picks = Partial<Record<"layout" | "rail", string>>;

function Actions({ file, onInert }: { file: GalleryFile; onInert: () => void }) {
  return (
    <>
      <Button variant="outline" size="lg" className="!h-10 !px-4" asChild>
        <a href={`/api/resumes/${file.id}/file?download=1`}>
          <Download size={15} aria-hidden />
          Download
        </a>
      </Button>
      <Button size="lg" className="!h-10 !px-4" onClick={onInert}>
        <Upload size={15} aria-hidden />
        Upload revision
      </Button>
      <details className="relative">
        <summary
          aria-label="More file actions"
          className="grid size-10 cursor-pointer list-none place-items-center rounded-full !p-0 hover:bg-muted [&::-webkit-details-marker]:hidden"
        >
          <MoreVertical size={18} aria-hidden />
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-2xl border border-border bg-popover p-2 shadow-surface">
          {!file.isDefault && (
            <button
              type="button"
              onClick={onInert}
              className="block w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"
            >
              Use as default for new applications
            </button>
          )}
          <button
            type="button"
            onClick={onInert}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-destructive hover:bg-danger-soft"
          >
            Archive this resume
          </button>
          <p className="m-0 px-3 pb-1 pt-2 text-[11px] leading-relaxed text-muted-foreground">
            Archiving keeps every PDF and the applications that used them.
          </p>
        </div>
      </details>
    </>
  );
}

function Details({ file }: { file: GalleryFile }) {
  return (
    <div>
      <DetailSection
        title="Bullet changes"
        status={file.changeNotes ? "Recorded" : "None recorded"}
      >
        <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {file.changeNotes ||
            "Record original bullet, revised wording and the facts you confirmed. Saved changes appear here."}
        </p>
      </DetailSection>
      <DetailSection
        title="Assessments"
        status={file.assessmentCount ? `${file.assessmentCount} saved` : "None yet"}
      >
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          Paste an estimate from your assistant for a specific saved job description. Assessments
          stay labelled with their source and are not employer ATS results.
        </p>
      </DetailSection>
    </div>
  );
}

function Workspace({
  families,
  layout,
  rail,
}: {
  families: GalleryFamily[];
  layout: Layout;
  rail: RailVariant;
}) {
  const files = families.flatMap((family) => family.files);
  const [selectedId, setSelectedId] = useState(initialFile(files)?.id);
  const [narrowDetail, setNarrowDetail] = useState(false);
  const [note, setNote] = useState("");
  const file = files.find((item) => item.id === selectedId) ?? files[0];
  if (!file)
    return (
      <p className="rounded-panel border border-border bg-card p-8 text-muted-foreground">
        Upload a resume to try the workspace.
      </p>
    );
  const inert = () => setNote("Gallery preview: actions are shown, not saved.");
  const select = (next: GalleryFile) => {
    setSelectedId(next.id);
    setNarrowDetail(true);
    setNote("");
  };
  const uploadAction = (
    <Button className="w-full !min-h-10" onClick={inert}>
      <Plus size={16} aria-hidden />
      Upload a resume
    </Button>
  );
  const footer = (
    <a href="#" onClick={(event) => event.preventDefault()} className="px-3 text-xs">
      Include archived resumes
    </a>
  );
  const back = (
    <button
      type="button"
      onClick={() => setNarrowDetail(false)}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-link lg:hidden"
    >
      <ArrowLeft size={15} aria-hidden />
      All files
    </button>
  );
  const status = note && (
    <p role="status" className="m-0 mt-3 text-xs text-muted-foreground">
      {note}
    </p>
  );
  const header = (
    <>
      <FileHeader file={file} actions={<Actions file={file} onInert={inert} />} />
      {status}
    </>
  );

  if (layout === "strip")
    return (
      <div className="overflow-hidden rounded-panel border border-border bg-card shadow-surface">
        <div className="border-b border-border bg-rail/60">
          <FileStrip
            families={families}
            selectedId={file.id}
            onSelect={select}
            action={
              <button
                type="button"
                onClick={inert}
                className="flex min-h-[4.5rem] w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-xs font-medium text-link hover:bg-muted/60"
              >
                <Plus size={18} aria-hidden />
                Upload a resume
              </button>
            }
          />
        </div>
        <div className="p-5 sm:p-6">
          {header}
          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <PdfPreview file={file} height="h-[760px]" />
            <div className="space-y-6">
              <UsedFor file={file} />
              <div className="border-t border-border">
                <Details file={file} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );

  const railColumn = (
    <aside
      className={cn(
        "border-b border-border bg-rail/60 lg:border-b-0 lg:border-r",
        narrowDetail && "hidden lg:block",
      )}
    >
      <ResumeRail
        families={families}
        selectedId={file.id}
        variant={rail}
        onSelect={select}
        action={uploadAction}
        footer={footer}
      />
    </aside>
  );

  if (layout === "inspector")
    return (
      <div className="grid overflow-hidden rounded-panel border border-border bg-card shadow-surface lg:grid-cols-[236px_minmax(0,1fr)]">
        {railColumn}
        <div className={cn("min-w-0 p-5 sm:p-6", !narrowDetail && "hidden lg:block")}>
          {back}
          {header}
          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_288px]">
            <div className="xl:sticky xl:top-4">
              <PdfPreview file={file} height="h-[700px]" />
            </div>
            <div className="rounded-3xl bg-rail px-5 pt-5">
              <UsedFor file={file} className="pb-2" />
              <div className="mt-3 border-t border-border">
                <Details file={file} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="grid overflow-hidden rounded-panel border border-border bg-card shadow-surface lg:grid-cols-[264px_minmax(0,1fr)]">
      {railColumn}
      <div className={cn("min-w-0 p-5 sm:p-6", !narrowDetail && "hidden lg:block")}>
        {back}
        {header}
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
          <PdfPreview file={file} height="h-[580px]" />
          <UsedFor file={file} />
        </div>
        <div className="mt-6 border-t border-border">
          <Details file={file} />
        </div>
      </div>
    </div>
  );
}

function Option({
  section,
  letter,
  name,
  note,
  picks,
  onChoose,
  recommended = false,
  children,
}: {
  section: keyof Picks;
  letter: string;
  name: string;
  note: string;
  picks: Picks;
  onChoose: (section: keyof Picks, letter: string) => void;
  recommended?: boolean;
  children: ReactNode;
}) {
  const chosen = picks[section] === letter;
  return (
    <section
      aria-label={`${section} option ${letter}`}
      className={cn(
        "rounded-[2rem] border p-3 sm:p-4",
        chosen ? "border-primary ring-1 ring-primary" : "border-border/70",
      )}
    >
      <header className="mb-4 flex flex-wrap items-center gap-3 px-1">
        <span className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
          {letter}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="m-0 text-base font-semibold">{name}</h3>
            {recommended && (
              <span className="text-[11px] font-medium text-primary">Recommended</span>
            )}
          </div>
          <p className="m-0 mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
        <Button
          size="sm"
          variant={chosen ? "default" : "outline"}
          onClick={() => onChoose(section, letter)}
          aria-pressed={chosen}
          aria-label={`Choose ${section} ${letter}`}
          className="!h-9 px-4"
        >
          {chosen && <Check size={14} aria-hidden />}
          {chosen ? "Selected" : `Choose ${letter}`}
        </Button>
      </header>
      {children}
    </section>
  );
}

export function ResumeWorkspaceGallery({ families }: { families: GalleryFamily[] }) {
  const [picks, setPicks] = useState<Picks>({});
  const [copied, setCopied] = useState("");
  const choose = (section: keyof Picks, letter: string) => {
    setPicks((current) => ({ ...current, [section]: letter }));
    setCopied("");
  };
  const files = families.flatMap((family) => family.files);
  const selected = initialFile(files)?.id;
  const summary = `Resume workspace choices: layout ${picks.layout ?? "not chosen"}, rail rows ${picks.rail ?? "not chosen"}.`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied("Copied. Paste your choices into the chat.");
    } catch {
      setCopied("Reply in the chat with the letters you chose.");
    }
  }
  const shared = { picks, onChoose: choose };
  return (
    <div className="space-y-8 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            One-page resume workspace
          </h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
            Every option puts the file list, the PDF and where it was sent on one page. Click files
            in each option to switch between them. Your real files are shown read-only.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/resumes">Current resume page</Link>
        </Button>
      </header>

      <section id="layout" className="scroll-mt-20 space-y-5">
        <div className="max-w-2xl">
          <h2 className="m-0 text-xl font-semibold tracking-tight">Page layout</h2>
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            How the file list, the PDF and its details share the page.
          </p>
        </div>
        <Option
          section="layout"
          letter="A"
          name="Rail and reader"
          note="Files on the left; PDF beside Used for; changes and assessments below the PDF."
          {...shared}
        >
          <Workspace families={families} layout="reader" rail="grouped" />
        </Option>
        <Option
          section="layout"
          letter="B"
          name="Rail, PDF and inspector"
          note="Three columns: everything about the file sits beside the PDF, no scrolling past it."
          recommended
          {...shared}
        >
          <Workspace families={families} layout="inspector" rail="grouped" />
        </Option>
        <Option
          section="layout"
          letter="C"
          name="File strip on top"
          note="Files become a row of tiles above the page, giving the PDF the most width."
          {...shared}
        >
          <Workspace families={families} layout="strip" rail="grouped" />
        </Option>
      </section>

      <section id="rail" className="scroll-mt-20 space-y-5">
        <div className="max-w-2xl">
          <h2 className="m-0 text-xl font-semibold tracking-tight">File list rows</h2>
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            How each PDF reads in the left list (layouts A and B). Search “Oracle” or filter to sent
            files.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {(
            [
              ["A", "grouped", "Compact list", "Version name first, with an applications count."],
              [
                "B",
                "lineage",
                "Revision lineage",
                "Versions on a branch from the original, with the companies each one reached.",
              ],
              ["C", "sent", "Sent-to first", "Leads with the companies each PDF went to."],
            ] as const
          ).map(([letter, variant, name, note]) => (
            <Option
              key={letter}
              section="rail"
              letter={letter}
              name={name}
              note={note}
              recommended={letter === "B"}
              {...shared}
            >
              <RailPreview families={families} variant={variant} initial={selected} />
            </Option>
          ))}
        </div>
      </section>

      <aside
        aria-label="Your design choices"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 py-3 shadow-surface"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="m-0 text-xs text-muted-foreground">
            Layout <strong className="ml-1 mr-4 text-foreground">{picks.layout ?? "—"}</strong>
            Rows <strong className="ml-1 text-foreground">{picks.rail ?? "—"}</strong>
          </p>
          <Button size="sm" onClick={copy} disabled={!picks.layout && !picks.rail}>
            <Copy size={14} aria-hidden />
            Copy choices
          </Button>
          {copied && (
            <span role="status" className="w-full text-xs text-muted-foreground">
              {copied}
            </span>
          )}
        </div>
      </aside>
    </div>
  );
}

function RailPreview({
  families,
  variant,
  initial,
}: {
  families: GalleryFamily[];
  variant: RailVariant;
  initial?: string;
}) {
  const [selectedId, setSelectedId] = useState(initial);
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-rail/60">
      <ResumeRail
        families={families}
        selectedId={selectedId}
        variant={variant}
        onSelect={(file) => setSelectedId(file.id)}
      />
    </div>
  );
}
