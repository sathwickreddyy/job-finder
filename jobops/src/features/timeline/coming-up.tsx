import Link from "next/link";
import { tagClass } from "@/features/mail/tag-pill";
import type { MailTag } from "@/features/mail/tags";
import { cn } from "@/lib/utils";
import { mailHref } from "./query";

/** Something due soon: a booked round, an OA deadline, a follow-up, or open mail without a date. */
export type ComingUpItem = {
  id: string;
  /** Null for open mail that has no date to keep. */
  at: string | null;
  label: string;
  title: string;
  companyKey: string;
  companyName: string;
  tag: MailTag | null;
  mailId: string | null;
};

/** Gallery needs-you A: a strip of what is due in the next 7 days, soonest first. */
export function ComingUp({ items }: { items: ComingUpItem[] }) {
  if (!items.length) return null;
  const sorted = items.toSorted((a, b) =>
    a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0,
  );
  return (
    <section aria-labelledby="coming-up" className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 id="coming-up" className="m-0 text-base font-semibold">
          Coming up
        </h3>
        <span className="text-xs text-muted-foreground">Next 7 days</span>
      </div>
      <ol className="m-0 -mx-1 flex list-none snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {sorted.map((item) => (
          <li key={item.id} className="w-52 shrink-0 snap-start">
            <Link
              href={mailHref({ company: item.companyKey, mail: item.mailId })}
              className={cn(
                "block h-full space-y-2 rounded-2xl p-3.5 text-foreground hover:no-underline",
                item.at ? "bg-selected/60 ring-1 ring-link/25" : "ring-1 ring-border",
              )}
            >
              <span
                className={cn(
                  "block text-lg font-semibold tracking-tight",
                  item.at ? "text-selected-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
              <span className="line-clamp-2 block text-sm">{item.title}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    item.tag ? tagClass[item.tag].dot : "ring-2 ring-link",
                  )}
                />
                {item.companyName}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
