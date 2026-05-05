import { fitScoreTone } from "../../lib/format";

const COLOR = {
  cyan: "text-accent",
  amber: "text-accent-amber",
  grey: "text-text-muted",
  red: "text-danger",
} as const;

export function FitScoreCell({ score }: { score: number }) {
  return (
    <span className={`inline-flex min-w-12 items-center justify-center rounded-full bg-black/20 px-2.5 py-1 font-bold tabular-nums ${COLOR[fitScoreTone(score)]}`}>
      {score}
    </span>
  );
}
