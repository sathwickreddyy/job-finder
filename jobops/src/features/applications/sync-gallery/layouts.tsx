"use client";

import { cn } from "@/lib/utils";
import { groupLabel, sampleApps, type Group, type SampleApp } from "./data";
import { Journey, LastHeard, Monogram, NextStep, StatusPill, daysBetween, shortDay } from "./parts";

const groups: Group[] = ["needs", "waiting", "closed"];
const byGroup = (group: Group) => sampleApps.filter((app) => app.group === group);

function GroupHeading({ group, className }: { group: Group; className?: string }) {
  return (
    <h3 className={cn("m-0 flex items-baseline gap-2 text-sm font-semibold", className)}>
      {groupLabel[group]}
      <span className="font-normal text-muted-foreground tabular-nums">
        {byGroup(group).length}
      </span>
    </h3>
  );
}

const press =
  "w-full min-w-0 text-left transition-colors hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:outline-none";

/** A: three groups, two-line rows; the next step and its button sit on the right. */
export function NeedsFirst() {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group} className="space-y-2.5">
          <GroupHeading group={group} className="px-1" />
          <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-3xl bg-card p-0 ring-1 ring-border">
            {byGroup(group).map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  className={cn(
                    press,
                    "grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Monogram name={app.company} />
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">{app.company}</span>
                        <StatusPill {...app.status} />
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {app.role}
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 pl-12 md:pl-0">
                    <LastHeard app={app} />
                  </span>
                  <span className="min-w-0 pl-12 md:pl-0">
                    <NextStep app={app} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function appliedCell(app: SampleApp) {
  if (!app.appliedAt)
    return { day: "Not sent", note: app.postedAt ? `Posted ${shortDay(app.postedAt)}` : "" };
  const delay = app.postedAt ? daysBetween(app.postedAt, app.appliedAt) : null;
  return {
    day: shortDay(app.appliedAt),
    note:
      delay === null
        ? "Posting date unknown"
        : `${delay} ${delay === 1 ? "day" : "days"} after posting`,
  };
}

/** B: one outlined ledger with aligned columns and a band per group, like the Mail feed. */
export function Ledger() {
  const columns = "md:grid-cols-[minmax(0,1.5fr)_8.5rem_7.5rem_minmax(0,1fr)_minmax(0,1.25fr)]";
  return (
    <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      <div
        className={cn(
          "hidden gap-4 border-b border-border px-4 py-2.5 text-xs text-muted-foreground md:grid",
          columns,
        )}
      >
        <span>Company and role</span>
        <span>Status</span>
        <span>Applied</span>
        <span>Last heard</span>
        <span>Next step</span>
      </div>
      {groups.map((group, index) => (
        <div key={group}>
          <div className={cn("bg-muted/40 px-4 py-2", index > 0 && "border-t border-border")}>
            <GroupHeading group={group} />
          </div>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {byGroup(group).map((app) => {
              const applied = appliedCell(app);
              return (
                <li key={app.id}>
                  <button
                    type="button"
                    className={cn(press, "grid gap-x-4 gap-y-2 px-4 py-3 md:items-center", columns)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{app.company}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {app.role}
                      </span>
                    </span>
                    <span>
                      <StatusPill {...app.status} />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-sm tabular-nums">{applied.day}</span>
                      <span className="block text-xs text-muted-foreground">{applied.note}</span>
                    </span>
                    <span className="min-w-0">
                      <LastHeard app={app} stacked />
                    </span>
                    <NextStep app={app} compact />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** C: each application shows how far it got, Sent to Offer, with the day of every step. */
export function Journeys() {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group} className="space-y-2.5">
          <GroupHeading group={group} className="px-1" />
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {byGroup(group).map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  className={cn(
                    press,
                    "grid gap-4 rounded-3xl bg-card px-4 py-4 ring-1 ring-border md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] md:items-center",
                    group === "closed" && "bg-transparent",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Monogram name={app.company} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{app.company}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {app.role}
                      </span>
                    </span>
                  </span>
                  <Journey app={app} />
                  <NextStep app={app} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
