import { NOW } from "./data";

const zone = "Asia/Kolkata";
const dayKey = (at: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(at));
const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const fullMonths =
  "January February March April May June July August September October November December".split(
    " ",
  );
const weekdays = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const time = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: zone,
});

export const thisYear = Number(dayKey(NOW).slice(0, 4));
const daysAgo = (at: string) =>
  Math.round((Date.parse(dayKey(NOW)) - Date.parse(dayKey(at))) / 86_400_000);

/** India-date parts, spelled by hand so every browser shows "Sep", never "Sept". */
export function dateParts(at: string) {
  const [year, month, day] = dayKey(at).split("-").map(Number);
  return {
    key: dayKey(at),
    year,
    day,
    month: months[month - 1],
    monthName: fullMonths[month - 1],
    weekday: weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
    ago: daysAgo(at),
  };
}

export const clock = (at: string) => time.format(new Date(at));

/** "Today", "Yesterday", "Thu 29 Oct", and "Thu 21 Aug 2025" outside this year. */
export function dayLabel(at: string) {
  const parts = dateParts(at);
  if (parts.ago === 0) return "Today";
  if (parts.ago === 1) return "Yesterday";
  return `${parts.weekday} ${parts.day} ${parts.month}${parts.year === thisYear ? "" : ` ${parts.year}`}`;
}

const invisible = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯﻿]/g;
const greeting =
  /^(hi|hello|hey|dear|greetings|good (morning|afternoon|evening))\b[^.!?]{0,40}[,!:]?$/i;

/** The first line that says something: no greetings, no invisible preheader padding. */
export function previewLine(text: string) {
  return (
    text
      .split("\n")
      .map((line) => line.replace(invisible, "").replace(/\s+/g, " ").trim())
      .find((line) => line && !greeting.test(line)) ?? ""
  );
}

export function groupBy<T extends { at: string }>(items: T[], keyOf: (at: string) => string) {
  const groups: { key: string; first: string; items: T[] }[] = [];
  for (const item of [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const key = keyOf(item.at);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, first: item.at, items: [item] });
  }
  return groups;
}
