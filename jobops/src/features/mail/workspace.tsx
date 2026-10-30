"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  History,
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
import {
  checkWorkspaceMail,
  reviewWorkspaceMail,
  associateWorkspaceMail,
} from "./workspace-actions";
import type { MailWorkspaceData, WorkspaceQuery, MailRow } from "./workspace-data";
import { CompanyRuleEditor } from "./company-rule-editor";
import { HistorySearchPanel } from "./history-search-panel";
import type { ActionState } from "@/lib/actions";
type Scope = "all" | "company" | "application";
type View = "latest" | "history" | "excluded";
type Detail = "message" | "rules" | "folders" | "search";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
  const [searching, setSearching] = useState(false);
  const pending = transitionPending || savingRules || searching;
  useLoadingTask(pending, "Updating mail workspace");
  const companies = data.companies.map((row) => ({
    ...row,
    initial: row.name[0],
  }));
  const applications = data.applications;
  const accountNames = data.connections.map((row) => row.email);
  const scope: Scope = initial.application ? "application" : initial.company ? "company" : "all";
  const companyId = initial.company ?? companies[0]?.id ?? "";
  const applicationId = initial.application ?? applications[0]?.id ?? "";
  const view: View =
    initial.view === "history" || initial.view === "excluded" ? initial.view : "latest";
  const [selectedId, setSelectedId] = useState(initial.selected ?? "");
  const account = initial.account ?? "All accounts";
  const [search, setSearch] = useState({ saved: initial.q ?? "", draft: initial.q ?? "" });
  // Back/forward navigation changes the URL without remounting this workspace.
  if (search.saved !== (initial.q ?? ""))
    setSearch({ saved: initial.q ?? "", draft: initial.q ?? "" });
  const query = search.draft;
  const [feedback, setFeedback] = useState(initial.notice ?? "");
  const [detail, setDetail] = useState<Detail>(initial.search === "1" ? "search" : "message");
  const [mobileReader, setMobileReader] = useState(initial.search === "1");
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
  const all = data.messages;
  const visible = all;
  const counts = data.counts;
  const selected = visible.find((message) => message.id === selectedId) ?? visible[0];
  const linkTarget = linkChoice.message === selected?.id ? linkChoice.application : "";
  // Linked messages cannot be moved to another application here.
  const canLink = Boolean(
    selected?.messageId && !selected.application && applications.length && view !== "excluded",
  );
  const showLink = canLink && linking === selected?.id;
  const selectedCompany = companies.find((row) => row.id === selected?.company);
  const selectedApplication = applications.find((row) => row.id === selected?.application);
  const ruleId =
    ruleOverride || (scope === "all" ? selected?.company || companyId : contextCompany);
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
  const thread: MailRow[] = selected
    ? all.filter(
        (message) =>
          message.id !== selected.id &&
          message.application &&
          message.application === selected.application &&
          message.receivedAt < selected.receivedAt &&
          message.decision.destination === "history",
      )
    : [];
  const title =
    scope === "all" ? "All mail" : scope === "company" ? company.name : currentApplication.role;
  const subtitle =
    scope === "all"
      ? "Every company and application, across your connected accounts."
      : scope === "company"
        ? "All applications and outreach"
        : `${company.name} / Application mail`;
  function navigate(changes: Record<string, string | undefined>, clearBefore = false) {
    const next = new URLSearchParams(currentParams);
    if (!("before" in changes) || clearBefore) next.delete("before");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("notice" in changes)) next.delete("notice");
    next.delete("search");
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
      next.delete("before");
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
  function setAccount(next: string) {
    navigate({ account: next === "All accounts" ? undefined : next });
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
  function runCheck(mode: "latest" | "history") {
    setChecking(true);
    startTransition(async () => {
      const form = new FormData();
      for (const [key, value] of Object.entries({
        mode,
        company: initial.company ?? "",
        application: initial.application ?? "",
        account: initial.account ?? "",
      }))
        if (value) form.set(key, value);
      let arrived = 0,
        historical = 0,
        scanned = 0,
        more = false,
        result: ActionState = {};
      try {
        // Short page-sized requests keep long backfills resumable through a
        // browser/proxy timeout, while one click can still examine four pages.
        for (let batch = 0; batch < 4; batch++) {
          result = await checkWorkspaceMail({}, form);
          arrived += result.mailRefresh?.arrived ?? 0;
          historical += result.mailScan?.historical ?? 0;
          scanned += result.mailScan?.scanned ?? 0;
          more = result.mailScan?.more ?? false;
          if (result.error || result.mailScan?.failed) break;
          setFeedback(`${scanned} messages examined. ${historical} historical matches found.`);
          if (!more) break;
        }
        setFeedback(
          result.error || result.mailScan?.failed
            ? (result.error ?? result.success ?? "Check interrupted; see Accounts for details.")
            : `${mode === "history" ? `${historical} historical ${historical === 1 ? "match" : "matches"} saved to History` : `${arrived} new ${arrived === 1 ? "update" : "updates"}; ${historical} older ${historical === 1 ? "match" : "matches"} kept in History`}. ${more ? "More mail remains. Continue the check to resume." : "Selected window checked across all accounts."}`,
        );
        if (mode === "history" && !result.error && !result.mailScan?.failed) {
          const next = new URLSearchParams(currentParams);
          next.set("view", "history");
          next.delete("before");
          setDetail("message");
          setMobileReader(false);
          router.replace(`/mail?${next}`, { scroll: false });
        }
        router.refresh();
      } catch {
        setFeedback(
          "Connection interrupted. Saved scan pages are safe. Reload or retry to continue.",
        );
      } finally {
        setChecking(false);
      }
    });
  }

  function reviewMessage() {
    if (selected) {
      run(reviewWorkspaceMail, { id: selected.id }, () => setMobileReader(false));
    }
  }
  function associateMessage() {
    if (selected)
      run(associateWorkspaceMail, { id: selected.id, application: linkTarget }, () =>
        setLinking(""),
      );
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
            variant="ghost"
            disabled={pending}
            onClick={() => openDetail("search")}
            className="gap-1.5 text-link"
          >
            <History size={15} aria-hidden />
            Search inboxes
            <ChevronDown size={13} aria-hidden />
          </Button>
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
            onClick={() => runCheck("latest")}
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
            {checking
              ? "Checking…"
              : data.scans.some((scan) => scan.mode === "latest" && !scan.complete)
                ? "Continue check"
                : "Check mail"}
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
                ["all", "All mail", Inbox],
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
                  <option value="all">All mail</option>
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
          <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-border px-3">
            <nav aria-label="Mail status" className="flex min-w-0 gap-1">
              {(
                [
                  ["latest", "New"],
                  ["history", "History"],
                  ...(view === "excluded" ? [["excluded", "Excluded"] as const] : []),
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
                  <span className="text-xs tabular-nums opacity-75">{counts[id]}</span>
                </button>
              ))}
            </nav>
            <label className="ml-auto min-w-0 py-1">
              <span className="sr-only">Account</span>
              <select
                aria-label="Account"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                className="!min-h-8 !w-28 !border-0 !bg-transparent !px-1 !py-1 !text-xs"
              >
                <option>All accounts</option>
                {accountNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
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
                <p className="m-0 px-5 pb-2 pt-4 text-xs text-muted-foreground">
                  {view === "history"
                    ? "Tracked conversations"
                    : view === "excluded"
                      ? "Kept out of Latest"
                      : "New hiring updates"}
                </p>
                <ul className="m-0 list-none p-0">
                  {visible.map((message, index) => {
                    const ownCompany = companies.find((row) => row.id === message.company);
                    const ownApplication = applications.find(
                      (row) => row.id === message.application,
                    );
                    return (
                      <li key={message.id}>
                        {(index === 0 || visible[index - 1].group !== message.group) && (
                          <p className="m-0 bg-background/60 px-5 py-2 text-xs text-muted-foreground">
                            {message.group}
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
                            <span className="truncate text-sm font-medium">{message.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {message.time}
                            </span>
                          </span>
                          <span className="mt-1.5 block truncate text-sm font-semibold">
                            {message.subject}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {ownCompany?.name ?? "Unmatched"}
                            {ownApplication
                              ? ` / ${ownApplication.role}`
                              : message.company
                                ? " / Company mail"
                                : " / Company not linked"}
                          </span>
                          <span className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-link">{message.kind}</span>
                            {/spam|junk/i.test(message.sourceFolder) && (
                              <span className="flex items-center gap-1 text-warning">
                                <ShieldCheck size={12} aria-hidden />
                                Found in {message.sourceFolder}
                              </span>
                            )}
                            <span className="ml-auto text-muted-foreground">{message.account}</span>
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
                  {view === "latest" ? "No new matching mail" : "No matching messages"}
                </h3>
                <p className="mb-0 mt-2 text-sm text-muted-foreground">
                  {query
                    ? "Try a different search."
                    : view === "latest" && counts.history
                      ? "Earlier conversations are saved in History."
                      : "Check mail or search your inboxes to find hiring updates."}
                </p>
                {view === "latest" && counts.history > 0 && (
                  <Button variant="outline" className="mt-5" onClick={() => setView("history")}>
                    View history ({counts.history})
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>
              {visible.length} shown / {data.total} matches
            </span>
            <div className="flex gap-3">
              {initial.before && (
                <button className="text-link" onClick={() => navigate({}, true)}>
                  Newest
                </button>
              )}
              {data.nextBefore && (
                <button
                  className="text-link"
                  onClick={() => navigate({ before: data.nextBefore! })}
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
                : detail === "search"
                  ? "Search inboxes"
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
                    <button
                      onClick={() => openCompany(selected.company)}
                      className="hover:text-link"
                    >
                      {selectedCompany?.name ?? "Company not linked"}
                    </button>
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
                      {selected.name
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-sm font-medium">{selected.name}</p>
                      <p className="m-0 truncate text-xs text-muted-foreground">
                        {selected.sender}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{selected.time}</span>
                  </div>
                  <p className="mb-0 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{selected.account}</span>
                    <span className="flex items-center gap-1.5">
                      <Folder size={12} aria-hidden />
                      {selected.sourceFolder}
                    </span>
                    {/spam|junk/i.test(selected.sourceFolder) && (
                      <span className="text-warning">Plain-text preview</span>
                    )}
                  </p>
                  <div className="mt-7 whitespace-pre-line text-sm leading-7">
                    {selected.bodyText}
                  </div>
                  <details className="mt-8 border-t border-border/60 py-4 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      {view === "excluded" ? "Why this was excluded" : "Why this belongs here"}
                    </summary>
                    <p className="mb-0 mt-3">{selected.decision.reason}</p>
                    <p className="mb-0 mt-2">
                      Received {formatDate(selected.receivedAt)}. First tracked{" "}
                      {formatDate(selected.firstTrackedAt)}.
                    </p>
                    {selected.decision.evidence.length > 0 && (
                      <p className="mb-0 mt-2">{selected.decision.evidence.join(". ")}.</p>
                    )}
                  </details>
                  {selectedApplication && (
                    <div className="flex flex-wrap gap-4 border-t border-border py-4 text-xs">
                      <button
                        className="text-link"
                        onClick={() =>
                          navigate({
                            application: selectedApplication.id,
                            company: undefined,
                            view: "history",
                          })
                        }
                      >
                        Application mail history
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
                              {message.time} / {message.sourceFolder}
                            </p>
                            <p className="mb-0 mt-1 text-sm font-medium">{message.subject}</p>
                            <p className="mb-0 mt-2 whitespace-pre-line text-xs leading-6 text-muted-foreground">
                              {message.bodyText}
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
            ) : detail === "search" ? (
              <HistorySearchPanel
                companies={companies}
                accounts={data.connections}
                initialCompany={scope === "all" ? "" : contextCompany}
                initialAccount={initial.account}
                onPending={setSearching}
                onOpenResults={(company, notice) => {
                  setFeedback(notice);
                  navigate({
                    company,
                    application: undefined,
                    view: "history",
                    q: undefined,
                    notice,
                  });
                }}
              />
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
                  <Button variant="ghost" onClick={() => navigate({ view: "excluded" })}>
                    Excluded mail ({counts.excluded})
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
                      <summary className="cursor-pointer text-link">
                        Folders and saved scan progress
                      </summary>
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
                      {data.scans
                        .filter((scan) => scan.account === connection.email)
                        .map((scan) => (
                          <p key={scan.mode} className="text-muted-foreground">
                            {scan.mode === "history" ? "History" : "Latest"}: {scan.scanned}{" "}
                            messages examined, {scan.matched} matches.{" "}
                            {scan.complete
                              ? "Window complete."
                              : "More pages remain; continue the check."}
                          </p>
                        ))}
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
                <details className="mt-6 border-t border-border pt-4 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Recover all available history
                  </summary>
                  <p className="leading-6 text-muted-foreground">
                    Check all dates for the current company or application scope. Saved mail stays
                    in History.
                  </p>
                  <Button
                    variant="outline"
                    disabled={pending || !data.connections.length}
                    onClick={() => runCheck("history")}
                  >
                    <History size={15} aria-hidden />
                    {data.scans.some((scan) => scan.mode === "history" && !scan.complete)
                      ? "Continue history recovery"
                      : "Find older mail"}
                  </Button>
                </details>
                <p className="mt-6 text-xs leading-6 text-muted-foreground">
                  Latest starts {formatDate(data.baselineAt)}. History scans use all available dates
                  in resumable batches. Permanently deleted mail and separate online archive
                  mailboxes cannot be recovered here.
                </p>
              </>
            )}
          </div>
          {detail === "message" && selected && (
            <div className="border-t border-border px-6 py-4 xl:px-8">
              <p className="m-0 text-xs text-muted-foreground">
                {view === "latest"
                  ? "Next step"
                  : view === "history"
                    ? "Already tracked"
                    : "Excluded"}
              </p>
              <p className="mb-4 mt-1 text-sm font-medium">{selected.action}</p>
              <div className="flex flex-wrap items-center gap-2">
                {view === "latest" && (
                  <Button
                    disabled={pending}
                    onClick={reviewMessage}
                    className="shadow-surface active:scale-[0.98] motion-reduce:transform-none"
                  >
                    <Check size={16} aria-hidden />
                    Mark reviewed
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
                {view === "history" && !canLink && (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <History size={14} aria-hidden />
                    Kept out of future new results
                  </span>
                )}
                {view === "excluded" && (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Archive size={14} aria-hidden />
                    No application action created
                  </span>
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
                        .filter(
                          (app) =>
                            !selected.companyKeys.length ||
                            selected.companyKeys.includes(app.company),
                        )
                        .map((app) => (
                          <option key={app.id} value={app.id}>
                            {companies.find((row) => row.id === app.company)?.name} · {app.role}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button disabled={pending || !linkTarget} onClick={associateMessage}>
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
