"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy, Moon, Smartphone, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AnalyticsDemo,
  ApplicationsDemo,
  BackToPreview,
  MailDemo,
  MobilePreview,
  type Picks,
  type Variant,
} from "./demos";

const key = "jobops-mobile-gallery-picks-v2";
const defaults: Picks = { navigation: "A", analytics: "A", mail: "A", applications: "B" };
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(key, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(key, callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(key) ?? "{}";
  } catch {
    return "{}";
  }
}
function subscribeTheme(callback: () => void) {
  window.addEventListener("jobops-theme", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("jobops-theme", callback);
    window.removeEventListener("storage", callback);
  };
}
function lightTheme() {
  return document.documentElement.dataset.theme === "light";
}
function parsePicks(value: string): Partial<Picks> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([name, variant]) => Object.hasOwn(defaults, name) && (variant === "A" || variant === "B"),
      ),
    );
  } catch {
    return {};
  }
}

const sections = [
  {
    id: "navigation",
    title: "Getting around",
    note: "Three destinations. The overview opens first.",
    options: [
      {
        letter: "A",
        name: "Within thumb’s reach",
        detail: "Bottom navigation stays put as you scroll.",
      },
      { letter: "B", name: "A quiet top bar", detail: "Three compact tabs above the content." },
    ],
  },
  {
    id: "analytics",
    title: "Analytics at a glance",
    note: "A small picture of your recorded activity. Tap the chart bars and switch the period.",
    options: [
      {
        letter: "A",
        name: "Four clear numbers",
        detail: "Sent, interviewing, offers and closed, then your sending activity.",
      },
      {
        letter: "B",
        name: "Where applications stand",
        detail: "One status breakdown, then your sending activity.",
      },
    ],
  },
  {
    id: "mail",
    title: "Mail that needs you",
    note: "Open an email, mark it handled, and try Undo. The sample changes only in this gallery.",
    options: [
      {
        letter: "A",
        name: "A compact inbox",
        detail: "Scan rows, then tap for the message and handling action.",
      },
      {
        letter: "B",
        name: "The next action up front",
        detail: "Each email shows what needs doing and a handling button.",
      },
    ],
  },
  {
    id: "applications",
    title: "Applications on your phone",
    note: "One list, with the next actions first. Tap a company to see its story. No category tabs.",
    options: [
      {
        letter: "A",
        name: "Compact status rows",
        detail: "Company, current status and next step. The journey opens on tap.",
      },
      {
        letter: "B",
        name: "The journey in view",
        detail:
          "Connected circles, dates and the current step stay in view. A rejection shows exactly where it stopped.",
      },
    ],
  },
] as const;

function Example({
  section,
  variant,
  picks,
}: {
  section: keyof Picks;
  variant: Variant;
  picks: Picks;
}) {
  let demo: ReactNode;
  if (section === "navigation")
    return <MobilePreview picks={{ ...picks, navigation: variant }} small />;
  if (section === "analytics") demo = <AnalyticsDemo variant={variant} />;
  else if (section === "mail") demo = <MailDemo variant={variant} />;
  else demo = <ApplicationsDemo variant={variant} />;
  return <div className="mx-auto w-full max-w-[390px] px-1 py-3 sm:px-3">{demo}</div>;
}

export function MobileGallery({
  initialScreen = "overview",
}: {
  initialScreen?: "overview" | "mail" | "applications";
}) {
  const saved = parsePicks(useSyncExternalStore(subscribe, snapshot, () => "{}"));
  const [sessionPicks, setSessionPicks] = useState<Partial<Picks>>({});
  const chosen = { ...defaults, ...saved, ...sessionPicks };
  const picks = { ...defaults, ...chosen };
  const light = useSyncExternalStore(subscribeTheme, lightTheme, () => false);
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const summary = `Mobile picks: ${sections.map((section) => `${section.id} ${chosen[section.id]}`).join(", ")}. Start on Overview with analytics and attention items. Applications use connected circles in one list, without category tabs.`;
  function choose(section: keyof Picks, variant: Variant) {
    const next = { ...chosen, [section]: variant };
    setSessionPicks(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Session choices still work. */
    }
    window.dispatchEvent(new Event(key));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setManualCopy(true);
    }
  }
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <style>{`
      .mobile-gallery-phone { box-shadow: 0 16px 64px -36px var(--scrim); }
    `}</style>
      <div className="mobile-gallery-surface mx-auto max-w-6xl px-4 pb-12 sm:px-8">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-border/60">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground hover:no-underline"
          >
            <Smartphone size={19} aria-hidden />
            JobOps <span className="font-normal text-muted-foreground">/ iPhone</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              const theme = light ? "dark" : "light";
              document.documentElement.dataset.theme = theme;
              try {
                localStorage.setItem("jobops-theme", theme);
              } catch {
                /* Session-only theme. */
              }
              window.dispatchEvent(new Event("jobops-theme"));
            }}
            aria-label={light ? "Preview dark theme" : "Preview light theme"}
            className="grid size-11 place-items-center rounded-full bg-secondary text-secondary-foreground hover:bg-muted"
          >
            {light ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
          </button>
        </header>
        <section
          id="preview"
          className="grid scroll-mt-5 items-center gap-8 py-10 lg:grid-cols-[1fr_430px] lg:gap-20 lg:py-16"
        >
          <div className="max-w-lg space-y-5">
            <p className="m-0 flex items-center gap-2 text-sm font-medium text-link">
              <span className="size-2 rounded-full bg-primary" />
              Mobile view · live gallery
            </p>
            <h1 className="m-0 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Your search.
              <br />
              Just the essentials.
            </h1>
            <p className="m-0 max-w-sm text-base leading-relaxed text-muted-foreground">
              Open on analytics and attention items. Keep mail and applications one tap away.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="#navigation"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover hover:no-underline"
              >
                Choose your components
              </a>
              <span className="inline-flex min-h-11 items-center gap-2 px-2 text-xs text-muted-foreground">
                2 options for each part
              </span>
            </div>
            <p className="m-0 max-w-sm border-l-2 border-border pl-4 text-xs leading-relaxed text-muted-foreground">
              Interactive sample with fictional companies and activity. No real mail or application
              records change here.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Current preview choices">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-xs text-muted-foreground hover:bg-muted hover:no-underline"
                >
                  {section.id === "navigation"
                    ? "Navigation"
                    : section.id === "analytics"
                      ? "Analytics"
                      : section.id === "mail"
                        ? "Mail"
                        : "Applications"}
                  <span className="font-semibold text-foreground">{picks[section.id]}</span>
                  {chosen[section.id] && <Check size={12} aria-hidden />}
                </a>
              ))}
            </div>
          </div>
          <MobilePreview picks={picks} initialScreen={initialScreen} />
        </section>
        <div className="space-y-14 border-t border-border/60 pt-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6 space-y-5">
              <div className="max-w-xl">
                <h2 className="m-0 text-2xl font-semibold tracking-tight">{section.title}</h2>
                <p className="m-0 mt-2 text-sm text-muted-foreground">{section.note}</p>
              </div>
              <div className="grid items-start gap-4 md:grid-cols-2 sm:gap-6">
                {section.options.map((option) => (
                  <div
                    key={option.letter}
                    className={cn(
                      "min-w-0 overflow-hidden rounded-[1.75rem] border-2 p-3 sm:p-5",
                      chosen[section.id] === option.letter ? "border-primary" : "border-border/70",
                    )}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold">
                        {option.letter}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="m-0 text-base font-semibold">{option.name}</h3>
                        <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
                          {option.detail}
                        </p>
                      </div>
                    </div>
                    <Example section={section.id} variant={option.letter} picks={picks} />
                    <button
                      type="button"
                      onClick={() => {
                        choose(section.id, option.letter);
                        setCopied(false);
                      }}
                      aria-pressed={chosen[section.id] === option.letter}
                      className={cn(
                        "mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-medium",
                        chosen[section.id] === option.letter
                          ? "bg-selected text-selected-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-muted",
                      )}
                    >
                      {chosen[section.id] === option.letter && <Check size={16} aria-hidden />}
                      {chosen[section.id] === option.letter ? "Chosen" : `Choose ${option.letter}`}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="mt-12 space-y-4 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="m-0 text-base font-semibold">Your iPhone view</p>
              <p className="m-0 mt-1 text-sm text-muted-foreground">
                {Object.keys(chosen).length} of 4 parts chosen. Choices update the preview above.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BackToPreview />
              <button
                type="button"
                disabled={Object.keys(chosen).length < 4}
                onClick={copy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                {copied ? "Copied" : "Copy choices"}
              </button>
            </div>
          </div>
          {manualCopy && (
            <label className="block text-sm">
              Copy these choices into the chat
              <textarea
                readOnly
                value={summary}
                onFocus={(event) => event.target.select()}
                className="mt-2 !text-base"
              />
            </label>
          )}
          <p role="status" className="m-0 text-xs text-muted-foreground">
            {copied
              ? "Choices copied. Paste them into the chat to continue."
              : "Choose here, then share your choices in the chat before the main mobile view is built."}
          </p>
        </footer>
      </div>
    </div>
  );
}
