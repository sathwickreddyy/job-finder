import { HTMLAttributes } from "react";
import { cn } from "./utils";

type Tone = "cyan" | "amber" | "grey" | "red" | "green";

const TONES: Record<Tone, string> = {
  cyan: "border-accent/25 bg-accent/15 text-accent",
  amber: "border-accent-amber/25 bg-accent-amber/15 text-accent-amber",
  grey: "border-white/10 bg-white/10 text-text-muted",
  red: "border-danger/25 bg-danger/15 text-danger",
  green: "border-success/25 bg-success/15 text-success",
};

export function Badge({
  tone = "grey",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
