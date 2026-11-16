"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { StageView } from "./stage";
import { CompanyMark, MiddleTruncate, ResumeChip, currentStep, day, howItWent } from "./shared";
import type { GalleryApplication, Variant } from "./types";

function siblingsOf(app: GalleryApplication, apps: GalleryApplication[]) {
  return apps.filter((a) => a.company === app.company);
}

function Pill({ children, href }: { children: ReactNode; href?: string }) {
  const cls =
    "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium whitespace-nowrap";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cn(cls, "pressable text-foreground hover:no-underline")}>
      {children}
    </a>
  ) : (
    <span className={cls}>{children}</span>
  );
}

/* A. Identity strip: who, which opening, which résumé, in one wrap-friendly row. */
function Strip({ app }: { app: GalleryApplication }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <CompanyMark name={app.company} size="lg" />
        <div className="min-w-0">
          <h3 className="m-0 truncate text-xl font-semibold tracking-tight">{app.company}</h3>
          <p className="m-0 truncate text-sm text-muted-foreground">
            {app.role} · {app.location}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Pill href={app.postingUrl}>
          Req {app.req}
          <ExternalLink aria-hidden size={12} className="shrink-0 text-muted-foreground" />
        </Pill>
        <Pill>Applied {day(app.appliedOn)}</Pill>
        <ResumeChip app={app} className="h-8 text-xs" />
      </div>
    </div>
  );
}

/* B. Dossier: switch between same-company applications, then four facts side by side. */
function Dossier({
  app,
  apps,
  onSelect,
}: {
  app: GalleryApplication;
  apps: GalleryApplication[];
  onSelect: (id: string) => void;
}) {
  const siblings = siblingsOf(app, apps);
  const { current } = currentStep(app);
  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyMark name={app.company} size="lg" />
          <div className="min-w-0">
            <h3 className="m-0 truncate text-xl font-semibold tracking-tight">{app.company}</h3>
            <p className="m-0 truncate text-sm text-muted-foreground">{app.role}</p>
          </div>
        </div>
        {siblings.length > 1 && (
          <div
            role="radiogroup"
            aria-label={`${siblings.length} ${app.company} applications`}
            className="flex max-w-full min-w-0 gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]"
          >
            {siblings.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === app.id}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
                  s.id === app.id ? "bg-card text-foreground shadow-surface" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.req.length > 10 ? `…${s.req.slice(-6)}` : s.req} · {s.phase}
              </button>
            ))}
          </div>
        )}
      </div>
      <dl className="m-0 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-border @md:grid-cols-2 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,1.7fr)_minmax(0,1fr)]">
        <Fact label="Opening">
          <a href={app.postingUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1">
            <span className="truncate">Req {app.req}</span>
            <ExternalLink aria-hidden size={12} className="shrink-0" />
          </a>
          <span className="truncate text-xs text-muted-foreground">{app.location}</span>
        </Fact>
        <Fact label="Applied">
          <span>{day(app.appliedOn)}</span>
          <span className="text-xs text-muted-foreground">Direct application</span>
        </Fact>
        <Fact label="Résumé sent">
          <span className="flex min-w-0 items-start gap-1.5">
            <FileText aria-hidden size={14} className="mt-[3px] shrink-0 text-link" />
            <span className="line-clamp-2" title={app.resume.label}>
              {app.resume.label}
            </span>
          </span>
          <MiddleTruncate text={app.resume.filename} tail={24} className="text-xs font-normal text-muted-foreground" />
        </Fact>
        <Fact label="Where it stands">
          <span className="truncate">{current.label}</span>
          <span className={cn("truncate text-xs text-muted-foreground", current.due && "text-warning")}>
            {current.detail}
          </span>
        </Fact>
      </dl>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 flex min-w-0 flex-col gap-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

/* C. Compacting: the full header shrinks into a one-line bar once you scroll past it. */
function Compacting({ app, stage }: { app: GalleryApplication; stage: Variant }) {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const root = scroller.current;
    const target = sentinel.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), {
      root,
      threshold: 0,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const { current } = currentStep(app);
  const questions = app.rounds.flatMap((r) => r.questions);
  return (
    <div ref={scroller} className="@container relative h-[420px] overflow-y-auto rounded-2xl border border-border bg-background">
      <div
        className={cn(
          "sticky top-0 z-20 -mb-14 flex h-14 min-w-0 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur transition-[opacity,transform] duration-200 motion-reduce:transition-none",
          compact ? "translate-y-0 border-border opacity-100" : "pointer-events-none -translate-y-2 border-transparent opacity-0",
        )}
        inert={!compact}
      >
        <CompanyMark name={app.company} size="sm" />
        <p className="m-0 min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{app.company}</span>
          <span className="text-muted-foreground"> · Req {app.req}</span>
        </p>
        <span className={cn("hidden shrink-0 text-xs font-medium @sm:inline", current.due ? "text-warning" : "text-muted-foreground")}>
          {current.label}
        </span>
        <ResumeChip app={app} className="hidden h-8 max-w-[220px] text-xs @2xl:inline-flex" />
      </div>
      <div className="p-5">
        <Strip app={app} />
        <div ref={sentinel} aria-hidden className="h-px" />
        <div className="mt-5">
          <StageView v={stage} app={app} compact={false} />
        </div>
        <p className="m-0 mt-6 mb-2 text-sm font-semibold">Questions asked</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {[...questions, ...questions].map((q, i) => (
            <li key={`${q.id}-${i}`} className="flex min-w-0 items-center gap-3 rounded-2xl bg-card px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm">{q.title}</span>
              <span className={cn("size-2 shrink-0 rounded-full", howItWent[q.howItWent].dot)} aria-hidden />
            </li>
          ))}
          {questions.length === 0 && (
            <li className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No rounds yet. Questions appear here after your first interview.
            </li>
          )}
        </ul>
        <p className="m-0 mt-3 text-xs text-muted-foreground">Scroll this box to see the header compact.</p>
      </div>
    </div>
  );
}

export function HeaderView({
  v,
  app,
  apps,
  onSelect,
  stage,
}: {
  v: Variant;
  app: GalleryApplication;
  apps: GalleryApplication[];
  onSelect: (id: string) => void;
  stage: Variant;
}) {
  if (v === "A") return <Strip app={app} />;
  if (v === "B") return <Dossier app={app} apps={apps} onSelect={onSelect} />;
  return <Compacting app={app} stage={stage} />;
}

export function HeaderDemo(props: {
  v: Variant;
  app: GalleryApplication;
  apps: GalleryApplication[];
  onSelect: (id: string) => void;
  stage: Variant;
}) {
  return <HeaderView {...props} />;
}
