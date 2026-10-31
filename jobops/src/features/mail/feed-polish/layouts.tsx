"use client";

import { cn } from "@/lib/utils";
import type { PolishMail } from "./data";
import { PolishRow, type RowStyle } from "./rows";
import { dateParts, dayLabel, groupBy, thisYear } from "./shared";

const dayKey = (at: string) => dateParts(at).key;
const count = (n: number) => `${n} ${n === 1 ? "email" : "emails"}`;
const rows = "m-0 list-none divide-y divide-border p-0";

/** A: one outlined card per day, with the date (and year when it isn't this one) on top. */
export function DayCards({ mails, style }: { mails: PolishMail[]; style?: RowStyle }) {
  return (
    <div className="space-y-3">
      {groupBy(mails, dayKey).map((day) => {
        const parts = dateParts(day.first);
        const label = dayLabel(day.first);
        return (
          <section
            key={day.key}
            aria-label={label}
            className="overflow-hidden rounded-3xl bg-card ring-1 ring-border"
          >
            <header className="flex items-baseline gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
              <h3 className="m-0 text-sm font-semibold">{label}</h3>
              {parts.ago <= 1 && (
                <span className="text-sm text-muted-foreground">
                  {parts.weekday} {parts.day} {parts.month}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {count(day.items.length)}
              </span>
            </header>
            <ul className={rows}>
              {day.items.map((mail) => (
                <PolishRow key={mail.id} mail={mail} style={style} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** B: one outlined ledger; a date stamp column beside each day, and a band where a year starts. */
export function DateRail({ mails, style }: { mails: PolishMail[]; style?: RowStyle }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      {groupBy(mails, (at) => String(dateParts(at).year)).map((year, yearIndex) => (
        <div key={year.key}>
          {Number(year.key) !== thisYear && (
            <div
              className={cn(
                "flex items-baseline gap-3 bg-muted/40 px-4 py-2",
                yearIndex > 0 && "border-t border-border",
              )}
            >
              <h3 className="m-0 text-sm font-semibold tabular-nums">{year.key}</h3>
              <span className="text-xs text-muted-foreground">{count(year.items.length)}</span>
            </div>
          )}
          {groupBy(year.items, dayKey).map((day, dayIndex) => {
            const parts = dateParts(day.first);
            return (
              <section
                key={day.key}
                aria-label={dayLabel(day.first)}
                className={cn(
                  "grid grid-cols-[3.75rem_minmax(0,1fr)] sm:grid-cols-[4.75rem_minmax(0,1fr)]",
                  (dayIndex > 0 || Number(year.key) !== thisYear) && "border-t border-border",
                )}
              >
                <div className="border-r border-border px-1 py-3 text-center">
                  <div className="sticky top-4 grid">
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        parts.ago === 0 ? "text-link" : "text-muted-foreground",
                      )}
                    >
                      {parts.ago === 0 ? "Today" : parts.weekday}
                    </span>
                    <span
                      className={cn(
                        "text-2xl leading-tight font-semibold tabular-nums",
                        parts.ago === 0 && "text-link",
                      )}
                    >
                      {parts.day}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{parts.month}</span>
                  </div>
                </div>
                <ul className={rows}>
                  {day.items.map((mail) => (
                    <PolishRow key={mail.id} mail={mail} style={style} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** C: a heading per month and year, and each email its own outlined card with its date. */
export function MonthCards({ mails, style }: { mails: PolishMail[]; style?: RowStyle }) {
  const months = groupBy(mails, (at) => {
    const parts = dateParts(at);
    return `${parts.year}-${parts.month}`;
  });
  return (
    <div className="space-y-6">
      {months.map((month) => {
        const parts = dateParts(month.first);
        return (
          <section key={month.key} aria-label={`${parts.monthName} ${parts.year}`}>
            <header className="sticky top-0 z-10 mb-2 flex items-baseline gap-2 bg-background/90 py-2 backdrop-blur">
              <h3 className="m-0 text-base font-semibold">
                {parts.monthName} {parts.year}
              </h3>
              <span className="text-xs text-muted-foreground">{count(month.items.length)}</span>
            </header>
            <ul className="m-0 grid list-none gap-2 p-0">
              {month.items.map((mail) => {
                const day = dateParts(mail.at);
                return (
                  <PolishRow
                    key={mail.id}
                    mail={mail}
                    style={style}
                    className={cn(
                      "overflow-hidden rounded-2xl bg-card ring-1",
                      mail.open ? "ring-primary/45" : "ring-border",
                    )}
                    lead={
                      <span className="grid w-14 content-center justify-items-center border-r border-border py-3">
                        <span className="text-[11px] text-muted-foreground">
                          {day.ago === 0 ? "Today" : day.weekday}
                        </span>
                        <span className="text-lg leading-tight font-semibold tabular-nums">
                          {day.day}
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
