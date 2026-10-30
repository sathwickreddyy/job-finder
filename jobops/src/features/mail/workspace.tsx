"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Inbox,
  Link2,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLoadingTask } from "@/components/loading/overlay";
import { checkMail, handleMailAction, placeMailAction } from "./workspace-actions";
import type { MailWorkspaceData, WorkspaceQuery } from "./workspace-data";
import type { MailItem } from "./mail-item";
import { mailDateGroup } from "./attention";
import { tagLabel, type MailTag } from "./tags";
import { CompanyRuleEditor } from "./company-rule-editor";
import type { ActionState } from "@/lib/actions";
type Scope = "all" | "company" | "application";
type View = "open" | "all";
type Detail = "message" | "rules" | "folders";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const nameOf = (message: MailItem) => message.senderName || message.sender;
const folderText = (message: MailItem) => message.folders.join(", ") || "Folder not recorded";
const isSpam = (message: MailItem) => /spam|junk/i.test(message.folders.join(" "));
// Literal class names so Tailwind generates each tag's colour pair.
const tagStyles: Record<MailTag, { chip: string; dot: string }> = {
  opportunity: {
    chip: "bg-tag-opportunity-container text-tag-opportunity",
    dot: "bg-tag-opportunity",
  },
  process: { chip: "bg-tag-process-container text-tag-process", dot: "bg-tag-process" },
  offer: { chip: "bg-tag-offer-container text-tag-offer", dot: "bg-tag-offer" },
  rejected: { chip: "bg-tag-rejected-container text-tag-rejected", dot: "bg-tag-rejected" },
  other: { chip: "bg-tag-other-container text-tag-other", dot: "bg-tag-other" },
};
function TagChip({ tag }: { tag: MailTag }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
        tagStyles[tag].chip,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tagStyles[tag].dot)} />
      {tagLabel[tag]}
    </span>
  );
}
export function MailWorkspace({
  data,
  initial,
}: {
  data: MailWorkspaceData;
  initial: WorkspaceQuery;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const currentParams = params.toString();
  const [transitionPending, startTransition] = useTransition();
  const [savingRules, setSavingRules] = useState(false);
  const pending = transitionPending || savingRules;
  useLoadingTask(pending, "Updating mail workspace");
  const companies = data.companies.map((row) => ({
    ...row,
    initial: row.name[0],
  }));
  const applications = data.applications;
  const scope: Scope = initial.application ? "application" : initial.company ? "company" : "all";
  const companyId = initial.company ?? companies[0]?.id ?? "";
  const applicationId = initial.application ?? applications[0]?.id ?? "";
  const view: View = initial.view === "all" ? "all" : "open";
  const [selectedId, setSelectedId] = useState(initial.selected ?? "");
  const [search, setSearch] = useState({ saved: initial.q ?? "", draft: initial.q ?? "" });
  // Back/forward navigation changes the URL without remounting this workspace.
  if (search.saved !== (initial.q ?? ""))
    setSearch({ saved: initial.q ?? "", draft: initial.q ?? "" });
  const query = search.draft;
  const [feedback, setFeedback] = useState(initial.notice ?? "");
  const [detail, setDetail] = useState<Detail>("message");
  const [mobileReader, setMobileReader] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [linkChoice, setLinkChoice] = useState({ message: "", application: "" });
  // The picker belongs to one message; selecting another message closes it.
  const [linking, setLinking] = useState("");
  const [checking, setChecking] = useState(false);
  const [ruleOverride, setRuleOverride] = useState("");
  const currentApplication = applications.find((row) => row.id === applicationId) ?? {
    company: companyId,
    role: "Choose an application",
  };
  const contextCompany = scope === "application" ? currentApplication.company : companyId;
  const company = companies.find((row) => row.id === contextCompany) ?? {
    id: "",
    name: "Company",
  };
  const all = data.items;
  const visible = all;
  const selected = visible.find((message) => message.id === selectedId) ?? visible[0];
  const linkTarget = linkChoice.message === selected?.id ? linkChoice.application : "";
  // Linked messages cannot be moved to another application here.
  const canLink = Boolean(selected && !selected.application && applications.length);
  const showLink = canLink && linking === selected?.id;
  const selectedApplication = applications.find((row) => row.id === selected?.application?.id);
  const reconnect = data.connections.filter((row) => row.lastError);
  const ruleId =
    ruleOverride || (scope === "all" ? selected?.company?.key || companyId : contextCompany);
  const ruleCompany = companies.find((row) => row.id === ruleId) ?? {
    name: "Choose a company",
    ruleSource: "Select a company before editing its pattern",
  };
  const rule = companies.find((row) => row.id === ruleId)?.rule ?? {
    company: "",
    aliases: [],
    domains: [],
    senders: [],
    subjectTerms: [],
    excludedTerms: [],
  };
  const thread: MailItem[] = selected?.application
    ? all.filter(
        (message) =>
          message.id !== selected.id &&
          message.application?.id === selected.application?.id &&
          message.receivedAt < selected.receivedAt,
      )
    : [];
  const title =
    scope === "all"
      ? "All companies"
      : scope === "company"
        ? company.name
        : currentApplication.role;
  const subtitle =
    scope === "all"
      ? "Every company and application, across your connected accounts."
      : scope === "company"
        ? "All applications and outreach"
        : `${company.name} / Application mail`;
  function navigate(changes: Record<string, string | undefined>, clearCursor = false) {
    const next = new URLSearchParams(currentParams);
    if (!("cursor" in changes) || clearCursor) next.delete("cursor");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("notice" in changes)) next.delete("notice");
    next.delete("selected");
    setDetail("message");
    setMobileReader(false);
    startTransition(() => router.push(`/mail${next.size ? `?${next}` : ""}`, { scroll: false }));
  }
  useEffect(() => {
    if (query.trim().slice(0, 200) === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(currentParams);
      if (query.trim()) next.set("q", query.trim().slice(0, 200));
      else next.delete("q");
      next.delete("cursor");
      startTransition(() => router.replace(`/mail?${next}`, { scroll: false }));
    }, 450);
    return () => clearTimeout(timer);
  }, [query, currentParams, params, router]);
  function changeScope(next: Scope) {
    navigate({
      company: next === "company" ? companyId : undefined,
      application: next === "application" ? applicationId : undefined,
    });
  }
  function openCompany(id: string) {
    navigate({ company: id, application: undefined });
  }
  function openApplication(id: string) {
    navigate({ company: undefined, application: id });
  }
  function setView(next: View) {
    navigate({ view: next });
  }
  function openDetail(next: Detail) {
    setDetail(next);
    setMobileReader(true);
  }
  function run(
    action: (previous: ActionState, form: FormData) => Promise<ActionState>,
    fields: Record<string, string>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) if (value) form.set(key, value);
      try {
        const result = await action({}, form);
        setFeedback(result.error ?? result.success ?? "");
        if (!result.error) onSuccess?.();
        router.refresh();
      } catch {
        setFeedback(
          "Connection interrupted. Saved changes and scan pages are safe. Reload or retry to continue.",
        );
      }
    });
  }
  function runCheck() {
    setChecking(true);
    startTransition(async () => {
      let arrived = 0;
      let result: Awaited<ReturnType<typeof checkMail>> = {};
      try {
        // Each call checks one page per inbox, so an interrupted check resumes on the next press.
        for (let call = 0; call < 20; call++) {
          result = await checkMail();
          if (result.error || !result.mailCheck) break;
          arrived += result.mailCheck.newAttention;
          setFeedback(`Checking ${result.mailCheck.accounts.length} inboxes…`);
          if (!result.mailCheck.more) break;
        }
        const failed = result.mailCheck?.accounts.filter((row) => row.status === "failed") ?? [];
        setFeedback(
          result.error ??
            [
              arrived ? `${arrived} new need attention.` : "No new mail.",
              result.mailCheck?.more ? "More mail remains; check again to continue." : "",
              failed.length
                ? `Reconnect ${failed.map((row) => row.account).join(", ")} in Settings.`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
        );
        router.refresh();
      } catch {
        setFeedback("Connection interrupted. Checked pages are safe. Check again to continue.");
      } finally {
        setChecking(false);
      }
    });
  }

  function justInfo() {
    if (selected)
      run(handleMailAction, { id: selected.id, justInfo: "1" }, () => setMobileReader(false));
  }
  function placeMessage() {
    if (selected)
      run(placeMailAction, { id: selected.id, application: linkTarget }, () => setLinking(""));
  }
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Mail</h1>
          <span className="hidden border-l border-border pl-3 text-xs text-muted-foreground sm:inline">
            Your hiring conversations
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            disabled={pending}
            aria-label="Mail settings"
            title="Mail settings"
            className="!size-11 shrink-0"
            onClick={() => openDetail("folders")}
          >
            <Settings2 size={18} aria-hidden />
          </Button>
          <Button
            className="group min-h-11 gap-2.5 px-5 shadow-surface active:scale-[0.98] motion-reduce:transform-none"
            title="Check connected accounts for new hiring updates"
            disabled={pending || !data.connections.length}
            onClick={runCheck}
          >
            <RefreshCw
              size={16}
              aria-hidden
              className={
                checking
                  ? "animate-spin"
                  : "transition-transform group-hover:rotate-45 motion-reduce:transition-none"
              }
            />
            {checking ? "Checking…" : "Check mail"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-border bg-card md:h-[calc(100dvh-180px)] md:min-h-[500px] md:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.05fr)] lg:grid-cols-[180px_minmax(320px,0.95fr)_minmax(0,1.05fr)]">
        <aside
          aria-label="Mail navigation"
          className="hidden min-h-0 flex-col bg-rail px-3 py-5 lg:flex"
        >
          <nav aria-label="Mail scope" className="space-y-1">
            {(
              [
                ["all", "All companies", Inbox],
                ["company", "Companies", Building2],
                ["application", "Applications", FileText],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                disabled={id === "application" && !applications.length}
                title={
                  id === "application" && !applications.length
                    ? "Record an application first"
                    : undefined
                }
                onClick={() => changeScope(id)}
                aria-pressed={scope === id}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium",
                  scope === id
                    ? "bg-selected text-selected-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon size={17} aria-hidden />
                {label}
              </button>
            ))}
          </nav>
          <p className="mb-2 mt-8 px-3 text-xs text-muted-foreground">Companies</p>
          {companies.slice(0, 12).map((row) => (
            <button
              key={row.id}
              onClick={() => openCompany(row.id)}
              aria-pressed={scope === "company" && companyId === row.id}
              className={cn(
                "flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-left text-sm",
                scope !== "all" && contextCompany === row.id
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className="grid size-5 shrink-0 place-items-center rounded-md bg-secondary text-[11px] text-secondary-foreground"
              >
                {row.initial}
              </span>
              <span className="flex-1">{row.name}</span>
            </button>
          ))}
          <div className="mt-auto space-y-3 px-3 pt-8">
            <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
              <Mail size={14} aria-hidden />
              {data.connections.length} connected accounts
            </p>
          </div>
        </aside>

        <section
          aria-label="Mail results"
          className={cn(
            "flex min-h-0 min-w-0 flex-col md:border-r md:border-border lg:border-l",
            mobileReader && "hidden md:flex",
          )}
        >
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 text-xl font-semibold tracking-tight">{title}</h2>
                <p className="mb-0 mt-1 text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2 lg:hidden">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Mail scope</span>
                <select
                  aria-label="Mail scope"
                  value={scope}
                  onChange={(event) => changeScope(event.target.value as Scope)}
                >
                  <option value="all">All companies</option>
                  <option value="company">Companies</option>
                  <option value="application" disabled={!applications.length}>
                    Applications
                  </option>
                </select>
              </label>
            </div>
            {scope !== "all" && (
              <label className="mt-4 block">
                <span className="sr-only">
                  {scope === "company" ? "Choose company" : "Choose application"}
                </span>
                <select
                  aria-label={scope === "company" ? "Choose company" : "Choose application"}
                  value={scope === "company" ? companyId : applicationId}
                  onChange={(event) =>
                    scope === "company"
                      ? openCompany(event.target.value)
                      : openApplication(event.target.value)
                  }
                >
                  {scope === "company"
                    ? companies.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))
                    : applications.map((row) => (
                        <option key={row.id} value={row.id}>
                          {companies.find((item) => item.id === row.company)?.name} / {row.role}
                        </option>
                      ))}
                </select>
              </label>
            )}
            <label className="relative mt-4 block">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
              />
              <span className="sr-only">Search saved mail</span>
              <input
                aria-label="Search saved mail"
                maxLength={200}
                value={query}
                onChange={(event) =>
                  setSearch({ saved: initial.q ?? "", draft: event.target.value })
                }
                placeholder="Search saved mail"
                className="!min-h-11 !rounded-full !border-transparent !bg-background !pl-10"
              />
            </label>
          </div>
          <div className="border-b border-border px-3">
            <nav aria-label="Mail status" className="flex min-w-0 gap-1">
              {(
                [
                  ["open", `Needs attention (${data.openCount})`],
                  ["all", "All mail"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setView(id);
                    setMobileReader(false);
                    setDetail("message");
                  }}
                  aria-pressed={view === id}
                  className={cn(
                    "flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors motion-reduce:transition-none",
                    view === id
                      ? "border-primary text-link"
                      : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          {reconnect.length > 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 bg-danger-soft px-5 py-3 text-xs text-destructive"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {reconnect.map((row) => row.email).join(", ")}{" "}
                {reconnect.length === 1 ? "needs" : "need"} reconnecting before mail can be checked.
              </span>
              <a className="font-medium text-link" href="/settings">
                Reconnect
              </a>
            </div>
          )}
          {feedback && (
            <div
              role="status"
              className="flex items-start justify-between gap-3 bg-selected px-5 py-3 text-xs text-selected-foreground"
            >
              <span>{feedback}</span>
              <button onClick={() => setFeedback("")} aria-label="Dismiss feedback">
                <X size={14} aria-hidden />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length > 0 ? (
              <>
                <ul className="m-0 list-none p-0">
                  {visible.map((message, index) => {
                    const group = mailDateGroup(new Date(message.receivedAt));
                    return (
                      <li key={message.id}>
                        {(index === 0 ||
                          mailDateGroup(new Date(visible[index - 1].receivedAt)) !== group) && (
                          <p className="m-0 bg-background/60 px-5 py-2 text-xs text-muted-foreground">
                            {group}
                          </p>
                        )}
                        <button
                          onClick={() => {
                            setSelectedId(message.id);
                            setDetail("message");
                            setShowThread(false);
                            setMobileReader(true);
                          }}
                          aria-pressed={selected?.id === message.id && detail === "message"}
                          className={cn(
                            "relative block w-full border-b border-border/40 px-5 py-3 text-left transition-colors motion-reduce:transition-none",
                            selected?.id === message.id && detail === "message"
                              ? "bg-selected/65 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary"
                              : "hover:bg-muted/40",
                          )}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium">{nameOf(message)}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatTime(message.receivedAt)}
                            </span>
                          </span>
                          <span className="mt-1.5 block truncate text-sm font-semibold">
                            {message.subject}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {message.company?.name ?? "Company not placed"}
                            {message.application ? ` / ${message.application.role}` : ""}
                          </span>
                          <span className="mt-2 flex min-w-0 items-center gap-2 text-xs">
                            <TagChip tag={message.tag} />
                            {message.attention === "handled" && (
                              <span className="text-muted-foreground">Handled</span>
                            )}
                            {isSpam(message) && (
                              <span className="flex items-center gap-1 text-warning">
                                <ShieldCheck size={12} aria-hidden />
                                {folderText(message)}
                              </span>
                            )}
                            <span className="ml-auto truncate text-muted-foreground">
                              {message.account}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="px-8 py-16 text-center">
                <Inbox size={24} aria-hidden className="mx-auto text-muted-foreground" />
                <h3 className="mb-0 mt-4 text-base font-medium">
                  {query
                    ? "No matching mail"
                    : view === "open"
                      ? "Nothing needs attention"
                      : "No mail yet"}
                </h3>
                <p className="mb-0 mt-2 text-sm text-muted-foreground">
                  {query
                    ? "Try a different search."
                    : view === "open"
                      ? "New hiring mail appears here after Check mail."
                      : "Check mail to find hiring updates."}
                </p>
                {view === "open" && !query && (
                  <Button variant="outline" className="mt-5" onClick={() => setView("all")}>
                    Show all mail
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>{visible.length} shown</span>
            <div className="flex gap-3">
              {initial.cursor && (
                <button className="text-link" onClick={() => navigate({}, true)}>
                  Newest
                </button>
              )}
              {data.nextCursor && (
                <button
                  className="text-link"
                  onClick={() => navigate({ cursor: data.nextCursor! })}
                >
                  Older results
                </button>
              )}
            </div>
          </div>
        </section>

        <section
          aria-label={
            detail === "message"
              ? "Conversation"
              : detail === "rules"
                ? "Company mail rules"
                : "Mail settings"
          }
          className={cn("flex min-h-0 min-w-0 flex-col", !mobileReader && "hidden md:flex")}
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-5">
            <button
              onClick={() => {
                setMobileReader(false);
                setDetail("message");
              }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <ArrowLeft size={15} aria-hidden />
              {detail === "message" ? (
                <span className="md:hidden">Back to mail</span>
              ) : (
                "Back to message"
              )}
              <span className={detail === "message" ? "hidden md:inline" : "hidden"}>
                Conversation
              </span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6 xl:p-8">
            {detail === "message" ? (
              selected ? (
                <>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {selected.company ? (
                      <button
                        onClick={() => openCompany(selected.company!.key)}
                        className="hover:text-link"
                      >
                        {selected.company.name}
                      </button>
                    ) : (
                      <span>Company not placed</span>
                    )}
                    <ChevronRight size={12} aria-hidden />
                    {selectedApplication ? (
                      <button
                        onClick={() => openApplication(selectedApplication.id)}
                        className="hover:text-link"
                      >
                        {selectedApplication.role}
                      </button>
                    ) : (
                      <span>No application linked</span>
                    )}
                  </div>
                  <h3 className="mb-0 mt-4 max-w-xl text-xl font-semibold leading-snug tracking-tight">
                    {selected.subject}
                  </h3>
                  <div className="mt-6 flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground"
                    >
                      {nameOf(selected)
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-sm font-medium">{nameOf(selected)}</p>
                      <p className="m-0 truncate text-xs text-muted-foreground">
                        {selected.sender}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(selected.receivedAt)}
                    </span>
                  </div>
                  <p className="mb-0 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <TagChip tag={selected.tag} />
                    <span>{selected.kind}</span>
                    <span>{selected.account}</span>
                    <span className="flex items-center gap-1.5">
                      <Folder size={12} aria-hidden />
                      {folderText(selected)}
                    </span>
                  </p>
                  <div className="mt-7 whitespace-pre-line text-sm leading-7 [overflow-wrap:anywhere]">
                    {selected.text || "No plain-text body available."}
                  </div>
                  {selectedApplication && (
                    <div className="flex flex-wrap gap-4 border-t border-border py-4 text-xs">
                      <button
                        className="text-link"
                        onClick={() =>
                          navigate({
                            application: selectedApplication.id,
                            company: undefined,
                            view: "all",
                          })
                        }
                      >
                        All mail for this application
                      </button>
                      <a className="text-link" href={`/applications/${selectedApplication.id}`}>
                        Open application
                      </a>
                    </div>
                  )}
                  {thread.length > 0 && (
                    <div className="border-t border-border/60 py-4">
                      <button
                        aria-expanded={showThread}
                        onClick={() => setShowThread(!showThread)}
                        className="flex w-full items-center justify-between text-xs text-muted-foreground"
                      >
                        <span>
                          {thread.length} earlier {thread.length === 1 ? "message" : "messages"} for
                          this application
                        </span>
                        <ChevronDown
                          size={14}
                          aria-hidden
                          className={showThread ? "rotate-180" : undefined}
                        />
                      </button>
                      {showThread &&
                        thread.map((message) => (
                          <div key={message.id} className="mt-4 border-l border-border pl-4">
                            <p className="m-0 text-xs text-muted-foreground">
                              {formatTime(message.receivedAt)} / {folderText(message)}
                            </p>
                            <p className="mb-0 mt-1 text-sm font-medium">{message.subject}</p>
                            <p className="mb-0 mt-2 whitespace-pre-line text-xs leading-6 text-muted-foreground">
                              {message.text}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="grid h-full min-h-48 place-content-center text-center text-muted-foreground">
                  <Mail size={28} aria-hidden className="mx-auto" />
                  <p className="mb-0 mt-4 text-sm">Select a conversation</p>
                </div>
              )
            ) : detail === "rules" ? (
              <>
                <h3 className="m-0 text-lg font-semibold">Company mail pattern</h3>
                <label className="mt-4 block text-xs">
                  Company
                  <select
                    aria-label="Pattern company"
                    className="mt-1"
                    value={ruleId}
                    onChange={(event) => setRuleOverride(event.target.value)}
                  >
                    {companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mb-6 mt-2 text-xs text-muted-foreground">
                  {ruleCompany.ruleSource}. These patterns filter incoming hiring mail.
                </p>
                {ruleId && (
                  <CompanyRuleEditor
                    key={`${ruleId}:${JSON.stringify(rule)}`}
                    company={ruleId}
                    rule={rule}
                    disabled={transitionPending}
                    onPending={setSavingRules}
                    onSaved={(message) => {
                      setFeedback(message);
                      router.refresh();
                    }}
                  />
                )}
                <div className="mt-7 border-t border-border pt-5">
                  <h4 className="m-0 text-sm font-medium">People you contacted</h4>
                  <p className="mb-0 mt-2 text-xs leading-6 text-muted-foreground">
                    {data.applications
                      .filter((app) => app.company === ruleId && app.recipient && app.sentAt)
                      .map((app) => app.recipient)
                      .join(", ") || "No outgoing recipients recorded for this company."}
                  </p>
                </div>
              </>
            ) : (
              <>
                <h3 className="m-0 text-lg font-semibold">Mail settings</h3>
                <div className="my-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => openDetail("rules")}>
                    <Settings2 size={15} aria-hidden />
                    Company rules
                  </Button>
                </div>
                <h4 className="m-0 text-sm font-medium">Accounts & folders</h4>
                <p className="mb-6 mt-2 text-xs text-muted-foreground">
                  Read-only access. Spam and trash are included in provider searches. Sent mail and
                  drafts are excluded from new updates.
                </p>
                {data.connections.map((connection) => (
                  <div key={connection.id} className="border-t border-border py-4">
                    <h4 className="m-0 break-all text-sm font-medium">{connection.email}</h4>
                    <p className="mb-0 mt-1 text-xs text-muted-foreground">
                      {connection.provider} ·{" "}
                      {connection.lastChecked
                        ? `Last checked ${formatDate(connection.lastChecked)}`
                        : "Not checked yet"}
                    </p>
                    {connection.lastError && (
                      <p className="mt-2 text-xs text-destructive">
                        {connection.lastError}{" "}
                        <a
                          className="text-link"
                          href={`/api/mail/${connection.provider === "GMAIL" ? "gmail" : "outlook"}/connect`}
                        >
                          Reconnect if access expired
                        </a>
                      </p>
                    )}
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-link">Folders checked</summary>
                      <ul className="mt-3 space-y-1 pl-4 text-muted-foreground">
                        {data.coverage
                          .find((item) => item.account === connection.email)
                          ?.folders.map((folder) => (
                            <li key={folder.id}>
                              {folder.name}
                              {folder.contextOnly ? " (context only)" : ""}
                            </li>
                          ))}
                      </ul>
                      {!data.coverage.find((item) => item.account === connection.email)
                        ?.checkedAt && (
                        <p className="text-muted-foreground">Use Check mail to discover folders.</p>
                      )}
                    </details>
                  </div>
                ))}
                <div className="mt-5 flex flex-wrap gap-2">
                  {data.configs.map((config) =>
                    config.configured ? (
                      <Button key={config.slug} size="sm" variant="outline" asChild>
                        <a href={`/api/mail/${config.slug}/connect`}>Connect {config.label}</a>
                      </Button>
                    ) : (
                      <p key={config.slug} className="text-xs text-muted-foreground">
                        {config.label} setup needed: {config.missing.join(", ")}
                      </p>
                    ),
                  )}
                </div>
                <p className="mt-6 text-xs leading-6 text-muted-foreground">
                  Check mail reads from each account&apos;s last check to now. Permanently deleted
                  mail and separate online archive mailboxes cannot be recovered here.
                </p>
              </>
            )}
          </div>
          {detail === "message" && selected && (
            <div className="border-t border-border px-6 py-4 xl:px-8">
              <p className="m-0 text-xs text-muted-foreground">
                {selected.attention === "open" ? "Needs attention" : "Handled"}
              </p>
              <p className="mb-4 mt-1 text-sm font-medium">
                {selected.attention === "open"
                  ? "Just info clears it. Record outcomes on its application."
                  : selected.outcome
                    ? "Outcome recorded from this email."
                    : selected.handledAt
                      ? `Handled ${formatDate(selected.handledAt)}.`
                      : "Already handled."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {selected.attention === "open" && (
                  <Button
                    disabled={pending}
                    onClick={justInfo}
                    className="shadow-surface active:scale-[0.98] motion-reduce:transform-none"
                  >
                    <Check size={16} aria-hidden />
                    Just info
                  </Button>
                )}
                {canLink && (
                  <Button
                    variant="outline"
                    disabled={pending}
                    aria-expanded={showLink}
                    onClick={() => setLinking(showLink ? "" : selected.id)}
                  >
                    <Link2 size={15} aria-hidden />
                    Link to application
                  </Button>
                )}
              </div>
              {showLink && (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-muted-foreground">
                    Application
                    <select
                      aria-label="Link to application"
                      className="mt-1.5"
                      value={linkTarget}
                      onChange={(event) =>
                        setLinkChoice({ message: selected.id, application: event.target.value })
                      }
                    >
                      <option value="">Choose application</option>
                      {applications
                        .filter((app) => !selected.company || app.company === selected.company.key)
                        .map((app) => (
                          <option key={app.id} value={app.id}>
                            {companies.find((row) => row.id === app.company)?.name} · {app.role}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button disabled={pending || !linkTarget} onClick={placeMessage}>
                    Link message
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
