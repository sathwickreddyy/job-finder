import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type DisplayPreferences = { timezone: string; dateFormat: "ISO" | "LOCAL" };
export function normalizeDisplayPreferences(value?: Record<string, unknown>): DisplayPreferences {
  let timezone = "Asia/Kolkata";
  if (typeof value?.timezone === "string") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.timezone });
      timezone = value.timezone;
    } catch {
      /* Legacy invalid values fall back to the default display timezone. */
    }
  }
  return { timezone, dateFormat: value?.dateFormat === "LOCAL" ? "LOCAL" : "ISO" };
}
export const getDisplayPreferences = cache(async (): Promise<DisplayPreferences> => {
  const [saved] = await db.select().from(settings).where(eq(settings.key, "appPreferences"));
  return normalizeDisplayPreferences(saved?.value);
});
export function displayDate(
  value: Date | null | undefined,
  preferences: DisplayPreferences,
  includeTime = false,
): string {
  if (!value) return "Not recorded";
  if (preferences.dateFormat === "LOCAL")
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: preferences.timezone,
      dateStyle: "medium",
      ...(includeTime ? { timeStyle: "short" as const } : {}),
    }).format(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: preferences.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}${includeTime ? ` ${part("hour")}:${part("minute")} ${preferences.timezone}` : ""}`;
}
