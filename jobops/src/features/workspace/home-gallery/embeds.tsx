"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpRight, FileText, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  contributionChart,
  favicon,
  githubAvatar,
  type LinkKind,
  type ProfileLink,
  type ResumeRef,
} from "./data";

export type PreviewTarget = {
  key: string;
  kind: LinkKind | "resume";
  title: string;
  handle: string;
  url: string;
  host: string;
};
export function previewTargets(links: ProfileLink[], resume: ResumeRef | null): PreviewTarget[] {
  const order: LinkKind[] = ["portfolio", "github", "linkedin", "medium", "other"];
  const targets: PreviewTarget[] = [...links]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((link) => ({
      key: link.url,
      kind: link.kind,
      title: link.name,
      handle: link.handle,
      url: link.url,
      host: link.host,
    }));
  if (resume)
    targets.splice(1, 0, {
      key: resume.id,
      kind: "resume",
      title: "Resume",
      handle: resume.label,
      url: `/api/resumes/${resume.id}/file`,
      host: resume.filename,
    });
  return targets;
}

/** Remote favicons, avatars and charts; next/image would proxy them through the server. */
export function RemoteImage(props: React.ComponentProps<"img">) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img loading="lazy" referrerPolicy="no-referrer" {...props} />;
}
export function TargetIcon({ target, className }: { target: PreviewTarget; className?: string }) {
  if (target.kind === "resume")
    return <FileText aria-hidden className={cn("text-primary", className)} />;
  return <RemoteImage src={favicon(target.host)} alt="" className={cn("rounded", className)} />;
}

function subscribeTheme(callback: () => void) {
  window.addEventListener("jobops-theme", callback);
  return () => window.removeEventListener("jobops-theme", callback);
}
function useLightTheme() {
  return useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme === "light",
    () => false,
  );
}

/** A live page rendered at desktop width and scaled down, so it reads like a screenshot. */
export function ScaledFrame({
  src,
  title,
  width = 1280,
}: {
  src: string;
  title: string;
  width?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <iframe
        src={src}
        title={title}
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-background"
        style={{ width, height: `${100 / scale}%`, transform: `scale(${scale})` }}
      />
    </div>
  );
}

export function AddressBar({ target, children }: { target: PreviewTarget; children?: ReactNode }) {
  const external = target.kind !== "resume";
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-background px-3.5 py-1.5 text-sm text-muted-foreground">
        {external ? <Lock size={13} aria-hidden /> : <FileText size={13} aria-hidden />}
        <span className="truncate">
          {external
            ? target.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
            : target.host}
        </span>
      </div>
      {children}
      <a
        href={target.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${target.title} in a new tab`}
        className="pressable grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowUpRight size={17} aria-hidden />
      </a>
    </div>
  );
}

function OpenLink({ target, label }: { target: PreviewTarget; label: string }) {
  return (
    <a
      href={target.url}
      target="_blank"
      rel="noreferrer"
      className="pressable inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover hover:no-underline"
    >
      {label}
      <ArrowUpRight size={16} aria-hidden />
    </a>
  );
}

function NoEmbed({ target, reason }: { target: PreviewTarget; reason: string }) {
  return (
    <div className="grid size-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <TargetIcon target={target} className="mx-auto size-10" />
        <p className="mt-4 text-lg font-semibold">{target.handle}</p>
        <p className="mt-2 text-sm text-muted-foreground">{reason}</p>
        <div className="mt-5">
          <OpenLink target={target} label={`Open ${target.title}`} />
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    LIRenderAll?: () => void;
  }
}
const BADGE_SCRIPT = "https://platform.linkedin.com/badges/js/profile.js";
function LinkedInBadge({ target }: { target: PreviewTarget }) {
  const light = useLightTheme();
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const existing = document.querySelector(`script[src="${BADGE_SCRIPT}"]`);
    if (existing) window.LIRenderAll?.();
    else {
      const script = document.createElement("script");
      script.src = BADGE_SCRIPT;
      script.async = true;
      script.onerror = () => setFailed(true);
      document.body.appendChild(script);
    }
    const timer = window.setTimeout(() => {
      if (!box.current?.querySelector("iframe")) setFailed(true);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [light]);
  if (failed)
    return (
      <NoEmbed
        target={target}
        reason="LinkedIn's official badge did not load here, and LinkedIn blocks full-page previews."
      />
    );
  return (
    <div ref={box} className="grid size-full place-items-center overflow-auto p-6">
      <div
        key={String(light)}
        className="badge-base LI-profile-badge"
        data-locale="en_US"
        data-size="large"
        data-theme={light ? "light" : "dark"}
        data-type="HORIZONTAL"
        data-vanity={target.handle}
        data-version="v1"
      >
        <a className="badge-base__link LI-simple-link" href={target.url}>
          {target.handle}
        </a>
      </div>
    </div>
  );
}

export function GitHubPreview({
  target,
  compact = false,
}: {
  target: PreviewTarget;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex size-full flex-col",
        compact ? "gap-4" : "gap-6 overflow-auto p-6 sm:p-8",
      )}
    >
      <div className="flex items-center gap-4">
        <RemoteImage
          src={githubAvatar(target.handle)}
          alt=""
          className={cn("rounded-full border border-border", compact ? "size-12" : "size-16")}
        />
        <div className="min-w-0">
          <p className={cn("truncate font-semibold", compact ? "text-base" : "text-xl")}>
            {target.handle}
          </p>
          <p className="text-sm text-muted-foreground">github.com/{target.handle}</p>
        </div>
      </div>
      <figure className="min-w-0">
        <RemoteImage
          src={contributionChart(target.handle)}
          alt={`GitHub contributions for ${target.handle} over the last year`}
          className="w-full [:root:not([data-theme=light])_&]:hue-rotate-180 [:root:not([data-theme=light])_&]:invert"
        />
        <figcaption className="mt-2 text-xs text-muted-foreground">
          Public contributions, last 12 months
        </figcaption>
      </figure>
      {!compact && (
        <div>
          <OpenLink target={target} label="Open GitHub" />
        </div>
      )}
    </div>
  );
}

/** Full-size, interactive preview for one target. */
export function PreviewBody({ target }: { target: PreviewTarget }) {
  if (target.kind === "portfolio")
    return (
      <iframe
        src={target.url}
        title={`${target.title} preview`}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="size-full border-0 bg-background"
      />
    );
  if (target.kind === "resume")
    return (
      <iframe
        src={`${target.url}#view=FitH`}
        title={`${target.title} preview`}
        className="size-full border-0 bg-background"
      />
    );
  if (target.kind === "github") return <GitHubPreview target={target} />;
  if (target.kind === "linkedin") return <LinkedInBadge target={target} />;
  return (
    <NoEmbed
      target={target}
      reason={`${target.title} blocks previews inside other sites. Open it to see your latest posts.`}
    />
  );
}

export function PreviewDialog({
  target,
  onClose,
  placement,
}: {
  target: PreviewTarget | null;
  onClose: () => void;
  placement: "center" | "sheet";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (target && element && !element.open) element.showModal();
    if (!target && element?.open) element.close();
  }, [target]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
      className={cn(
        "max-h-none max-w-none overflow-hidden border border-border bg-card p-0 text-foreground backdrop:bg-scrim backdrop:backdrop-blur-sm",
        placement === "center"
          ? "hg-pop m-auto h-[min(82dvh,860px)] w-[min(1100px,calc(100vw-32px))] rounded-panel"
          : "hg-sheet my-0 ml-auto mr-0 h-dvh w-[min(760px,100vw)] rounded-l-panel",
      )}
    >
      {target && (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 pt-4">
            <TargetIcon target={target} className="size-5" />
            <h2 id={titleId} className="m-0 text-base font-semibold">
              {target.title}
              <span className="ml-2 font-normal text-muted-foreground">{target.handle}</span>
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close preview"
              className="pressable ml-auto grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <AddressBar target={target} />
          <div className="min-h-0 flex-1">
            <PreviewBody target={target} />
          </div>
        </div>
      )}
    </dialog>
  );
}
