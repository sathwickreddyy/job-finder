"use client";

import { useState } from "react";
import { Check, ChevronRight, DoorOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { companies, type SampleCompany } from "./data";
import { Pane, PreviousBadge, StatusPill, statusMeta } from "./shared";

const live = companies.filter((company) => !company.previous);
const previous = companies.filter((company) => company.previous);

function useSelect() {
  const [selected, setSelected] = useState("northstar");
  return { selected, select: setSelected };
}

function Row({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className={cn(
          "w-full rounded-2xl px-3 py-2.5 text-left hover:bg-muted/50",
          selected && "bg-selected/60 hover:bg-selected/60",
        )}
      >
        {children}
      </button>
    </li>
  );
}

export function PillStatus() {
  const { selected, select } = useSelect();
  return (
    <Pane className="max-w-sm">
      <ul className="m-0 list-none space-y-0.5 p-0">
        {companies.map((company) => (
          <Row
            key={company.key}
            selected={selected === company.key}
            onSelect={() => select(company.key)}
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{company.name}</span>
              {company.previous ? (
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-medium">
                  <DoorOpen aria-hidden size={13} />
                  Previous employer
                </span>
              ) : (
                <StatusPill status={company.status} />
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {company.detail}
            </span>
          </Row>
        ))}
      </ul>
    </Pane>
  );
}

const stages = ["Applied", "Interviewing", "Offer", "Joined"];
function Track({ company }: { company: SampleCompany }) {
  const rejected = company.status === "rejected";
  const tone = company.previous
    ? "bg-foreground/70"
    : company.status === "offer"
      ? "bg-success"
      : company.status === "interviewing"
        ? "bg-warning"
        : rejected
          ? "bg-destructive"
          : company.status === "mailOnly"
            ? "bg-transparent"
            : "bg-link";
  return (
    <span
      className="flex items-center gap-1"
      aria-label={`${stages[company.stage]}${rejected ? ", rejected" : ""}`}
    >
      {stages.map((stage, index) => (
        <span
          key={stage}
          title={stage}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            company.status === "mailOnly" ? "bg-muted" : index <= company.stage ? tone : "bg-muted",
          )}
        />
      ))}
      {rejected && <X aria-hidden size={13} className="text-destructive" />}
      {company.previous && <Check aria-hidden size={13} className="text-foreground/70" />}
    </span>
  );
}

export function TrackStatus() {
  const { selected, select } = useSelect();
  return (
    <Pane className="max-w-sm">
      <p className="m-0 mb-2 grid grid-cols-4 gap-1 px-3 text-[11px] text-muted-foreground">
        {stages.map((stage) => (
          <span key={stage}>{stage}</span>
        ))}
      </p>
      <ul className="m-0 list-none space-y-0.5 p-0">
        {companies.map((company) => (
          <Row
            key={company.key}
            selected={selected === company.key}
            onSelect={() => select(company.key)}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{company.name}</span>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  company.previous ? "text-foreground/70" : statusMeta[company.status].text,
                )}
              >
                {company.previous ? "Previous job" : statusMeta[company.status].label}
              </span>
            </span>
            <span className="my-1.5 block">
              <Track company={company} />
            </span>
            <span className="block truncate text-xs text-muted-foreground">{company.detail}</span>
          </Row>
        ))}
      </ul>
    </Pane>
  );
}

export function SentenceStatus() {
  const { selected, select } = useSelect();
  const current = companies.find((company) => company.key === selected)!;
  return (
    <div className="grid gap-3 md:grid-cols-[20rem_1fr]">
      <Pane>
        <ul className="m-0 list-none space-y-0.5 p-0">
          {live.map((company) => (
            <Row
              key={company.key}
              selected={selected === company.key}
              onSelect={() => select(company.key)}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn("size-2 shrink-0 rounded-full", statusMeta[company.status].dot)}
                />
                <span className="truncate font-medium">{company.name}</span>
                <ChevronRight aria-hidden size={14} className="ml-auto text-muted-foreground" />
              </span>
              <span className="mt-0.5 block truncate pl-4 text-xs text-muted-foreground">
                <span className={statusMeta[company.status].text}>
                  {statusMeta[company.status].label}.
                </span>{" "}
                {company.detail}
              </span>
            </Row>
          ))}
        </ul>
        <p className="m-0 mt-4 mb-1 px-3 text-xs font-medium text-muted-foreground">
          Previous employers
        </p>
        <ul className="m-0 list-none p-0">
          {previous.map((company) => (
            <Row
              key={company.key}
              selected={selected === company.key}
              onSelect={() => select(company.key)}
            >
              <span className="flex items-center gap-2">
                <DoorOpen aria-hidden size={14} className="text-muted-foreground" />
                <span className="truncate font-medium">{company.name}</span>
              </span>
              <span className="mt-0.5 block truncate pl-5.5 text-xs text-muted-foreground">
                {company.detail}
              </span>
            </Row>
          ))}
        </ul>
      </Pane>
      <Pane className="space-y-2">
        <p className="m-0 text-xs text-muted-foreground">{current.city}</p>
        <h3 className="m-0 text-2xl font-semibold tracking-tight">{current.name}</h3>
        <div className="flex flex-wrap gap-2">
          <StatusPill status={current.status} />
          {current.previous && <PreviousBadge joined={current.previous.joined} />}
        </div>
        <p className="m-0 text-sm text-muted-foreground">{current.detail}</p>
        <p className="m-0 pt-2 text-xs text-muted-foreground">
          The company page header shows the same status and badge.
        </p>
      </Pane>
    </div>
  );
}
