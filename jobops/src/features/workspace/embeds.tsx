"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpRight, FileText, Globe, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  contributionChart,
  favicon,
  githubAvatar,
  linkedInBadgeDocument,
  type LinkKind,
  type ProfileLink,
} from "./profile-links";

export type ResumeRef = {
  id: string;
  familyId: string;
  name: string;
  label: string;
  filename: string;
};
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
      key: link.key,
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
export function RemoteImage({
  fallback = null,
  ...props
}: React.ComponentProps<"img"> & { fallback?: ReactNode }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // An image can fail before hydration attaches onError.
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      ref={image}
      loading="lazy"
      referrerPolicy="no-referrer"
      {...props}
      onError={() => setFailed(true)}
    />
  );
}

export function TargetIcon({ target, className }: { target: PreviewTarget; className?: string }) {
  if (target.kind === "resume")
    return <FileText aria-hidden className={cn("text-primary", className)} />;
  return (
    <RemoteImage
      src={favicon(target.host)}
      alt=""
      className={cn("rounded", className)}
      fallback={<Globe aria-hidden className={cn("text-muted-foreground", className)} />}
    />
  );
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
        className="morph grid size-9 shrink-0 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
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
      className="morph inline-flex min-h-10 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover hover:no-underline"
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

/** LinkedIn's official badge, isolated in an opaque-origin sandbox; see the spec, section 4.2. */
function LinkedInBadgeFrame({ target, theme }: { target: PreviewTarget; theme: "light" | "dark" }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: unknown; ok?: unknown } | null;
      if (data?.type === "linkedin-badge") setStatus(data.ok === true ? "ready" : "failed");
    }
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(
      () => setStatus((current) => (current === "loading" ? "failed" : current)),
      7000,
    );
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, []);
  if (status === "failed")
    return (
      <NoEmbed
        target={target}
        reason="LinkedIn's official badge did not load here, and LinkedIn blocks full-page previews."
      />
    );
  return (
    <iframe
      ref={frame}
      title="LinkedIn profile badge"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={linkedInBadgeDocument(target.handle, theme)}
      className="size-full border-0"
    />
  );
}
function LinkedInBadge({ target }: { target: PreviewTarget }) {
  const theme = useLightTheme() ? "light" : "dark";
  return <LinkedInBadgeFrame key={theme} target={target} theme={theme} />;
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
          fallback={
            <span
              aria-hidden
              className={cn(
                "grid shrink-0 place-items-center rounded-full bg-selected font-semibold text-selected-foreground",
                compact ? "size-12" : "size-16",
              )}
            >
              {target.handle.slice(0, 1).toUpperCase()}
            </span>
          }
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
          fallback={
            <p className="text-sm text-muted-foreground">Contribution graph unavailable.</p>
          }
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
}: {
  target: PreviewTarget | null;
  onClose: () => void;
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
      className="m-auto h-[min(82dvh,860px)] max-h-none w-[min(1100px,calc(100vw-32px))] max-w-none animate-pop overflow-hidden rounded-panel border border-border bg-card p-0 text-foreground backdrop:bg-scrim backdrop:backdrop-blur-sm"
    >
      {target && (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 pt-4">
            <TargetIcon target={target} className="size-5 shrink-0" />
            <h2
              id={titleId}
              className="m-0 min-w-0 flex-1 line-clamp-2 break-words text-base font-semibold"
            >
              {target.title}
              <span className="ml-2 break-all font-normal text-muted-foreground">
                {target.handle}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close preview"
              className="pressable ml-auto grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
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
