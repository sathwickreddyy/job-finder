import { HTMLAttributes } from "react";
import { cn } from "./utils";

type Tone = "cyan" | "amber" | "grey" | "red" | "green";

const TONES: Record<Tone, string> = {
  cyan: "bg-accent/15 text-accent",
  amber: "bg-accent-amber/15 text-accent-amber",
  grey: "bg-white/10 text-text-muted",
  red: "bg-danger/15 text-danger",
  green: "bg-success/15 text-success",
};

export function Badge({
  tone = "grey",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
