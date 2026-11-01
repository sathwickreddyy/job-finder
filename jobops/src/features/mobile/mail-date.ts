import { formatDay, formatTime, indiaDate } from "@/features/applications/dates";

export function mailTimestamp(receivedAt: string, now = new Date()) {
  const date = new Date(receivedAt);
  const historical = indiaDate(date).slice(0, 4) !== indiaDate(now).slice(0, 4);
  return `${formatDay(date)}${historical ? ` ${indiaDate(date).slice(0, 4)}` : ""}, ${formatTime(date)}`;
}
