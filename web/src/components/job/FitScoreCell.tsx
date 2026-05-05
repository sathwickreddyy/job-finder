import { fitScoreTone } from "../../lib/format";

const COLOR = {
  cyan: "text-accent",
  amber: "text-accent-amber",
  grey: "text-text-muted",
  red: "text-danger",
} as const;

export function FitScoreCell({ score }: { score: number }) {
  return (
    <span className={`font-semibold tabular-nums ${COLOR[fitScoreTone(score)]}`}>
      {score}
    </span>
  );
}
