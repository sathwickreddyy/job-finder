"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  History,
  Inbox,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const samples = [
  {
    id: "interview",
    company: "Northstar",
    sender: "Priya · Talent team",
    subject: "Let’s schedule your backend interview",
    time: "10:40 AM",
    body: "Hi Sathwick,\n\nWe’d like to arrange your next interview for the Senior Backend Engineer role. Would Tuesday at 3 PM IST work for you?\n\nThanks,\nPriya",
    fresh: true,
  },
  {
    id: "reply",
    company: "Orbit",
    sender: "Arjun",
    subject: "Re: Your referral for Software Engineer II",
    time: "Yesterday",
    body: "Hi Sathwick,\n\nI’ve passed your profile to the hiring team. They’ll contact you if there’s a match.\n\nBest,\nArjun",
    fresh: true,
  },
  {
    id: "ack",
    company: "Northstar",
    sender: "Northstar Careers",
    subject: "We received your application",
    time: "28 Oct",
    body: "Hi Sathwick,\n\nThank you for applying for the Senior Backend Engineer role. We’ll be in touch with an update.",
    fresh: false,
  },
];

function Preview({ variant }: { variant: "A" | "B" }) {
  const [view, setView] = useState("new");
  const [company, setCompany] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [panel, setPanel] = useState<"search" | "settings" | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [days, setDays] = useState("30");
  const [linked, setLinked] = useState<string[]>([]);
  const [showLink, setShowLink] = useState(false);
  const [target, setTarget] = useState("");
  const [pattern, setPattern] = useState("careers.northstar.example");
  const [savedPattern, setSavedPattern] = useState(pattern);
  const rows = samples.filter(
    (row) =>
      (view === "new"
        ? row.fresh && !reviewed.includes(row.id)
        : view === "history"
          ? !row.fresh || reviewed.includes(row.id)
          : false) &&
      (!company || row.company === company) &&
      `${row.subject} ${row.sender}`.toLowerCase().includes(query.toLowerCase()),
  );
  const message = rows.find((row) => row.id === selected);
  const newCount = samples.filter((row) => row.fresh && !reviewed.includes(row.id)).length;
  function notify(text: string) {
    setFeedback(text);
  }
  function refresh() {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      notify("You’re up to date. No new mail in this preview.");
    }, 900);
  }
  function changeView(next: string) {
    setView(next);
    setSelected(null);
  }
  const refreshButton = (
    <Button
      disabled={busy}
      onClick={refresh}
      className={cn(
        "group min-h-11 gap-2.5 px-5 shadow-surface active:scale-[0.98] motion-reduce:transform-none",
        variant === "B" &&
          "border border-primary/40 bg-selected text-selected-foreground hover:bg-selected/80",
      )}
    >
      <RefreshCw
        size={16}
        aria-hidden
        className={
          busy
            ? "animate-spin"
            : "transition-transform group-hover:rotate-45 motion-reduce:transition-none"
        }
      />
      {busy ? "Checking mail…" : "Check mail"}
    </Button>
  );
  return (
    <section
      aria-label={`Option ${variant} preview`}
      className="overflow-hidden rounded-panel border border-border bg-card shadow-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-selected text-selected-foreground">
            <Mail size={18} aria-hidden />
          </span>
          <h2 className="m-0 text-lg font-semibold">Mail</h2>
        </div>
        {refreshButton}
      </header>
      <div className="px-5 pb-4">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search
              size={16}
              aria-hidden
              className="absolute left-3.5 top-3.5 text-muted-foreground"
            />
            <input
              aria-label={`Search saved mail ${variant}`}
              placeholder="Search saved mail"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              className="!min-h-11 !rounded-full !border-transparent !bg-background !pl-10"
            />
          </label>
          <Button
            variant="ghost"
            size="icon"
            className="!size-11 shrink-0 rounded-full"
            aria-label={`Mail settings ${variant}`}
            aria-expanded={panel === "settings"}
            onClick={() => setPanel(panel === "settings" ? null : "settings")}
          >
            <Settings2 size={18} aria-hidden />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="min-w-0">
            <span className="sr-only">Company {variant}</span>
            <select
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setSelected(null);
              }}
              className={cn(
                "!min-h-9 !w-auto !py-1 !text-xs",
                variant === "A"
                  ? "!rounded-full !border-transparent !bg-secondary"
                  : "!border-0 !bg-transparent !pl-0",
              )}
            >
              <option value="">All companies</option>
              <option>Northstar</option>
              <option>Orbit</option>
            </select>
          </label>
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-link hover:bg-selected"
            aria-expanded={panel === "search"}
            onClick={() => setPanel(panel === "search" ? null : "search")}
          >
            <History size={14} aria-hidden />
            Search inboxes
            <ChevronDown size={13} aria-hidden />
          </button>
        </div>
      </div>
      {panel && (
        <div className="border-y border-border bg-rail px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-sm font-semibold">
              {panel === "search" ? "Find mail in your inboxes" : "Mail settings"}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Close panel ${variant}`}
              onClick={() => setPanel(null)}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
          {panel === "search" ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Search connected accounts, including spam. Matching company mail stays in History.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-xs">
                  Dates
                  <select className="mt-1" value={days} onChange={(e) => setDays(e.target.value)}>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="all">All available history</option>
                  </select>
                </label>
                <Button
                  onClick={() => {
                    changeView("history");
                    setPanel(null);
                    notify("Preview search finished. Saved messages are shown below.");
                  }}
                >
                  <Search size={15} aria-hidden />
                  Find mail
                </Button>
              </div>
            </>
          ) : (
            <>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer py-2 font-medium">Accounts & folders</summary>
                <p className="text-muted-foreground">
                  3 sample accounts. Inbox, Archive and Spam. Read-only access.
                </p>
              </details>
              <details className="text-xs">
                <summary className="cursor-pointer py-2 font-medium">Northstar mail rules</summary>
                <label className="mt-2 block">
                  Recruiting sender domains
                  <input
                    className="mt-2"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                  />
                </label>
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={pattern === savedPattern}
                  onClick={() => {
                    setSavedPattern(pattern);
                    notify("Preview rule saved. Existing mail stays in history.");
                  }}
                >
                  Save rules
                </Button>
              </details>
              <button
                className="mt-2 min-h-9 text-xs text-link"
                onClick={() => {
                  changeView("excluded");
                  setPanel(null);
                }}
              >
                Review excluded mail
              </button>
            </>
          )}
        </div>
      )}
      <nav
        aria-label={`Mail status ${variant}`}
        className={cn(
          "flex items-center gap-1 px-5",
          variant === "A" ? "border-b border-border" : "pb-3",
        )}
      >
        {[
          ["new", "New", newCount],
          ["history", "History", samples.length - newCount],
        ].map(([id, label, count]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => changeView(String(id))}
            className={cn(
              "flex min-h-11 items-center gap-2 px-4 text-sm font-medium transition-colors motion-reduce:transition-none",
              variant === "A" ? "border-b-2" : "rounded-full",
              view === id
                ? variant === "A"
                  ? "border-primary text-link"
                  : "bg-selected text-selected-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/40",
            )}
          >
            <span>{label}</span>
            <span className="text-xs tabular-nums opacity-75">{count}</span>
          </button>
        ))}
      </nav>
      {feedback && (
        <p
          role="status"
          className="m-0 flex items-start justify-between gap-3 bg-selected px-5 py-3 text-xs text-selected-foreground"
        >
          <span>{feedback}</span>
          <button aria-label={`Dismiss notice ${variant}`} onClick={() => setFeedback("")}>
            <X size={14} aria-hidden />
          </button>
        </p>
      )}
      <div className="min-h-[330px]">
        {message ? (
          <article className="px-5 py-5">
            <button
              onClick={() => setSelected(null)}
              className="mb-5 inline-flex items-center gap-1.5 text-xs text-link"
            >
              <ArrowLeft size={14} aria-hidden />
              Back to messages
            </button>
            <p className="m-0 text-xs text-muted-foreground">
              {message.company} / Senior Backend Engineer
            </p>
            <h3 className="mb-3 mt-2 text-lg font-semibold leading-snug">{message.subject}</h3>
            <p className="text-xs text-muted-foreground">
              {message.sender} <span className="float-right">{message.time}</span>
            </p>
            <p className="mb-7 mt-6 whitespace-pre-line text-sm leading-7">{message.body}</p>
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 border-t border-border pt-4",
                variant === "B" && "rounded-2xl border-0 bg-rail p-3",
              )}
            >
              {view === "new" && (
                <Button
                  onClick={() => {
                    setReviewed((previous) => [...previous, message.id]);
                    setSelected(null);
                    notify("Reviewed. You can find this message in History.");
                  }}
                >
                  <Check size={16} aria-hidden />
                  Mark reviewed
                </Button>
              )}
              <Button
                variant="outline"
                disabled={linked.includes(message.id)}
                onClick={() => {
                  setShowLink(!showLink);
                  setTarget("");
                }}
              >
                {linked.includes(message.id) ? (
                  <>
                    <Check size={15} aria-hidden />
                    Linked
                  </>
                ) : (
                  "Link to application"
                )}
              </Button>
            </div>
            {showLink && !linked.includes(message.id) && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs">
                  Application
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="mt-1"
                  >
                    <option value="">Choose application</option>
                    <option value="role">{message.company} · Senior Backend Engineer</option>
                  </select>
                </label>
                <Button
                  disabled={!target}
                  onClick={() => {
                    setLinked((previous) => [...previous, message.id]);
                    setReviewed((previous) => [...previous, message.id]);
                    setShowLink(false);
                    setSelected(null);
                    notify("Linked to the sample application and kept in History.");
                  }}
                >
                  Link message
                </Button>
              </div>
            )}
          </article>
        ) : rows.length ? (
          <ul className="m-0 list-none p-0">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  onClick={() => {
                    setSelected(row.id);
                    setShowLink(false);
                    setTarget("");
                  }}
                  className="group block w-full border-b border-border/40 px-5 py-5 text-left transition-colors hover:bg-selected/40 focus-visible:bg-selected/40 motion-reduce:transition-none"
                >
                  <span className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>{row.sender}</span>
                    <span className="shrink-0">{row.time}</span>
                  </span>
                  <span className="mt-2 block text-sm font-semibold leading-6">{row.subject}</span>
                  <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{row.company}</span>
                    <ArrowUpRight
                      size={14}
                      aria-hidden
                      className="text-link opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-8 py-14 text-center">
            <Inbox size={25} className="mx-auto text-muted-foreground" aria-hidden />
            <h3 className="mb-2 mt-4 text-base font-medium">
              {view === "excluded" ? "No exclusions in this preview" : "You’re all caught up"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {query
                ? "Try a different search or company."
                : "Earlier conversations are saved in History."}
            </p>
          </div>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-border bg-rail/50 px-5 py-3 text-xs text-muted-foreground">
        <span>3 accounts connected</span>
        <span>Sample data only</span>
      </footer>
    </section>
  );
}

export function MailControlsGallery() {
  return (
    <div className="space-y-7">
      <header className="max-w-2xl">
        <p className="m-0 text-sm text-link">Mail / Controls preview</p>
        <h1 className="mb-3 mt-2 text-3xl font-semibold tracking-tight">
          Less setup. More conversation.
        </h1>
        <p className="m-0 text-sm leading-6 text-muted-foreground">
          Two live treatments for the same mail flow. Try Check mail, filter a company, open a
          message, and mark it reviewed. Everything here uses fictional messages.
        </p>
      </header>
      <div className="grid items-start gap-7 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-base font-semibold">A · Focused toolbar</h2>
            <span className="text-xs text-link">Recommended</span>
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            Filled primary action, quiet tabs, and inline message actions.
          </p>
          <Preview variant="A" />
        </div>
        <div className="space-y-3">
          <h2 className="m-0 text-base font-semibold">B · Softer controls</h2>
          <p className="m-0 text-xs text-muted-foreground">
            Tonal primary action, pill tabs, and a grouped message action bar.
          </p>
          <Preview variant="B" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        The existing mail list and reader layout stay. These choices cover the toolbar, filters and
        message buttons; settings are secondary in both.
      </p>
    </div>
  );
}
