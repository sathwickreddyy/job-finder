import { formatDay, istDayStart } from "@/features/applications/dates";
import { journeyOf } from "@/features/applications/journey";
import type { LaneSource } from "@/features/applications/lanes";
import { isOutreach, recordStateFrom } from "@/features/applications/phase";
import { PREVIOUS_JOB } from "@/features/companies/previous-source";

const DAY = 86_400_000;
export function mobileAnalytics(records: LaneSource[], now: Date) {
  const own = records.filter(
    (record) => record.source !== PREVIOUS_JOB && !isOutreach(record.source),
  );
  const sent = own.filter(
    (record) =>
      recordStateFrom(
        { ...record, appliedAt: record.sentAt },
        record.rounds,
        record.events.map((event) => event.eventType),
      ).sent,
  );
  const end = istDayStart(now).valueOf() + DAY;
  const series = (length: number, days: number) =>
    Array.from({ length }, (_, index) => {
      const start = end - (length - index) * days * DAY;
      return {
        label:
          days === 1
            ? new Intl.DateTimeFormat("en-IN", {
                weekday: "short",
                timeZone: "Asia/Kolkata",
              }).format(start)
            : formatDay(new Date(start)),
        value: sent.filter(
          (record) =>
            record.sentAt &&
            record.sentAt.valueOf() >= start &&
            record.sentAt.valueOf() < start + days * DAY,
        ).length,
      };
    });
  return {
    sent: sent.length,
    interviewing: own.filter((record) => record.phase === "Interviewing").length,
    offers: own.filter((record) =>
      journeyOf(record).steps.some((step) => step.label === "Offer" && step.state === "reached"),
    ).length,
    closed: own.filter((record) => record.phase === "Closed").length,
    week: series(7, 1),
    month: series(4, 7),
    today: now.toISOString(),
  };
}
export type MobileAnalytics = ReturnType<typeof mobileAnalytics>;
