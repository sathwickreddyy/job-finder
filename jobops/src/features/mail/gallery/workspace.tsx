"use client";

import { useState } from "react";
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
  Mail,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { evaluateCompanyMail } from "../company-rules";
import { accountNames, applications, baseline, companies, exampleMail, exampleRules } from "./data";

type Scope = "all" | "company" | "application";
type View = "latest" | "history" | "excluded";
type Detail = "message" | "rules" | "folders";

export function MailWorkspaceGallery() {
  const [scope, setScope] = useState<Scope>("all");
  const [companyId, setCompanyId] = useState("northstar");
  const [applicationId, setApplicationId] = useState("northstar-sde");
  const [view, setView] = useState<View>("latest");
  const [selectedId, setSelectedId] = useState("interview");
  const [rules, setRules] = useState(exampleRules);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [account, setAccount] = useState("All accounts");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [detail, setDetail] = useState<Detail>("message");
  const [mobileReader, setMobileReader] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const currentApplication = applications.find((row) => row.id === applicationId)!;
  const contextCompany = scope === "application" ? currentApplication.company : companyId;
  const company = companies.find((row) => row.id === contextCompany)!;
  const all = exampleMail.map((message) => ({
    ...message,
    decision: evaluateCompanyMail(
      { ...message, seen: message.seen || reviewed.includes(message.id) },
      rules[message.company],
      baseline,
    ),
  }));
  const inScope = all.filter(
    (message) =>
      (scope === "all" ||
        (scope === "company"
          ? message.company === companyId
          : message.application === applicationId)) &&
      (account === "All accounts" || message.account === account),
  );
  const counts = { latest: 0, history: 0, excluded: 0 };
  inScope.forEach((message) => counts[message.decision.destination]++);
  const visible = inScope.filter(
    (message) =>
      message.decision.destination === view &&
      `${message.subject} ${message.name} ${companies.find((row) => row.id === message.company)?.name} ${message.bodyText}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected = visible.find((message) => message.id === selectedId) ?? visible[0];
  const selectedCompany = companies.find((row) => row.id === selected?.company);
  const selectedApplication = applications.find((row) => row.id === selected?.application);
  const ruleId = scope === "all" ? (selected?.company ?? companyId) : contextCompany;
  const ruleCompany = companies.find((row) => row.id === ruleId)!;
  const rule = rules[ruleId];
  const thread = selected
    ? all.filter(
        (message) =>
          message.id !== selected.id &&
          message.application &&
          message.application === selected.application &&
          message.decision.destination === "history",
      )
    : [];
  const title =
    scope === "all" ? "All mail" : scope === "company" ? company.name : currentApplication.role;
  const subtitle =
    scope === "all"
      ? "Every company. Every application. All three accounts."
      : scope === "company"
        ? "All applications and outreach"
        : `${company.name} / Application mail`;
  function changeScope(next: Scope) {
    setScope(next);
    setDetail("message");
    setMobileReader(false);
    setFeedback("");
  }
  function openCompany(id: string) {
    setCompanyId(id);
    changeScope("company");
  }
  function openApplication(id: string) {
    setApplicationId(id);
    changeScope("application");
  }
  function changeRule(
    key: "aliases" | "domains" | "senders" | "keywords" | "excludedTerms",
    text: string,
  ) {
    setRules((previous) => ({
      ...previous,
      [ruleId]: { ...previous[ruleId], [key]: text.split(",") },
    }));
  }
  function openDetail(next: Detail) {
    setDetail(next);
    setMobileReader(true);
  }
  function reset() {
    setReviewed([]);
    setRules(exampleRules);
    setView("latest");
    setQuery("");
    setAccount("All accounts");
    setScope("all");
    setDetail("message");
    setMobileReader(false);
    setFeedback("");
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Mail</h1>
          <span className="border-l border-border pl-3 text-xs text-muted-foreground">
            Design preview · example messages
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={reset}
            className="hidden text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:block"
          >
            Reset preview
          </button>
          <Button
            onClick={() =>
              setFeedback(
                `Demo check complete. No new matches${scope === "all" ? " across your accounts" : ` for ${company.name}`}.`,
              )
            }
          >
            <RefreshCw size={16} aria-hidden />
            Check mail
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
          {companies.map((row) => (
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
              <span className="text-xs tabular-nums">
                {
                  all.filter(
                    (message) =>
                      message.company === row.id && message.decision.destination === "latest",
                  ).length
                }
              </span>
            </button>
          ))}
          <div className="mt-auto space-y-3 px-3 pt-8">
            <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
              <Mail size={14} aria-hidden />3 connected accounts
            </p>
            <button
              onClick={() => openDetail("folders")}
              className="flex items-center gap-2 text-xs text-link"
            >
              <Folder size={14} aria-hidden />
              Folders & coverage
            </button>
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
                  <option value="application">Applications</option>
                </select>
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Folders and coverage"
                onClick={() => openDetail("folders")}
              >
                <Folder size={17} aria-hidden />
              </Button>
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
              <span className="sr-only">Search mail</span>
              <input
                aria-label="Search mail"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search mail"
                className="!border-transparent !bg-background !pl-10"
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-1 border-b border-border px-3">
            <nav aria-label="Mail status" className="flex min-w-0 gap-1">
              {(
                [
                  ["latest", "Latest"],
                  ["history", "History"],
                  ["excluded", "Excluded"],
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
                    "flex items-center gap-1.5 border-b-2 px-2 py-3 text-xs font-medium",
                    view === id
                      ? "border-primary text-link"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  <span className="tabular-nums opacity-70">{counts[id]}</span>
                </button>
              ))}
            </nav>
            <label className="min-w-0">
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
                      : "Today, 30 October"}
                </p>
                <ul className="m-0 list-none p-0">
                  {visible.map((message) => {
                    const ownCompany = companies.find((row) => row.id === message.company)!;
                    const ownApplication = applications.find(
                      (row) => row.id === message.application,
                    );
                    return (
                      <li key={message.id}>
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
                            {ownCompany.name}
                            {ownApplication ? ` / ${ownApplication.role}` : " / Your outreach"}
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
                    : "Change the company, application or account to see more."}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>
              {visible.length} {visible.length === 1 ? "message" : "messages"}
            </span>
            <button
              className="flex items-center gap-1.5 text-link"
              onClick={() => {
                setView("history");
                setFeedback(
                  "Demo history scan complete. Earlier matches stay in History; Latest is unchanged.",
                );
              }}
            >
              <History size={13} aria-hidden />
              Find older mail
            </button>
          </div>
        </section>

        <section
          aria-label={
            detail === "message"
              ? "Conversation"
              : detail === "rules"
                ? "Company mail rules"
                : "Folder coverage"
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
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Company mail pattern"
                onClick={() => openDetail("rules")}
              >
                <Settings2 size={16} aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Folder coverage"
                onClick={() => openDetail("folders")}
              >
                <Folder size={16} aria-hidden />
              </Button>
            </div>
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
                      {selectedCompany?.name}
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
                      <span>Your outreach</span>
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
                    {selected.decision.evidence.length > 0 && (
                      <p className="mb-0 mt-2">{selected.decision.evidence.join(". ")}.</p>
                    )}
                  </details>
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
            ) : detail === "rules" ? (
              <>
                <h3 className="m-0 text-lg font-semibold">{ruleCompany.name} mail pattern</h3>
                <p className="mb-6 mt-2 text-xs text-muted-foreground">
                  Example rules. Changes apply only to this preview.
                </p>
                {(
                  [
                    ["aliases", "Company names", "Alternate names"],
                    ["domains", "Sender domains", "company.example"],
                    ["senders", "Exact email addresses", "recruiter@company.example"],
                    ["keywords", "Keywords", "Subject or sender name"],
                    ["excludedTerms", "Exclude phrases", "Optional phrases"],
                  ] as const
                ).map(([key, label, placeholder]) => (
                  <label key={key} className="mb-4 block text-xs font-medium">
                    {label}
                    <input
                      className="mt-1.5"
                      value={rule[key].join(", ")}
                      onChange={(event) => changeRule(key, event.target.value)}
                      placeholder={placeholder}
                    />
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">Separate entries with commas.</p>
                <div className="mt-7 border-t border-border pt-5">
                  <h4 className="m-0 text-sm font-medium">People you contacted</h4>
                  <p className="mb-0 mt-2 text-xs leading-6 text-muted-foreground">
                    {ruleId === "northstar"
                      ? "Priya Sharma — recorded outbound outreach. Only her verified replies enter Latest."
                      : "No outbound contacts in this example."}
                  </p>
                </div>
              </>
            ) : (
              <>
                <h3 className="m-0 text-lg font-semibold">Folders & coverage</h3>
                <p className="mb-6 mt-2 text-xs text-muted-foreground">
                  Example coverage. Real folder discovery is pending.
                </p>
                {accountNames.map((name) => (
                  <div key={name} className="border-t border-border py-4">
                    <h4 className="m-0 text-sm font-medium">{name}</h4>
                    <p className="mb-0 mt-2 text-xs leading-6 text-muted-foreground">
                      Inbox, custom folders, archive, spam / junk and trash.
                    </p>
                  </div>
                ))}
                <p className="mt-6 text-xs leading-6 text-muted-foreground">
                  Sent mail is context only. Earlier matches go to History and never return to
                  Latest. Mail already permanently removed by your provider cannot be recovered.
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
              {view === "latest" && (
                <Button
                  onClick={() => {
                    setReviewed((previous) => [...previous, selected.id]);
                    setFeedback("Reviewed and kept in History. It won’t appear as new again.");
                    setMobileReader(false);
                  }}
                >
                  <Check size={16} aria-hidden />
                  Mark reviewed
                </Button>
              )}
              {view === "history" && (
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
          )}
        </section>
      </div>
    </div>
  );
}
