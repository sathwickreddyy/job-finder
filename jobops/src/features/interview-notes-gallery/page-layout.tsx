"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Mail, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeaderView } from "./header";
import { QuestionsView } from "./questions";
import { StageView } from "./stage";
import { CompanyMark, ResumeChip, currentStep, day, useEdgeFade } from "./shared";
import type { GalleryApplication, Variant } from "./types";

export type PagePicks = { stage: Variant; header: Variant; questions: Variant };

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-card border border-border bg-card p-4">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <h3 className="m-0 truncate text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ResumeCard({ app }: { app: GalleryApplication }) {
  return (
    <Card title="Résumé sent">
      <ResumeChip app={app} className="w-full" />
      <p className="m-0 mt-2 text-xs text-muted-foreground" title={app.resume.label}>
        {app.resume.label}
      </p>
    </Card>
  );
}

function MailCard({ app }: { app: GalleryApplication }) {
  return (
    <Card title="Mail">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {app.mail.map((m) => (
          <li key={m.subject + m.date} className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted">
            <Mail aria-hidden size={14} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm" title={m.subject}>
              {m.subject}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{day(m.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HistoryCard({ app }: { app: GalleryApplication }) {
  return (
    <Card title="History">
      <ol className="m-0 flex list-none flex-col p-0">
        {app.history.map((h, i) => (
          <li key={h.date + i} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1.5 text-sm">
            <span className="text-xs text-muted-foreground tabular-nums">{day(h.date)}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{h.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Interview({ app, picks }: { app: GalleryApplication; picks: PagePicks }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {app.rounds.map((round) => (
        <QuestionsView key={round.id} v={picks.questions} round={round} />
      ))}
      {app.rounds.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
          <p className="m-0 text-sm font-medium">No interview rounds yet</p>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            When a round is booked, its questions and your answers live here.
          </p>
        </div>
      )}
      <button
        type="button"
        className="pressable inline-flex items-center gap-1.5 self-start rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        <Plus aria-hidden size={15} /> Add a question
      </button>
    </div>
  );
}


/** Scroll frame shared by both layouts; the header pick decides how the top behaves. */
function Frame({ app, apps, picks, onSelect, width, children }: Props & { width: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const compacting = picks.header === "C";
  useEffect(() => {
    if (!compacting || !scroller.current || !sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), {
      root: scroller.current,
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [compacting]);
  const { current } = currentStep(app);
  return (
    <div
      ref={scroller}
      className="@container relative h-[760px] overflow-y-auto rounded-2xl border border-border bg-background"
    >
      {compacting && (
        <div
          inert={!compact}
          className={cn(
            "sticky top-0 z-40 -mb-14 flex h-14 min-w-0 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur transition-[opacity,transform] duration-200 motion-reduce:transition-none @lg:px-6",
            compact ? "border-border opacity-100" : "pointer-events-none -translate-y-2 border-transparent opacity-0",
          )}
        >
          <CompanyMark name={app.company} size="sm" />
          <p className="m-0 min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{app.company}</span>
            <span className="text-muted-foreground"> · Req {app.req}</span>
          </p>
          <span className={cn("hidden shrink-0 text-xs font-medium @md:inline", current.due ? "text-warning" : "text-muted-foreground")}>
            {current.label}
          </span>
          <ResumeChip app={app} className="hidden h-8 max-w-[240px] text-xs @3xl:inline-flex" />
        </div>
      )}
      <div className={cn("mx-auto flex min-w-0 flex-col gap-5 p-4 @lg:p-6", width)}>
        <HeaderView v={compacting ? "A" : picks.header} app={app} apps={apps} onSelect={onSelect} stage={picks.stage} />
        <div ref={sentinel} aria-hidden className="-mt-5 h-px" />
        {children}
      </div>
    </div>
  );
}

/* A. Two columns: the interview story on the left; résumé, mail and history pinned on the right. */
function Columns({ app, apps, picks, onSelect }: Props) {
  const { ref: railRef, style: railStyle } = useEdgeFade<HTMLElement>("y");
  return (
    <Frame app={app} apps={apps} picks={picks} onSelect={onSelect} width="max-w-[1180px]">
        <div className="grid min-w-0 grid-cols-1 gap-5 @[52rem]:grid-cols-[minmax(0,1fr)_300px] @[52rem]:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="rounded-card border border-border bg-card p-4">
              <StageView v={picks.stage} app={app} compact={false} />
            </div>
            <Interview app={app} picks={picks} />
          </div>
          <aside
            ref={railRef}
            style={railStyle}
            className={cn("flex min-w-0 flex-col gap-4 @[52rem]:sticky @[52rem]:max-h-[700px] @[52rem]:overflow-y-auto", picks.header === "C" ? "@[52rem]:top-[72px]" : "@[52rem]:top-4")}
          >
            <ResumeCard app={app} />
            <MailCard app={app} />
            <HistoryCard app={app} />
          </aside>
        </div>
    </Frame>
  );
}

/* B. Tabs: header and progress stay up top; interview notes, mail and history each get the full width. */
function Tabbed({ app, apps, picks, onSelect }: Props) {
  const [tab, setTab] = useState<"interview" | "mail" | "history">("interview");
  const base = useId();
  const questions = app.rounds.reduce((n, r) => n + r.questions.length, 0);
  const tabs = [
    ["interview", `Interview notes${questions ? ` (${questions})` : ""}`],
    ["mail", `Mail (${app.mail.length})`],
    ["history", "History"],
  ] as const;
  return (
    <Frame app={app} apps={apps} picks={picks} onSelect={onSelect} width="max-w-[980px]">
        <div className="rounded-card border border-border bg-card p-4">
          <StageView v={picks.stage} app={app} compact={false} />
        </div>
        <div className={cn("sticky z-30 -mx-1 bg-background/95 px-1 py-1 backdrop-blur", picks.header === "C" ? "top-14" : "top-0")}>
          <div role="tablist" aria-label="Application sections" className="flex min-w-0 gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`${base}-${key}`}
                aria-selected={tab === key}
                aria-controls={`${base}-${key}-panel`}
                onClick={() => setTab(key)}
                className={cn(
                  "relative shrink-0 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
                  tab === key ? "text-link" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {tab === key && <span aria-hidden className="absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-primary" />}
              </button>
            ))}
          </div>
        </div>
        <div role="tabpanel" id={`${base}-${tab}-panel`} aria-labelledby={`${base}-${tab}`} className="min-w-0">
          {tab === "interview" && <Interview app={app} picks={picks} />}
          {tab === "mail" && (
            <div className="grid min-w-0 gap-4 @3xl:grid-cols-2">
              <MailCard app={app} />
              <ResumeCard app={app} />
            </div>
          )}
          {tab === "history" && <HistoryCard app={app} />}
        </div>
    </Frame>
  );
}

type Props = {
  app: GalleryApplication;
  apps: GalleryApplication[];
  picks: PagePicks;
  onSelect: (id: string) => void;
};

export function PageDemo({ v, ...props }: Props & { v: Variant }) {
  return v === "A" ? <Columns {...props} /> : <Tabbed {...props} />;
}
