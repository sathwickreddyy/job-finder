import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type DisplayPreferences = { timezone: string; dateFormat: "ISO" | "LOCAL" };
export const getDisplayPreferences = cache(async (): Promise<DisplayPreferences> => {
  const [saved] = await db.select().from(settings).where(eq(settings.key, "appPreferences"));
  return { timezone: typeof saved?.value.timezone === "string" ? saved.value.timezone : "Asia/Kolkata", dateFormat: saved?.value.dateFormat === "LOCAL" ? "LOCAL" : "ISO" };
});
export function displayDate(value: Date | null | undefined, preferences: DisplayPreferences, includeTime = false): string {
  if (!value) return "Not recorded";
  if (preferences.dateFormat === "LOCAL") return new Intl.DateTimeFormat("en-IN", { timeZone: preferences.timezone, dateStyle: "medium", ...(includeTime ? { timeStyle: "short" as const } : {}) }).format(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: preferences.timezone, year: "numeric", month: "2-digit", day: "2-digit", ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}) }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}${includeTime ? ` ${part("hour")}:${part("minute")} ${preferences.timezone}` : ""}`;
}
