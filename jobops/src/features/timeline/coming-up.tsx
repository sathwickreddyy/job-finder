import Link from "next/link";
import { cn } from "@/lib/utils";
import { mailHref } from "./query";

/** Something due soon: a booked round, an OA deadline or a follow-up. */
export type ComingUpItem = {
  id: string;
  at: string;
  /** "Overdue", "Today", "Tomorrow", then "Mon 2 Nov". */
  label: string;
  title: string;
  companyKey: string;
  companyName: string;
};

/** Gallery Coming up B: what is due in the next 7 days, soonest first, one short row each. */
export function ComingUp({ items }: { items: ComingUpItem[] }) {
  if (!items.length) return null;
  const sorted = items.toSorted((a, b) => a.at.localeCompare(b.at));
  return (
    <section
      aria-labelledby="coming-up"
      className="mb-5 rounded-3xl bg-card px-4 py-3 ring-1 ring-border"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 id="coming-up" className="m-0 text-base font-semibold">
          Coming up
        </h3>
        <span className="text-xs text-muted-foreground">Next 7 days</span>
      </div>
      <ol className="m-0 list-none divide-y divide-border p-0">
        {sorted.map((item) => (
          <li key={item.id}>
            <Link
              href={mailHref({ company: item.companyKey })}
              className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-baseline gap-3 py-2 text-sm text-foreground hover:no-underline [&:hover_.title]:underline"
            >
              <span
                className={cn(
                  "font-semibold",
                  item.label === "Overdue" ? "text-warning" : "text-selected-foreground",
                )}
              >
                {item.label}
              </span>
              <span className="title truncate">{item.title}</span>
              <span className="truncate text-xs text-muted-foreground">{item.companyName}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
