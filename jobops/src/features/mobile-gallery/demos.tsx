"use client";

import { useId, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  Mail,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Variant = "A" | "B";
export type Screen = "overview" | "mail" | "applications";
export type Picks = Record<"navigation" | "analytics" | "mail" | "applications", Variant>;

const touch =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors hover:no-underline";
const primary = `${touch} bg-primary text-primary-foreground hover:bg-primary-hover`;
const secondary = `${touch} bg-secondary text-secondary-foreground hover:bg-muted`;

const messages = [
  {
    id: "cedar",
    company: "Cedar Engineering",
    tag: "Interview call",
    subject: "Your technical interview",
    preview: "Choose a time for your technical interview this week.",
    body: "We’d like to invite you to a technical interview for Software Engineer II. Please reply with a suitable time this week. The conversation will cover coding and your recent projects.",
    time: "10:42 am",
    inbox: "gmail.com",
    action: "Reply with your availability",
  },
  {
    id: "atlas",
    company: "Atlas Health",
    tag: "Interview process",
    subject: "Your coding assessment is ready",
    preview: "Complete the assessment by 4 Nov, 6:00 pm IST.",
    body: "The next step for your Backend Engineer application is a coding assessment. Please complete it by 4 Nov, 6:00 pm IST. You can choose when to start before the deadline.",
    time: "9:15 am",
    inbox: "outlook.com",
    action: "Complete the assessment",
  },
  {
    id: "orbit",
    company: "Orbit Labs",
    tag: "Other",
    subject: "Re: Software Engineer II",
    preview: "Could you share your notice period and preferred location?",
    body: "Thanks for your interest in Software Engineer II. Could you reply with your notice period and preferred location? We’ll share the next steps after reviewing your details.",
    time: "Yesterday",
    inbox: "gmail.com",
    action: "Reply with your details",
  },
];

function Tag({ children }: { children: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium leading-tight",
        children === "Other"
          ? "bg-secondary text-secondary-foreground"
          : "bg-warning-soft text-warning",
      )}
    >
      {children}
    </span>
  );
}

export function AnalyticsDemo({ variant }: { variant: Variant }) {
  const [days, setDays] = useState<7 | 28>(28);
  const [selected, setSelected] = useState<number | null>(null);
  const values = days === 28 ? [4, 7, 5, 8] : [1, 0, 2, 1, 0, 1, 2];
  const labels =
    days === 28
      ? ["6 Oct", "13 Oct", "20 Oct", "27 Oct"]
      : ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"];
  const chartValue =
    selected === null ? values.reduce((sum, value) => sum + value, 0) : values[selected];
  return (
    <div className="space-y-5" data-demo={`analytics-${variant}`}>
      {variant === "A" ? (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border">
          {[
            ["24", "Applications sent"],
            ["3", "Interviewing"],
            ["1", "Offer"],
            ["6", "Closed"],
          ].map(([value, label]) => (
            <div key={label} className="bg-card px-4 py-4">
              <p className="m-0 text-[30px] font-semibold leading-tight tracking-tight tabular-nums">
                {value}
              </p>
              <p className="m-0 mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight">24</span>
            <span className="text-sm text-muted-foreground">applications sent</span>
          </div>
          <div className="mt-4 flex h-2.5 gap-1 overflow-hidden rounded-full" aria-hidden>
            {[
              { count: 14, tone: "bg-primary" },
              { count: 3, tone: "bg-warning" },
              { count: 1, tone: "bg-foreground" },
              { count: 6, tone: "bg-muted" },
            ].map(({ count, tone }, i) => (
              <span key={i} className={cn("rounded-full", tone)} style={{ flex: count }} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
            {[
              ["14", "Waiting"],
              ["3", "Interviewing"],
              ["1", "Offer"],
              ["6", "Closed"],
            ].map(([value, label]) => (
              <p key={label} className="m-0 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">{value}</span>
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-3xl bg-card p-5 ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-semibold">Sending activity</h3>
          <div
            className="flex rounded-full bg-secondary p-1"
            role="group"
            aria-label="Activity period"
          >
            {([7, 28] as const).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={days === period}
                onClick={() => {
                  setDays(period);
                  setSelected(null);
                }}
                className={cn(
                  "min-h-11 rounded-full px-3 text-xs font-medium",
                  days === period
                    ? "bg-selected text-selected-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {period} days
              </button>
            ))}
          </div>
        </div>
        <p className="m-0 mt-3 text-sm" aria-live="polite">
          <strong className="text-2xl font-semibold tabular-nums">{chartValue}</strong>
          <span className="ml-2 text-xs text-muted-foreground">
            {selected === null
              ? `sent in ${days} days`
              : `sent ${days === 28 ? "week of " : "on "}${labels[selected]}`}
          </span>
        </p>
        <div
          className="mt-4 grid h-28 items-end gap-2 border-b border-border"
          style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
        >
          {values.map((value, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${labels[i]}: ${value} applications sent`}
              aria-pressed={selected === i}
              onClick={() => setSelected(selected === i ? null : i)}
              className="group flex h-full min-w-0 flex-col justify-end px-1 pt-3"
            >
              <span
                className={cn(
                  "mx-auto block w-full max-w-10 rounded-t-lg transition-colors",
                  selected === i ? "bg-primary" : "bg-primary/65 group-hover:bg-primary",
                )}
                style={{ height: `${Math.max(3, (value / Math.max(...values)) * 88)}%` }}
              />
            </button>
          ))}
        </div>
        <div
          className="mt-2 grid gap-2 text-center text-[10px] text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
        >
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

type MailState = { open: string | null; handled: string[]; last: string | null };
type MailController = { value: MailState; change: Dispatch<SetStateAction<MailState>> };
const emptyMail: MailState = { open: null, handled: [], last: null };

export function MailDemo({
  variant,
  compact = false,
  controller,
}: {
  variant: Variant;
  compact?: boolean;
  controller?: MailController;
}) {
  const baseId = useId();
  const [local, setLocal] = useState<MailState>(emptyMail);
  const { open, handled, last } = controller?.value ?? local;
  const change = controller?.change ?? setLocal;
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const visible = messages.filter((message) => !handled.includes(message.id));
  const shown = compact ? visible.slice(0, 2) : visible;
  function handle(id: string) {
    change((state) => ({ open: null, handled: [...state.handled, id], last: id }));
  }
  return (
    <div className="space-y-4" data-demo={`mail-${variant}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-base font-semibold">
            Needs your attention{" "}
            <span className="ml-1 text-muted-foreground tabular-nums">{visible.length}</span>
          </h3>
          {!compact && (
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              Only mail that still needs you.
            </p>
          )}
        </div>
        {!compact && (
          <button
            type="button"
            aria-label="Check sample inbox"
            disabled={checking}
            onClick={() => {
              setChecking(true);
              window.setTimeout(() => {
                setChecking(false);
                setChecked(true);
              }, 650);
            }}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full bg-selected text-selected-foreground hover:bg-muted",
              checking && "opacity-60",
            )}
          >
            <RefreshCw
              size={18}
              aria-hidden
              className={checking ? "motion-safe:animate-spin" : ""}
            />
          </button>
        )}
      </div>
      {checked && (
        <p role="status" className="m-0 text-xs text-muted-foreground">
          Sample inbox is up to date.
        </p>
      )}
      {last && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-2xl bg-selected px-4 py-2 text-sm text-selected-foreground"
        >
          <span>Marked as handled</span>
          <button
            type="button"
            onClick={() => {
              change((state) => ({
                ...state,
                handled: state.handled.filter((id) => id !== state.last),
                last: null,
              }));
            }}
            className="min-h-11 px-2 font-semibold"
          >
            Undo
          </button>
        </div>
      )}
      {!shown.length && (
        <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-border">
          <Check size={24} aria-hidden className="mx-auto mb-3 text-link" />
          <p className="m-0 font-semibold">You’re all caught up</p>
          <p className="m-0 mt-1 text-sm text-muted-foreground">No mail needs your attention.</p>
        </div>
      )}
      <div
        className={cn(
          variant === "A"
            ? "divide-y divide-border overflow-hidden rounded-3xl bg-card ring-1 ring-border"
            : "space-y-3",
        )}
      >
        {shown.map((message) => {
          const expanded = open === message.id;
          return (
            <article
              key={message.id}
              className={cn(
                variant === "B" && "overflow-hidden rounded-3xl bg-card ring-1 ring-border",
              )}
            >
              <button
                type="button"
                className="block w-full min-w-0 space-y-2 px-4 py-4 text-left hover:bg-muted/35"
                onClick={() =>
                  change((state) => ({ ...state, open: expanded ? null : message.id }))
                }
                aria-expanded={expanded}
                aria-controls={`${baseId}-${message.id}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{message.company}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{message.time}</span>
                </span>
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{message.subject}</span>
                    <span
                      className={cn(
                        "mt-1 block text-xs leading-relaxed text-muted-foreground",
                        variant === "A" && "line-clamp-1",
                      )}
                    >
                      {message.preview}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    aria-hidden
                    className={cn("mt-1 shrink-0 text-muted-foreground", expanded && "rotate-90")}
                  />
                </span>
                <span className="flex items-center justify-between gap-2">
                  <Tag>{message.tag}</Tag>
                  <span className="text-[10px] text-muted-foreground">{message.inbox}</span>
                </span>
              </button>
              <div
                hidden={!expanded && variant !== "B"}
                className="border-t border-border/60 px-4 py-3"
                id={`${baseId}-${message.id}`}
              >
                {expanded && <p className="m-0 mb-4 text-sm leading-relaxed">{message.body}</p>}
                {variant === "B" && (
                  <p className="m-0 mb-3 text-sm font-medium">{message.action}</p>
                )}
                <button
                  type="button"
                  onClick={() => handle(message.id)}
                  className={cn(primary, "w-full")}
                >
                  <Check size={16} aria-hidden />
                  Mark as handled
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const applications = [
  {
    id: "cedar",
    company: "Cedar Engineering",
    role: "Software Engineer II",
    group: "needs",
    status: "Interviewing",
    step: 2,
    next: "Reply with your availability",
    when: "Interview invitation · today",
    sent: "28 Oct",
    history: [
      ["28 Oct", "Application sent"],
      ["29 Oct", "Application acknowledged"],
      ["2 Nov", "Interview invitation received"],
    ],
  },
  {
    id: "atlas",
    company: "Atlas Health",
    role: "Backend Engineer",
    group: "needs",
    status: "Assessment",
    step: 2,
    next: "Complete the coding assessment",
    when: "Due 4 Nov, 6:00 pm IST",
    sent: "26 Oct",
    history: [
      ["26 Oct", "Application sent"],
      ["27 Oct", "Application acknowledged"],
      ["2 Nov", "Assessment received"],
    ],
  },
  {
    id: "orbit",
    company: "Orbit Labs",
    role: "Software Engineer II",
    group: "waiting",
    status: "Acknowledged",
    step: 1,
    next: "Waiting for their next step",
    when: "Acknowledged 29 Oct",
    sent: "28 Oct",
    history: [
      ["28 Oct", "Application sent"],
      ["29 Oct", "Application acknowledged"],
    ],
  },
  {
    id: "fable",
    company: "Fable Systems",
    role: "Platform Engineer",
    group: "closed",
    status: "Application rejected",
    step: 1,
    next: "No next step",
    when: "Closed 28 Oct",
    sent: "24 Oct",
    history: [
      ["24 Oct", "Application sent"],
      ["28 Oct", "Application rejected"],
    ],
  },
] as const;

type SampleApplication = (typeof applications)[number];

/** Same circle-and-line treatment as the application view, shortened for a phone. */
function Journey({ app }: { app: SampleApplication }) {
  const closed = app.group === "closed";
  const labels = [
    "Sent",
    closed ? "Rejected" : "Received",
    app.id === "atlas" ? "Assessment" : "Interview",
    "Offer",
  ];
  return (
    <span
      role="img"
      className="grid grid-cols-4"
      aria-label={`Application journey: ${app.history.map(([date, event]) => `${event}, ${date}`).join("; ")}${closed ? "; ended here" : "; offer not reached"}`}
      data-testid="circle-journey"
    >
      {labels.map((label, i) => {
        const reached = i <= app.step;
        const current = i === app.step;
        const rejected = closed && current;
        const tone = rejected
          ? "bg-tag-rejection text-background"
          : current && app.group === "needs"
            ? "bg-warning text-background"
            : "bg-primary text-primary-foreground";
        return (
          <span
            key={label}
            aria-hidden
            className={cn("relative min-w-0 text-center", closed && i > app.step && "opacity-45")}
          >
            {i > 0 && (
              <span
                className={cn(
                  "absolute top-3 right-[calc(50%+16px)] left-[calc(-50%+16px)] h-0.5 rounded-full",
                  reached ? (rejected ? "bg-tag-rejection" : "bg-primary") : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative mx-auto grid size-6 place-items-center rounded-full",
                reached ? tone : "bg-card ring-2 ring-inset ring-border",
                current && !closed && "outline-2 outline-offset-[3px]",
                current &&
                  !closed &&
                  (app.group === "needs" ? "outline-warning" : "outline-primary"),
              )}
            >
              {rejected ? (
                <X size={13} strokeWidth={3} />
              ) : current ? (
                <span className="size-2 rounded-full bg-current" />
              ) : reached ? (
                <Check size={13} strokeWidth={3} />
              ) : null}
            </span>
            <span
              className={cn(
                "mt-2.5 block text-[10px] leading-tight tracking-tight",
                rejected
                  ? "font-semibold text-tag-rejection"
                  : reached
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            <span className="mt-1 block min-h-3.5 text-[10px] leading-tight text-muted-foreground">
              {app.history[i]?.[0] ?? ""}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ApplicationsDemo({ variant, onMail }: { variant: Variant; onMail?: () => void }) {
  const baseId = useId();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4" data-demo={`applications-${variant}`}>
      <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <span>{applications.length} applications</span>
        <span>Next actions first</span>
      </div>
      <div
        className={cn(
          variant === "A"
            ? "divide-y divide-border overflow-hidden rounded-3xl bg-card ring-1 ring-border"
            : "space-y-3",
        )}
      >
        {applications.map((app) => {
          const expanded = app.id === open;
          return (
            <article
              key={app.id}
              className={cn(
                variant === "B" && "overflow-hidden rounded-3xl bg-card ring-1 ring-border",
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : app.id)}
                aria-expanded={expanded}
                aria-controls={`${baseId}-${app.id}`}
                className="block w-full px-4 py-4 text-left hover:bg-muted/35"
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary font-semibold"
                  >
                    {app.company[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{app.company}</span>
                    <span className="block truncate text-xs text-muted-foreground">{app.role}</span>
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className={cn("shrink-0 text-muted-foreground", expanded && "rotate-180")}
                  />
                </span>
                {variant === "B" ? (
                  <span className="mt-5 block">
                    <Journey app={app} />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-medium",
                      app.group === "needs"
                        ? "bg-warning-soft text-warning"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {app.status}
                  </span>
                )}
                <span
                  className={cn(
                    "mt-4 block rounded-2xl px-3 py-2.5",
                    app.group === "needs"
                      ? "bg-selected text-selected-foreground"
                      : "bg-secondary/60",
                  )}
                >
                  {app.group !== "closed" && (
                    <span className="block text-sm font-medium">{app.next}</span>
                  )}
                  <span
                    className={cn(
                      "block text-xs",
                      app.group === "needs" ? "mt-0.5 opacity-80" : "text-muted-foreground",
                    )}
                  >
                    {app.when}
                  </span>
                </span>
              </button>
              {expanded && (
                <div
                  id={`${baseId}-${app.id}`}
                  className="space-y-4 border-t border-border px-4 py-4"
                >
                  {variant === "A" && <Journey app={app} />}
                  <ol className="m-0 list-none space-y-3 p-0">
                    {app.history.map(([date, text]) => (
                      <li key={text} className="flex gap-3 text-xs">
                        <span className="w-11 shrink-0 text-muted-foreground">{date}</span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="m-0 text-xs text-muted-foreground">
                    Submitted resume: Backend engineer v2.pdf
                  </p>
                  {app.group === "needs" && onMail && (
                    <button type="button" onClick={onMail} className={cn(primary, "w-full")}>
                      <Mail size={16} aria-hidden />
                      View related mail
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="m-0 px-1 text-xs text-muted-foreground">
        Tap an application for its story and next step.
      </p>
    </div>
  );
}

export function MobilePreview({
  picks,
  initialScreen = "overview",
  small = false,
}: {
  picks: Picks;
  initialScreen?: Screen;
  small?: boolean;
}) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [mail, setMail] = useState<MailState>(emptyMail);
  const remaining = messages.length - mail.handled.length;
  const nav = (
    <nav
      aria-label="Sample mobile navigation"
      className={cn(
        "grid grid-cols-3",
        picks.navigation === "A"
          ? "border-t border-border bg-card px-2 pt-2 pb-3"
          : "mx-4 gap-1 rounded-full bg-secondary p-1",
      )}
    >
      {(
        [
          { key: "overview", label: "Overview", icon: ChartNoAxesCombined },
          { key: "mail", label: "Mail", icon: Mail },
          { key: "applications", label: "Applications", icon: BriefcaseBusiness },
        ] as const
      ).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-current={screen === key ? "page" : undefined}
          onClick={() => setScreen(key)}
          className={cn(
            "flex min-h-12 min-w-0 items-center justify-center text-[11px] font-medium",
            picks.navigation === "A" ? "flex-col gap-1" : "rounded-full px-2",
            picks.navigation === "B" && screen === key && "bg-selected text-selected-foreground",
            screen !== key && "text-muted-foreground hover:text-foreground",
          )}
        >
          {picks.navigation === "A" && (
            <span
              className={cn(
                "relative flex h-7 w-16 items-center justify-center rounded-full",
                screen === key && "bg-selected text-selected-foreground",
              )}
            >
              <Icon size={19} aria-hidden />
              {key === "mail" && remaining > 0 && (
                <span className="absolute right-1 top-0 min-w-4 rounded-full bg-review px-1 text-[9px] text-review-foreground">
                  {remaining}
                </span>
              )}
            </span>
          )}
          {label}
        </button>
      ))}
    </nav>
  );
  return (
    <div
      className={cn(
        "mobile-gallery-phone relative mx-auto flex w-full max-w-[390px] flex-col overflow-hidden rounded-[2rem] border border-border bg-background",
        small ? "h-[590px]" : "h-[740px] max-h-[88svh]",
      )}
      data-testid="mobile-preview"
    >
      <header className="flex shrink-0 items-center justify-between px-5 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jobops-logo.svg" width={24} height={24} alt="" />
          JobOps
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] text-muted-foreground">
          Sample
        </span>
      </header>
      {picks.navigation === "B" && <div className="pb-4">{nav}</div>}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-6"
        data-testid="mobile-preview-scroll"
      >
        <div className="mb-5">
          <p className="m-0 text-xs text-muted-foreground">Monday, 2 November</p>
          <h2 className="m-0 mt-1 text-[28px] font-semibold leading-tight tracking-tight">
            {screen === "overview"
              ? "Your search, today"
              : screen === "mail"
                ? "Mail"
                : "Applications"}
          </h2>
        </div>
        {screen === "overview" && (
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => setScreen("mail")}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-selected px-4 py-3 text-left text-selected-foreground hover:bg-muted"
            >
              <Mail size={21} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {remaining
                    ? `${remaining} ${remaining === 1 ? "email needs" : "emails need"} you`
                    : "You’re all caught up"}
                </span>
                <span className="block text-xs opacity-80">
                  {remaining ? "Open your attention queue" : "No mail needs your attention"}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden />
            </button>
            <AnalyticsDemo variant={picks.analytics} />
            <MailDemo variant={picks.mail} compact controller={{ value: mail, change: setMail }} />
            <button
              type="button"
              onClick={() => setScreen("applications")}
              className={cn(secondary, "w-full")}
            >
              View applications
              <ArrowUpRight size={16} aria-hidden />
            </button>
          </div>
        )}
        {screen === "mail" && (
          <MailDemo variant={picks.mail} controller={{ value: mail, change: setMail }} />
        )}
        {screen === "applications" && (
          <ApplicationsDemo variant={picks.applications} onMail={() => setScreen("mail")} />
        )}
      </div>
      {picks.navigation === "A" && <div className="shrink-0">{nav}</div>}
    </div>
  );
}

export function BackToPreview() {
  return (
    <a href="#preview" className={secondary}>
      <ArrowLeft size={16} aria-hidden />
      Try your combination
    </a>
  );
}
