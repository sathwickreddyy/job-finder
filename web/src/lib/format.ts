import { format, formatDistanceToNow, parseISO } from "date-fns";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return `${formatDistanceToNow(parseISO(iso))} ago`;
  } catch {
    return iso;
  }
}

export function fitScoreTone(score: number): "cyan" | "amber" | "grey" | "red" {
  if (score >= 80) return "cyan";
  if (score >= 70) return "amber";
  if (score >= 60) return "grey";
  return "red";
}
