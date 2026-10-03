"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOW } from "./data";
import { CompanyMark } from "./marks";
import {
  dayLabel,
  dueStyle,
  MailStrip,
  NextBox,
  NodeDot,
  StatusPill,
  useFlash,
} from "./timeline-marks";
import {
  grouped,
  isUpcoming,
  type CompanyTimeline,
  type NodeTone,
  type StrayMail,
  type TimelineNode,
} from "./timeline-data";

export type TimelineData = { companies: CompanyTimeline[]; mail: StrayMail[]; inboxes: number };
type Act = (label: string) => void;

function Groups({
  companies,
  render,
  grid = false,
}: {
  companies: CompanyTimeline[];
  render: (row: CompanyTimeline) => ReactNode;
  grid?: boolean;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const { needs, active, closed } = grouped(companies);
  const list = (rows: CompanyTimeline[]) => (
    <div className={grid ? "grid gap-4 md:grid-cols-2" : "space-y-3"}>{rows.map(render)}</div>
  );
  return (
    <div className="space-y-8">
      {needs.length > 0 && (
        <section>
          <h3 className="m-0 mb-3 text-sm font-semibold">Needs you · {needs.length}</h3>
          {list(needs)}
        </section>
      )}
      {active.length > 0 && (
        <section>
          <h3 className="m-0 mb-3 text-sm font-semibold text-muted-foreground">
            In progress · {active.length}
          </h3>
          {list(active)}
        </section>
      )}
      {closed.length > 0 && (
        <section>
          <button
            type="button"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((value) => !value)}
            className="pressable mb-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            Closed · {closed.length}
            <ChevronDown
              size={15}
              aria-hidden
              className={cn("transition-transform", showClosed && "rotate-180")}
            />
          </button>
          {showClosed && list(closed)}
        </section>
      )}
    </div>
  );
}

function CompanyTitle({ row, onAct }: { row: CompanyTimeline; onAct: Act }) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => onAct(`Opens ${row.company}'s page`)}
        className="text-left text-base font-semibold text-foreground hover:underline"
      >
        {row.company}
      </button>
      <p className="m-0 truncate text-xs text-muted-foreground">
        {row.role} · {row.city}
      </p>
    </div>
  );
}

/* ---------- A: journey rows ---------- */

function Step({
  node,
  connector,
  onFocus,
  active,
}: {
  node: TimelineNode;
  connector: "solid" | "dashed" | null;
  onFocus: () => void;
  active: boolean;
}) {
  const upcoming = isUpcoming(node);
  return (
    <li className="relative flex w-[6.25rem] shrink-0 flex-col items-center px-1 text-center">
      {connector && (
        <span
          aria-hidden
          className={cn(
            "absolute top-4 left-1/2 w-full",
            connector === "solid" ? "h-0.5 bg-border" : "border-t-2 border-dashed border-border",
          )}
        />
      )}
      <button
        type="button"
        onMouseEnter={onFocus}
        onFocus={onFocus}
        aria-label={`${node.label}, ${dayLabel(node.at)}`}
        className={cn(
          "rounded-full outline-offset-2 transition-transform focus-visible:outline-2 focus-visible:outline-primary",
          active && "scale-110",
        )}
      >
        <NodeDot tone={node.tone} />
      </button>
      <span className="mt-2 line-clamp-2 text-xs leading-snug">{node.label}</span>
      <span
        className={cn(
          "mt-0.5 text-[11px]",
          upcoming ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {dayLabel(node.at)}
      </span>
    </li>
  );
}

function JourneyRow({ row, onAct }: { row: CompanyTimeline; onAct: Act }) {
  const [all, setAll] = useState(false);
  const [active, setActive] = useState<TimelineNode | null>(null);
  const past = row.nodes.filter((node) => !isUpcoming(node));
  const upcoming = row.nodes.filter(isUpcoming);
  const hidden = all ? 0 : Math.max(0, past.length - 3);
  const shown = [...past.slice(hidden), ...upcoming];
  return (
    <article
      className={cn(
        "grid gap-4 rounded-3xl border border-border bg-card p-4 lg:grid-cols-[14rem_minmax(0,1fr)_15rem] lg:items-center",
        row.status.tone === "closed" && "opacity-75",
      )}
    >
      <header className="flex flex-col items-start gap-2.5">
        <div className="flex w-full min-w-0 items-center gap-3">
          <CompanyMark company={row.company} />
          <CompanyTitle row={row} onAct={onAct} />
        </div>
        <StatusPill status={row.status} />
      </header>
      <div className="min-w-0" onMouseLeave={() => setActive(null)}>
        <ol className={cn("m-0 flex list-none p-0", all && "overflow-x-auto pb-1")}>
          {hidden > 0 && (
            <li className="flex w-16 shrink-0 flex-col items-center">
              <button
                type="button"
                onClick={() => setAll(true)}
                className="pressable relative z-10 grid size-8 place-items-center rounded-full border border-border bg-card text-xs font-semibold hover:bg-muted"
                aria-label={`Show ${hidden} earlier steps`}
              >
                +{hidden}
              </button>
              <span className="mt-2 text-[11px] text-muted-foreground">earlier</span>
            </li>
          )}
          {shown.map((node, index) => {
            const nextNode = shown[index + 1];
            const connector = !nextNode ? null : isUpcoming(nextNode) ? "dashed" : "solid";
            return (
              <Step
                key={node.at + node.label}
                node={node}
                connector={connector}
                active={active === node}
                onFocus={() => setActive(node)}
              />
            );
          })}
        </ol>
        <p className="m-0 mt-2 min-h-5 truncate text-xs text-muted-foreground">
          {active
            ? [active.label, dayLabel(active.at), active.detail, active.via]
                .filter(Boolean)
                .join(" · ")
            : row.how}
        </p>
      </div>
      {row.next ? (
        <NextBox compact next={row.next} onAct={(label) => onAct(`${label} · ${row.company}`)} />
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Nothing left to do here.</p>
      )}
    </article>
  );
}

export function JourneyRows({ data }: { data: TimelineData }) {
  const { flash, node } = useFlash();
  return (
    <div className="space-y-6">
      <MailStrip mail={data.mail} inboxes={data.inboxes} onAct={flash} />
      <Groups
        companies={data.companies}
        render={(row) => <JourneyRow key={row.id} row={row} onAct={flash} />}
      />
      {node}
    </div>
  );
}

/* ---------- B: calendar lanes ---------- */

const DAY = 86_400_000;
const istMidnight = (time: number) => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(time);
  return Date.parse(`${day}T00:00:00+05:30`);
};
const importance: Record<NodeTone, number> = {
  pending: 6,
  upcoming: 5,
  bad: 4,
  good: 3,
  mail: 2,
  sent: 1,
  note: 0,
};

function clusters(nodes: TimelineNode[], pct: (iso: string) => number) {
  const out: { at: number; nodes: TimelineNode[] }[] = [];
  for (const node of nodes) {
    const at = pct(node.at);
    const last = out.at(-1);
    if (last && at - last.at < 4.5) last.nodes.push(node);
    else out.push({ at, nodes: [node] });
  }
  return out.map((cluster) => ({
    ...cluster,
    lead: cluster.nodes.reduce((best, node) =>
      importance[node.tone] > importance[best.tone] ? node : best,
    ),
  }));
}

function VerticalTimeline({ nodes, limit }: { nodes: TimelineNode[]; limit?: number }) {
  const [all, setAll] = useState(false);
  const ordered = [...nodes].reverse();
  const shown = all || !limit ? ordered : ordered.slice(0, limit);
  return (
    <div>
      <ol className="relative m-0 list-none space-y-3 p-0">
        <span
          aria-hidden
          className="absolute top-3 bottom-3 left-3 w-0.5 -translate-x-1/2 bg-border"
        />
        {shown.map((node, index) => {
          const upcoming = isUpcoming(node);
          const todayLine = upcoming && shown[index + 1] && !isUpcoming(shown[index + 1]);
          return (
            <li key={node.at + node.label} className="relative">
              <div className="flex gap-3">
                <NodeDot tone={node.tone} size="sm" />
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={cn("m-0 text-sm", upcoming && "font-medium")}>
                      {node.label}
                      {node.via && (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          {node.via}
                        </span>
                      )}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        upcoming ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {dayLabel(node.at)}
                    </span>
                  </div>
                  {node.detail && (
                    <p className="m-0 text-xs text-muted-foreground">{node.detail}</p>
                  )}
                </div>
              </div>
              {todayLine && (
                <div className="mt-3 flex items-center gap-2 pl-9 text-[11px] font-semibold text-muted-foreground">
                  Today
                  <span aria-hidden className="h-0.5 flex-1 rounded-full bg-review" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {limit && ordered.length > limit && (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          className="pressable mt-2 ml-7 rounded-full px-2 py-0.5 text-xs font-medium text-link hover:bg-muted"
        >
          {all ? "Show less" : `Show all ${ordered.length} steps`}
        </button>
      )}
    </div>
  );
}

export function CalendarLanes({ data }: { data: TimelineData }) {
  const { flash, node } = useFlash();
  const [open, setOpen] = useState<string | null>(null);
  const [readout, setReadout] = useState<{ company: string; nodes: TimelineNode[] } | null>(null);
  const { needs, active, closed } = grouped(data.companies);
  const rows = [...needs, ...active, ...closed];
  const times = rows.flatMap((row) => row.nodes.map((entry) => Date.parse(entry.at)));
  const start = istMidnight(Math.min(NOW.getTime(), ...times)) - 2 * DAY;
  const end = istMidnight(NOW.getTime()) + 8 * DAY;
  const pct = (iso: string | number) =>
    (((typeof iso === "number" ? iso : Date.parse(iso)) - start) / (end - start)) * 100;
  const ticks: number[] = [];
  const span = (end - start) / DAY;
  const step = span > 21 ? 7 : span > 10 ? 3 : 1;
  for (let day = start + DAY; day < end; day += step * DAY) ticks.push(day);
  const tickLabel = (time: number) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(time);
  const today = pct(NOW.getTime());
  const columns = "grid grid-cols-[13rem_minmax(0,1fr)_10.5rem]";
  return (
    <div className="flex flex-col gap-5">
      <MailStrip mail={data.mail} inboxes={data.inboxes} onAct={flash} />
      <p className="m-0 min-h-6 text-sm">
        {readout ? (
          <>
            <strong>{readout.company}</strong>
            {readout.nodes.map((entry) => (
              <span key={entry.at + entry.label} className="text-muted-foreground">
                {" · "}
                <span className="text-foreground">{entry.label}</span>, {dayLabel(entry.at)}
                {entry.detail ? ` (${entry.detail})` : ""}
              </span>
            ))}
          </>
        ) : (
          <span className="text-muted-foreground">
            Hover a dot to read it. Select a company to open its whole timeline.
          </span>
        )}
      </p>
      <div className="overflow-x-auto rounded-3xl border border-border bg-card">
        <div className="min-w-[50rem]" onMouseLeave={() => setReadout(null)}>
          <div className={cn(columns, "border-b border-border")}>
            <span className="p-3 text-xs font-medium text-muted-foreground">Company</span>
            <div className="relative h-11">
              {ticks
                .filter((tick) => Math.abs(pct(tick) - today) > 5)
                .map((tick) => (
                  <span
                    key={tick}
                    className="absolute top-3.5 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground"
                    style={{ left: `${pct(tick)}%` }}
                  >
                    {tickLabel(tick)}
                  </span>
                ))}
              <span
                className="absolute bottom-0 -translate-x-1/2 rounded-t-md bg-review px-2 text-[11px] font-semibold text-review-foreground"
                style={{ left: `${today}%` }}
              >
                Today
              </span>
            </div>
            <span className="p-3 text-xs font-medium text-muted-foreground">Next</span>
          </div>
          {rows.map((row) => {
            const past = row.nodes.filter((entry) => !isUpcoming(entry));
            const upcoming = row.nodes.filter(isUpcoming);
            const first = row.nodes[0];
            const lastPast = past.at(-1);
            const isOpen = open === row.id;
            return (
              <div key={row.id} className="border-b border-border last:border-0">
                <div className={cn(columns, "items-center", isOpen && "bg-muted/60")}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : row.id)}
                    className="flex min-w-0 flex-col items-start gap-1.5 p-3 text-left hover:bg-muted/60"
                  >
                    <span className="flex w-full min-w-0 items-center gap-2.5">
                      <CompanyMark company={row.company} size="sm" />
                      <span className="truncate text-sm font-semibold">{row.company}</span>
                    </span>
                    <StatusPill status={row.status} />
                  </button>
                  <div
                    className={cn("relative h-16", row.status.tone === "closed" && "opacity-60")}
                  >
                    {ticks.map((tick) => (
                      <span
                        key={tick}
                        aria-hidden
                        className="absolute inset-y-0 w-px bg-border/60"
                        style={{ left: `${pct(tick)}%` }}
                      />
                    ))}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-review"
                      style={{ left: `${today}%` }}
                    />
                    {first && lastPast && (
                      <span
                        aria-hidden
                        className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted-foreground/50"
                        style={{
                          left: `${pct(first.at)}%`,
                          width: `${pct(row.status.tone === "closed" ? lastPast.at : NOW.getTime()) - pct(first.at)}%`,
                        }}
                      />
                    )}
                    {upcoming.length > 0 && (
                      <span
                        aria-hidden
                        className="absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed border-muted-foreground/50"
                        style={{
                          left: `${today}%`,
                          width: `${pct(upcoming.at(-1)!.at) - today}%`,
                        }}
                      />
                    )}
                    {clusters(row.nodes, pct).map((cluster) => (
                      <button
                        key={cluster.at}
                        type="button"
                        onMouseEnter={() =>
                          setReadout({ company: row.company, nodes: cluster.nodes })
                        }
                        onFocus={() => setReadout({ company: row.company, nodes: cluster.nodes })}
                        onClick={() => setOpen(row.id)}
                        aria-label={cluster.nodes
                          .map((entry) => `${entry.label}, ${dayLabel(entry.at)}`)
                          .join("; ")}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                        style={{ left: `${cluster.at}%` }}
                      >
                        <NodeDot tone={cluster.lead.tone} size="sm" />
                        {cluster.nodes.length > 1 && (
                          <span className="absolute -top-2 -right-2 z-20 grid size-4 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                            {cluster.nodes.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-3">
                    {row.next ? (
                      <>
                        <span
                          className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold",
                            dueStyle[row.next.due].text,
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn("size-2 rounded-full", dueStyle[row.next.due].dot)}
                          />
                          {row.next.when}
                        </span>
                        <button
                          type="button"
                          onClick={() => flash(`${row.next!.action} · ${row.company}`)}
                          className="mt-0.5 text-left text-xs font-medium text-link hover:underline"
                        >
                          {row.next.action}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Done</span>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="ag-fade grid gap-5 px-4 pt-1 pb-5 md:grid-cols-[minmax(0,1fr)_17rem]">
                    <div className="flex flex-col gap-3">
                      <p className="m-0 text-xs text-muted-foreground">
                        {row.role} · {row.city} · {row.how}
                      </p>
                      <VerticalTimeline nodes={row.nodes} />
                    </div>
                    {row.next && (
                      <NextBox
                        next={row.next}
                        onAct={(label) => flash(`${label} · ${row.company}`)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {node}
    </div>
  );
}

/* ---------- C: story cards ---------- */

function StoryCard({ row, onAct }: { row: CompanyTimeline; onAct: Act }) {
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-border bg-card p-5",
        row.status.tone === "closed" && "opacity-75",
      )}
    >
      <header className="flex flex-wrap items-start gap-3">
        <CompanyMark company={row.company} />
        <div className="min-w-0 flex-1">
          <CompanyTitle row={row} onAct={onAct} />
        </div>
        <StatusPill status={row.status} />
      </header>
      {row.next && (
        <NextBox compact next={row.next} onAct={(label) => onAct(`${label} · ${row.company}`)} />
      )}
      <VerticalTimeline nodes={row.nodes} limit={3} />
      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate">{row.how}</span>
        <button
          type="button"
          onClick={() => onAct(`Opens ${row.company}'s page`)}
          className="shrink-0 font-medium text-link hover:underline"
        >
          Open
        </button>
      </footer>
    </article>
  );
}

export function StoryCards({ data }: { data: TimelineData }) {
  const { flash, node } = useFlash();
  return (
    <div className="space-y-6">
      <MailStrip mail={data.mail} inboxes={data.inboxes} onAct={flash} />
      <Groups
        grid
        companies={data.companies}
        render={(row) => <StoryCard key={row.id} row={row} onAct={flash} />}
      />
      {node}
    </div>
  );
}
