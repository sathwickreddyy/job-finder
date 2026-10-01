"use client";

import { useId, useState } from "react";
import { ArrowUpRight, Expand, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AddressBar,
  GitHubPreview,
  PreviewBody,
  PreviewDialog,
  ScaledFrame,
  TargetIcon,
  type PreviewTarget,
} from "./embeds";

/** A. A source list beside one large, interactive browser frame. */
export function PreviewPane({ targets }: { targets: PreviewTarget[] }) {
  const [active, setActive] = useState(targets[0]?.key);
  const id = useId();
  const current = targets.find((target) => target.key === active) ?? targets[0];
  if (!current) return null;
  return (
    <section className="grid overflow-hidden rounded-panel border border-border bg-card md:grid-cols-[240px_1fr]">
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="Profile previews"
        className="flex gap-1 overflow-x-auto border-b border-border p-2 md:flex-col md:border-b-0 md:border-r"
      >
        {targets.map((target) => {
          const selected = target.key === current.key;
          return (
            <button
              key={target.key}
              type="button"
              role="tab"
              id={`${id}-${target.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              onClick={() => setActive(target.key)}
              className={cn(
                "pressable flex min-w-44 shrink-0 items-center gap-3 rounded-2xl border-0 px-3 py-2.5 text-left md:min-w-0",
                selected
                  ? "bg-selected text-selected-foreground"
                  : "bg-transparent text-foreground hover:bg-muted",
              )}
            >
              <TargetIcon target={target} className="size-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{target.title}</span>
                <span
                  className={cn(
                    "block truncate text-xs",
                    selected ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {target.handle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${current.key}`}
        className="flex min-w-0 flex-col"
      >
        <AddressBar target={current} />
        <div key={current.key} className="hg-fade h-[540px]">
          <PreviewBody target={current} />
        </div>
      </div>
    </section>
  );
}

function Tile({
  target,
  onOpen,
  className,
  children,
}: {
  target: PreviewTarget;
  onOpen: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "group relative flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-card transition-[border-color] hover:border-primary",
        className,
      )}
    >
      <div className="relative min-h-0 flex-1">{children}</div>
      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <TargetIcon target={target} className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-medium">{target.title}</p>
          <p className="m-0 truncate text-xs text-muted-foreground">{target.handle}</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-full border-0 bg-selected px-3.5 text-sm font-medium text-selected-foreground after:absolute after:inset-0 after:content-['']"
        >
          <Expand size={14} aria-hidden />
          Preview
        </button>
        <a
          href={target.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${target.title} in a new tab`}
          className="pressable relative z-10 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight size={16} aria-hidden />
        </a>
      </div>
    </article>
  );
}

/** B. A mosaic of live thumbnails; any tile expands into a full preview dialog. */
export function PreviewMosaic({ targets }: { targets: PreviewTarget[] }) {
  const [open, setOpen] = useState<PreviewTarget | null>(null);
  const portfolio = targets.find((target) => target.kind === "portfolio");
  const others = targets.filter((target) => target !== portfolio);
  return (
    <section>
      <div className="grid gap-3 md:grid-cols-3">
        {portfolio && (
          <Tile
            target={portfolio}
            onOpen={() => setOpen(portfolio)}
            className="md:col-span-2 md:row-span-2"
          >
            <div className="relative aspect-[16/10] md:aspect-auto md:h-full">
              <ScaledFrame src={portfolio.url} title="Portfolio thumbnail" />
            </div>
          </Tile>
        )}
        {others.map((target) => (
          <Tile
            key={target.key}
            target={target}
            onOpen={() => setOpen(target)}
            className={cn(target.kind === "linkedin" && "md:col-span-2")}
          >
            {target.kind === "github" ? (
              <div className="p-4">
                <GitHubPreview target={target} compact />
              </div>
            ) : target.kind === "resume" ? (
              <div className="relative h-44 overflow-hidden">
                <iframe
                  src={`${target.url}#toolbar=0&navpanes=0&view=FitH`}
                  title="Resume thumbnail"
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 size-full border-0"
                />
              </div>
            ) : (
              <div className="flex h-full min-h-28 items-center gap-4 p-5">
                <TargetIcon target={target} className="size-9" />
                <p className="m-0 text-sm text-muted-foreground">
                  {target.kind === "linkedin"
                    ? "Shows LinkedIn's official profile badge."
                    : `${target.title} can't be previewed inside JobOps.`}
                </p>
              </div>
            )}
          </Tile>
        ))}
      </div>
      <PreviewDialog target={open} onClose={() => setOpen(null)} placement="center" />
    </section>
  );
}

/** C. Light cards; nothing loads until you choose Preview, which opens a side sheet. */
export function PreviewPeek({ targets }: { targets: PreviewTarget[] }) {
  const [open, setOpen] = useState<PreviewTarget | null>(null);
  return (
    <section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {targets.map((target) => (
          <article
            key={target.key}
            className="flex flex-col rounded-card border border-border bg-card p-5"
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-background">
              <TargetIcon target={target} className="size-6" />
            </span>
            <p className="m-0 mt-4 font-semibold">{target.title}</p>
            <p className="m-0 mt-0.5 truncate text-sm text-muted-foreground">{target.handle}</p>
            <div className="mt-5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOpen(target)}
                className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-full border-0 bg-selected px-3.5 text-sm font-medium text-selected-foreground"
              >
                <Eye size={15} aria-hidden />
                Preview
              </button>
              <a
                href={target.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${target.title} in a new tab`}
                className="pressable ml-auto grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowUpRight size={16} aria-hidden />
              </a>
            </div>
          </article>
        ))}
      </div>
      <PreviewDialog target={open} onClose={() => setOpen(null)} placement="sheet" />
    </section>
  );
}
