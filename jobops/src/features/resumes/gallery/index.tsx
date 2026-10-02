"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ResumeLibrary } from "./library";
import { ResumeDetailPreview } from "./detail";
import { UploadPreview } from "./upload";
import type { GalleryFamily } from "./types";

const picksKey = "jobops-resume-gallery-picks";
type Picks = Partial<Record<"library" | "detail" | "upload", string>>;
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(picksKey, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(picksKey, callback);
  };
}
function readPicks() {
  try {
    return localStorage.getItem(picksKey) ?? "{}";
  } catch {
    return "{}";
  }
}
function parsePicks(value: string): Picks {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      ["library", "detail", "upload"]
        .filter((key) => ["A", "B", "C"].includes(parsed[key]))
        .map((key) => [key, parsed[key]]),
    );
  } catch {
    return {};
  }
}

export function ResumeGallery({ families }: { families: GalleryFamily[] }) {
  const stored = parsePicks(useSyncExternalStore(subscribe, readPicks, () => "{}"));
  const [sessionPicks, setSessionPicks] = useState<Picks>({});
  const [copyState, setCopyState] = useState("");
  const picks = { ...stored, ...sessionPicks };
  const files = families.flatMap((family) => family.files);
  function choose(section: keyof Picks, letter: string) {
    const next = { ...picks, [section]: letter };
    setSessionPicks(next);
    setCopyState("");
    try {
      localStorage.setItem(picksKey, JSON.stringify(next));
      window.dispatchEvent(new Event(picksKey));
    } catch {
      /* Session selection remains available. */
    }
  }
  const summary = `Resume gallery choices: list ${picks.library ?? "not chosen"}, file details ${picks.detail ?? "not chosen"}, upload ${picks.upload ?? "not chosen"}.`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyState("Copied");
    } catch {
      setCopyState("Select the choices above and reply with their letters.");
    }
  }
  function option(
    section: keyof Picks,
    letter: string,
    name: string,
    note: string,
    child: ReactNode,
    recommended = false,
  ) {
    const chosen = picks[section] === letter;
    return (
      <section
        key={letter}
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
            onClick={() => choose(section, letter)}
            aria-pressed={chosen}
            aria-label={`Choose ${section} ${letter}`}
            className="!h-9 px-4"
          >
            {chosen && <Check size={14} aria-hidden />}
            {chosen ? "Selected" : `Choose ${letter}`}
          </Button>
        </header>
        {child}
      </section>
    );
  }
  return (
    <div className="space-y-6 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            Resume page options
          </h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
            Compare layouts using your real files and Oracle application. Choose one per section.
          </p>
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            Read-only gallery. Your files and application records stay as saved.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/resumes">Current resume page</Link>
        </Button>
      </header>
      <nav
        aria-label="Resume gallery sections"
        className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-2 bg-background/95 px-1 py-2 backdrop-blur-sm"
      >
        {[
          ["library", "Resume list"],
          ["detail", "File details"],
          ["upload", "Upload"],
        ].map(([id, title]) => (
          <a
            key={id}
            href={`#${id}`}
            className="morph flex min-h-10 items-center gap-2 border border-border px-4 text-sm text-foreground hover:bg-muted hover:no-underline"
          >
            {title}
            {picks[id as keyof Picks] && (
              <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {picks[id as keyof Picks]}
              </span>
            )}
          </a>
        ))}
      </nav>
      <section id="library" className="scroll-mt-20 space-y-5">
        <div className="max-w-2xl">
          <h2 className="m-0 text-2xl font-semibold tracking-tight">Resume list</h2>
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            The submitted PDF and the company that received it appear together. Search “Oracle” or
            filter to used files.
          </p>
        </div>
        {option(
          "library",
          "A",
          "File rows",
          "One line of sight from a PDF version to its applications.",
          <ResumeLibrary families={families} layout="rows" />,
          true,
        )}
        {option(
          "library",
          "B",
          "Version cards",
          "Each PDF gets a card with its own usage visible beneath it.",
          <ResumeLibrary families={families} layout="cards" />,
        )}
        {option(
          "library",
          "C",
          "Grouped versions",
          "Keep related files together; expand any version to see its history.",
          <ResumeLibrary families={families} layout="grouped" />,
        )}
      </section>
      <section id="detail" className="scroll-mt-20 space-y-5">
        <div className="max-w-2xl">
          <h2 className="m-0 text-2xl font-semibold tracking-tight">File details</h2>
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            Switch between the Original and the Oracle revision. Each has its own PDF, changes and
            usage.
          </p>
        </div>
        {option(
          "detail",
          "A",
          "PDF and applications together",
          "Read the PDF and see who received it, side by side.",
          <ResumeDetailPreview files={files} layout="split" />,
          true,
        )}
        {option(
          "detail",
          "B",
          "Application history first",
          "A version rail with applications upfront; the PDF opens on demand.",
          <ResumeDetailPreview files={files} layout="history" />,
        )}
      </section>
      <section id="upload" className="scroll-mt-20 space-y-5">
        <div className="max-w-2xl">
          <h2 className="m-0 text-2xl font-semibold tracking-tight">Upload a PDF</h2>
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            A new file becomes a distinct version. Changes and the default setting are available
            when needed.
          </p>
        </div>
        {option(
          "upload",
          "A",
          "Focused drawer",
          "Open the form when needed, keeping the library uncluttered.",
          <UploadPreview families={families} layout="drawer" />,
          true,
        )}
        {option(
          "upload",
          "B",
          "Inline upload",
          "Keep the upload form on the page alongside your existing resume.",
          <UploadPreview families={families} layout="inline" />,
        )}
      </section>
      <aside
        aria-label="Your design choices"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 py-3 shadow-surface"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="m-0 text-xs text-muted-foreground">
            List <strong className="ml-1 mr-4 text-foreground">{picks.library ?? "—"}</strong>File
            details <strong className="ml-1 mr-4 text-foreground">{picks.detail ?? "—"}</strong>
            Upload <strong className="ml-1 text-foreground">{picks.upload ?? "—"}</strong>
          </p>
          <Button size="sm" onClick={copy} disabled={!Object.values(picks).some(Boolean)}>
            <Copy size={14} aria-hidden />
            {copyState === "Copied" ? "Copied" : "Copy choices"}
          </Button>
          {copyState && (
            <span role="status" className="w-full text-xs text-muted-foreground">
              {copyState === "Copied" ? "Paste your choices into this chat when ready." : copyState}
            </span>
          )}
        </div>
      </aside>
    </div>
  );
}
