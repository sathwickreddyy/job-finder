import { indiaDate, indiaDayBoundary } from "@/features/mail/attention";

const DAY = 86_400_000;
const zone = "Asia/Kolkata";
export { indiaDate };

/** Start of the IST calendar day that contains `value`. */
export function istDayStart(value: Date) {
  return indiaDayBoundary(indiaDate(value))!;
}
/** Whole IST calendar days from `from` to `to`; negative when `to` is earlier. */
export function istDaysBetween(from: Date, to: Date) {
  return Math.round((Date.parse(indiaDate(to)) - Date.parse(indiaDate(from))) / DAY);
}
export function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY);
}
/** "2026-10-07" + "16:00" in IST; undefined when either part is invalid. */
export function istDateTime(day: string, time: string) {
  const start = indiaDayBoundary(day);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!start || !match) return undefined;
  return new Date(start.getTime() + (Number(match[1]) * 60 + Number(match[2])) * 60_000);
}
const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: zone,
});
const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: zone });
const time = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: zone,
});
const weekday = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: zone,
});
/** "11:05", for time inputs. */
export const istClock = (value: Date) => clock.format(value);
export const formatDay = (value: Date) => day.format(value);
export const formatTime = (value: Date) => time.format(value);
export const formatDayTime = (value: Date) => `${day.format(value)}, ${time.format(value)}`;
export const formatWeekday = (value: Date) => weekday.format(value);

/** Relative refresh time with Asia/Kolkata day boundaries. */
export function relativeTime(value: Date, now: Date) {
  const minutes = Math.floor((now.getTime() - value.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (indiaDate(value) === indiaDate(now)) return `today at ${formatTime(value)}`;
  return formatDay(value);
}
