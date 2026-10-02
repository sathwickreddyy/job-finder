"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Expand, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GitHubPreview,
  PreviewDialog,
  previewTargets,
  ScaledFrame,
  TargetIcon,
  type PreviewTarget,
  type ResumeRef,
} from "./embeds";
import type { LinkKind, ProfileLink } from "./profile-links";

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
          <h3 className="m-0 text-sm font-medium">{target.title}</h3>
          <p className="m-0 truncate text-xs text-muted-foreground">{target.handle}</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Preview ${target.title}`}
          className="morph inline-flex min-h-9 items-center gap-1.5 border-0 bg-selected px-3.5 text-sm font-medium text-selected-foreground after:absolute after:inset-0 after:content-['']"
        >
          <Expand size={14} aria-hidden />
          Preview
        </button>
        <a
          href={target.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${target.title} in a new tab`}
          className="morph relative z-10 grid size-9 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight size={16} aria-hidden />
        </a>
      </div>
    </article>
  );
}

function ResumeThumbnail({ target }: { target: PreviewTarget }) {
  return (
    <iframe
      src={`${target.url}#toolbar=0&navpanes=0&view=FitH`}
      title="Resume thumbnail"
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full border-0"
    />
  );
}

function TileBody({ target }: { target: PreviewTarget }) {
  if (target.kind === "github")
    return (
      <div className="p-4">
        <GitHubPreview target={target} compact />
      </div>
    );
  if (target.kind === "resume" || target.kind === "portfolio")
    return (
      <div className="relative h-44 overflow-hidden">
        {target.kind === "resume" ? (
          <ResumeThumbnail target={target} />
        ) : (
          <ScaledFrame src={target.url} title={`${target.title} thumbnail`} />
        )}
      </div>
    );
  return (
    <div className="flex h-full min-h-28 items-center gap-4 p-5">
      <TargetIcon target={target} className="size-9" />
      <p className="m-0 text-sm text-muted-foreground">
        {target.kind === "linkedin"
          ? "Shows LinkedIn's official profile badge."
          : `${target.title} can't be previewed inside JobOps.`}
      </p>
    </div>
  );
}

function AddTile({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link
      href={href}
      className="pressable flex min-h-28 items-center gap-4 rounded-card border border-dashed border-border p-5 text-foreground hover:border-primary hover:no-underline"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-selected text-selected-foreground">
        <Plus size={18} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

const expected: { kind: LinkKind; label: string }[] = [
  { kind: "linkedin", label: "LinkedIn" },
  { kind: "github", label: "GitHub" },
  { kind: "portfolio", label: "Portfolio" },
];

/** Previews B from /gallery/home: live thumbnails; any tile expands into a preview dialog. */
export function ProfileMosaic({
  links,
  resume,
}: {
  links: ProfileLink[];
  resume: ResumeRef | null;
}) {
  const [open, setOpen] = useState<PreviewTarget | null>(null);
  // Medium cannot be framed; it stays in the identity card's link chips only.
  const targets = previewTargets(
    links.filter((link) => link.kind !== "medium"),
    resume,
  );
  const featured =
    targets.find((target) => target.kind === "portfolio") ??
    targets.find((target) => target.kind === "resume");
  const others = targets.filter((target) => target !== featured);
  const missing = expected.filter(({ kind }) => !links.some((link) => link.kind === kind));
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        {featured && (
          <Tile
            target={featured}
            onOpen={() => setOpen(featured)}
            className="md:col-span-2 md:row-span-2"
          >
            <div className="relative aspect-[16/10] md:aspect-auto md:h-full">
              {featured.kind === "portfolio" ? (
                <ScaledFrame src={featured.url} title="Portfolio thumbnail" />
              ) : (
                <ResumeThumbnail target={featured} />
              )}
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
            <TileBody target={target} />
          </Tile>
        ))}
        {!resume && (
          <AddTile
            title="Upload your resume"
            detail="Your current version will preview here."
            href="/resumes"
          />
        )}
        {missing.map(({ kind, label }) => (
          <AddTile
            key={kind}
            title={`Add your ${label}`}
            detail="It will preview here once added."
            href="/my-profile#add-link"
          />
        ))}
      </div>
      <PreviewDialog target={open} onClose={() => setOpen(null)} />
    </div>
  );
}
