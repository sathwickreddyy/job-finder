import { cn } from "@/lib/utils";

/** Long file names keep their distinguishing end ("…jb0076231_2026-11-03.pdf") visible. */
export function MiddleTruncate({ text, tail = 22, className }: { text: string; tail?: number; className?: string }) {
  const cut = Math.max(0, text.length - tail);
  return (
    <span className={cn("flex min-w-0", className)} title={text}>
      <span className="truncate">{text.slice(0, cut)}</span>
      <span className="shrink-0 whitespace-nowrap">{text.slice(cut)}</span>
    </span>
  );
}
