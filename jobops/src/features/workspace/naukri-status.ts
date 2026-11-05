export const NAUKRI_WINDOW_DAYS = 14;

export type NaukriTone = "fresh" | "due" | "late" | "none";
export type NaukriDay = { iso: string; weekday: string; label: string; updated: boolean };
export type NaukriStatus = {
  todayIso: string;
  lastDate: string | null;
  daysSince: number | null;
  tone: NaukriTone;
  chip: string;
  doneInWindow: number;
  /** Oldest first; the last entry is today. */
  days: NaukriDay[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_MS = 86_400_000;

const toMs = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

/** The calendar date in India, which is how the Naukri refresh day is counted. */
export function indiaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(toMs(value)).toISOString().slice(0, 10) === value;
}

/** Turns the verified update dates into the chip text, tone and fourteen-day strip. */
export function naukriStatus(updatedDates: string[], todayIso: string): NaukriStatus {
  const updated = new Set(updatedDates);
  const lastDate = [...updated].filter((date) => date <= todayIso).sort().at(-1) ?? null;
  const daysSince = lastDate === null ? null : Math.round((toMs(todayIso) - toMs(lastDate)) / DAY_MS);
  const tone: NaukriTone =
    daysSince === 0 ? "fresh" : daysSince === 1 ? "due" : daysSince === null ? "none" : "late";
  const chip =
    daysSince === 0
      ? "Updated today"
      : daysSince === 1
        ? "Updated yesterday"
        : daysSince === null
          ? "No update recorded"
          : `Not updated for ${daysSince} days`;
  const days = Array.from({ length: NAUKRI_WINDOW_DAYS }, (_, index) => {
    const date = new Date(toMs(todayIso) - (NAUKRI_WINDOW_DAYS - 1 - index) * DAY_MS);
    const iso = date.toISOString().slice(0, 10);
    return {
      iso,
      weekday: WEEKDAYS[date.getUTCDay()]!,
      label: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`,
      updated: updated.has(iso),
    };
  });
  return {
    todayIso,
    lastDate,
    daysSince,
    tone,
    chip,
    doneInWindow: days.filter((day) => day.updated).length,
    days,
  };
}
