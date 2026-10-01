"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ButtonDemo, type Feedback } from "./buttons";
import { profileLinks, type Identity, type ResumeRef } from "./data";
import { previewTargets } from "./embeds";
import { HeroIdentity, HeroSearch, HeroTarget } from "./hero";
import { JobSiteCards, JobSiteRows } from "./job-sites";
import { LoaderDialog, LoaderEdge, LoaderWavy, loaderDemos, useSimulatedLoad } from "./loader";
import { PreviewMosaic, PreviewPane, PreviewPeek } from "./previews";

const styles = `
@keyframes hg-enter { from { opacity: 0; transform: translateY(10px); } }
@keyframes hg-fade { from { opacity: 0; } }
@keyframes hg-fade-out { to { opacity: 0; } }
@keyframes hg-pop { from { opacity: 0; transform: scale(0.94); } }
@keyframes hg-rise { from { opacity: 0; transform: translate(-50%, 12px); } }
@keyframes hg-sheet { from { transform: translateX(48px); opacity: 0; } }
@keyframes hg-wave { to { transform: translateX(20px); } }
@keyframes hg-ripple { from { transform: scale(0); opacity: 0.18; } to { transform: scale(1); opacity: 0; } }
.hg-enter { animation: hg-enter 560ms cubic-bezier(0.05, 0.7, 0.1, 1) both; animation-delay: calc(var(--i, 0) * 70ms); }
.hg-fade { animation: hg-fade 200ms ease-out both; }
.hg-fade-out { animation: hg-fade-out 260ms ease-in both; }
.hg-pop { animation: hg-pop 320ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
.hg-rise { animation: hg-rise 320ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
dialog.hg-sheet[open] { animation: hg-sheet 360ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
.hg-wave { animation: hg-wave 900ms linear infinite; }
.hg-ripple { position: absolute; border-radius: 9999px; background: currentColor; pointer-events: none; animation: hg-ripple 600ms cubic-bezier(0.2, 0, 0, 1) forwards; }
.hg-morph { transition: border-radius 260ms cubic-bezier(0.42, 1.67, 0.21, 0.9); }
.hg-morph:active:not(:disabled) { border-radius: 12px; }
`;

const sections = [
  { id: "hero", title: "Profile header", letters: ["A", "B", "C"] },
  { id: "previews", title: "Profile previews", letters: ["A", "B", "C"] },
  { id: "sites", title: "Job sites", letters: ["A", "B"] },
  { id: "loader", title: "Loading popup", letters: ["A", "B", "C"] },
  { id: "buttons", title: "Button feedback", letters: ["A", "B", "C"] },
] as const;
type SectionId = (typeof sections)[number]["id"];
type Picks = Partial<Record<SectionId, string>>;

const PICKS_KEY = "jobops-home-gallery-picks";
function subscribePicks(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PICKS_KEY, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PICKS_KEY, callback);
  };
}
function readPicks() {
  try {
    return localStorage.getItem(PICKS_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
function usePicks() {
  const raw = useSyncExternalStore(subscribePicks, readPicks, () => "{}");
  const picks = JSON.parse(raw) as Picks;
  function choose(section: SectionId, letter: string) {
    const next = { ...picks, [section]: picks[section] === letter ? undefined : letter };
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(next));
    } catch {
      /* Picks stay visible until the next render only. */
    }
    window.dispatchEvent(new Event(PICKS_KEY));
  }
  return { picks, choose };
}

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: SectionId;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="m-0 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="m-0 mt-2 text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Option({
  section,
  letter,
  name,
  note,
  picks,
  choose,
  children,
}: {
  section: SectionId;
  letter: string;
  name: string;
  note: string;
  picks: Picks;
  choose: (section: SectionId, letter: string) => void;
  children: ReactNode;
}) {
  const chosen = picks[section] === letter;
  return (
    <div
      className={cn(
        "rounded-[2rem] border-2 p-3 transition-[border-color] sm:p-5",
        chosen ? "border-primary" : "border-dashed border-border",
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 px-1">
        <span className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-semibold">
          {letter}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 font-semibold">{name}</p>
          <p className="m-0 text-sm text-muted-foreground">{note}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={chosen ? "default" : "outline"}
          aria-pressed={chosen}
          onClick={() => choose(section, letter)}
          className="h-9 px-4"
        >
          {chosen && <Check size={15} aria-hidden />}
          {chosen ? "Chosen" : "Choose this"}
        </Button>
      </div>
      {children}
    </div>
  );
}

function LoaderOption({ variant }: { variant: "dialog" | "wavy" | "edge" }) {
  const { load, start } = useSimulatedLoad();
  const Overlay =
    variant === "dialog" ? LoaderDialog : variant === "wavy" ? LoaderWavy : LoaderEdge;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-panel border border-border bg-card p-6">
      {loaderDemos.map((demo) => (
        <Button
          key={demo.button}
          type="button"
          variant={demo.duration < 200 ? "outline" : "secondary"}
          onClick={() => start(demo.label, demo.duration)}
        >
          {demo.button}
        </Button>
      ))}
      <Overlay load={load} />
    </div>
  );
}

export function HomeGallery({
  identity,
  sites,
  resume,
}: {
  identity: Identity;
  sites: { name: string; url: string | null }[];
  resume: ResumeRef | null;
}) {
  const links = profileLinks(sites);
  const targets = previewTargets(links, resume);
  const { picks, choose } = usePicks();
  const [replay, setReplay] = useState(0);
  const [copied, setCopied] = useState(false);
  const optionProps = { picks, choose };
  const hero = { identity, links, resume };
  const summary = sections
    .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
    .join(", ");
  async function copy() {
    await navigator.clipboard.writeText(`Home gallery picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-16 pb-32">
      <style>{styles}</style>
      <header className="space-y-5">
        <div className="max-w-2xl">
          <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
            Home page options
          </h1>
          <p className="m-0 mt-3 text-muted-foreground">
            Every option below is live and uses your saved profile, resume and public links. Choose
            one per section, then copy your picks.
          </p>
        </div>
        <nav aria-label="Gallery sections" className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="pressable inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted hover:no-underline"
            >
              {section.title}
              {picks[section.id] && (
                <span className="grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {picks[section.id]}
                </span>
              )}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="hero"
        title="Profile header"
        description="The first thing you see: who you are, and what Find openings will search for."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-4"
            onClick={() => setReplay((n) => n + 1)}
          >
            <RotateCcw size={14} aria-hidden />
            Replay entrance
          </Button>
        }
      >
        <Option
          section="hero"
          letter="A"
          name="Identity card"
          note="Photo, role, facts and every profile link in one card."
          {...optionProps}
        >
          <div key={replay}>
            <HeroIdentity {...hero} />
          </div>
        </Option>
        <Option
          section="hero"
          letter="B"
          name="Search target"
          note="Leads with the roles you want; your profile card sits beside it."
          {...optionProps}
        >
          <div key={replay}>
            <HeroTarget {...hero} />
          </div>
        </Option>
        <Option
          section="hero"
          letter="C"
          name="Search bar"
          note="A Google-style search bar is the main action, with next steps below it."
          {...optionProps}
        >
          <div key={replay}>
            <HeroSearch {...hero} />
          </div>
        </Option>
      </Section>

      <Section
        id="previews"
        title="Profile previews"
        description="Your portfolio and resume run live. GitHub shows your avatar and contribution graph. LinkedIn shows its official badge. Medium blocks embedding, so it opens in a new tab."
      >
        <Option
          section="previews"
          letter="A"
          name="Preview pane"
          note="Pick a source on the left; it opens full size in a browser frame."
          {...optionProps}
        >
          <PreviewPane targets={targets} />
        </Option>
        <Option
          section="previews"
          letter="B"
          name="Live mosaic"
          note="Everything visible at once as thumbnails; any tile expands."
          {...optionProps}
        >
          <PreviewMosaic targets={targets} />
        </Option>
        <Option
          section="previews"
          letter="C"
          name="Peek on demand"
          note="Light cards. Nothing loads until you choose Preview, which opens a side panel."
          {...optionProps}
        >
          <PreviewPeek targets={targets} />
        </Option>
      </Section>

      <Section
        id="sites"
        title="Job sites"
        description={`LinkedIn and Naukri open a search for “${identity.searchRole}” in ${identity.searchCity}. The others open their home page.`}
      >
        <Option
          section="sites"
          letter="A"
          name="Icon cards"
          note="Real site icons; the bottom line says what the click opens."
          {...optionProps}
        >
          <JobSiteCards identity={identity} />
        </Option>
        <Option
          section="sites"
          letter="B"
          name="Action rows"
          note="One panel, one labelled button per site."
          {...optionProps}
        >
          <JobSiteRows identity={identity} />
        </Option>
      </Section>

      <Section
        id="loader"
        title="Loading popup"
        description="Shown for page changes and saves that take longer than 200 ms, so fast clicks never flash it. Try each button."
      >
        <Option
          section="loader"
          letter="A"
          name="Linear bar"
          note="Centred dialog with a Material progress bar over a blurred page."
          {...optionProps}
        >
          <LoaderOption variant="dialog" />
        </Option>
        <Option
          section="loader"
          letter="B"
          name="Wavy bar"
          note="The same dialog with Material 3's expressive wavy progress indicator."
          {...optionProps}
        >
          <LoaderOption variant="wavy" />
        </Option>
        <Option
          section="loader"
          letter="C"
          name="Top edge"
          note="Lighter: a progress line across the top, slight blur and a status pill."
          {...optionProps}
        >
          <LoaderOption variant="edge" />
        </Option>
      </Section>

      <Section
        id="buttons"
        title="Button feedback"
        description="Hover and press every button. Save job description shows the working and done states."
      >
        {(
          [
            ["A", "scale", "Press shrink", "The current behaviour: a slight shrink on press."],
            ["B", "ripple", "Ripple", "A Material ripple spreads from where you pressed."],
            [
              "C",
              "morph",
              "Shape morph",
              "Material 3 Expressive: the pill squares off while pressed.",
            ],
          ] as [string, Feedback, string, string][]
        ).map(([letter, feedback, name, note]) => (
          <Option
            key={letter}
            section="buttons"
            letter={letter}
            name={name}
            note={note}
            {...optionProps}
          >
            <ButtonDemo feedback={feedback} />
          </Option>
        ))}
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
          <p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Your picks</span> {summary}
          </p>
          <Button type="button" size="sm" className="h-9 px-4" onClick={copy}>
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "Copied" : "Copy picks"}
          </Button>
        </div>
      </div>
    </div>
  );
}
