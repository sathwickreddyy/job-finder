import Link from "next/link";
import { and, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { mailClassifications, mailMessages } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { indiaDayBoundary, mailAttention, mailDateGroup } from "@/features/mail/attention";
import { setMailAttention } from "@/features/mail/attention-actions";
import { MailRefresh } from "@/features/mail/refresh";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    category?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const p = await searchParams;
  const from = p.from ? indiaDayBoundary(p.from) : undefined,
    to = p.to ? indiaDayBoundary(p.to, true) : undefined;
  const rows = await db
    .select()
    .from(mailMessages)
    .where(
      and(
        from ? gte(mailMessages.receivedAt, from) : undefined,
        to ? lt(mailMessages.receivedAt, to) : undefined,
        mailClassifications.includes(p.category as (typeof mailClassifications)[number])
          ? eq(mailMessages.classification, p.category as (typeof mailClassifications)[number])
          : undefined,
        p.q
          ? or(ilike(mailMessages.subject, `%${p.q}%`), ilike(mailMessages.sender, `%${p.q}%`))
          : undefined,
      ),
    )
    .orderBy(desc(mailMessages.receivedAt))
    .limit(200);
  const dates = await getDisplayPreferences();
  const filtered = p.view === "attention" ? rows.filter((m) => mailAttention(m)) : rows;
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Recruiting mail, grouped by date. Clear next steps when something needs you."
        actions={
          <Link href="/mail" className="button-secondary">
            Connections & application updates
          </Link>
        }
      />
      <Panel className="mb-6">
        <MailRefresh />
      </Panel>
      <nav className="mb-5 flex gap-5 border-b border-border" aria-label="Inbox views">
        {[
          ["all", "All messages"],
          ["attention", "Needs attention"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={`/inbox?view=${value}`}
            aria-current={(p.view ?? "all") === value ? "page" : undefined}
            className={`border-b-2 px-1 py-3 text-sm ${(p.view ?? "all") === value ? "border-primary text-link" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form action="/inbox" className="mb-7 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="view" value={p.view ?? "all"} />
        <div>
          <label htmlFor="mail-search" className="mb-1 block text-xs">
            Search
          </label>
          <input
            type="search"
            name="q"
            id="mail-search"
            defaultValue={p.q}
            placeholder="Subject or sender"
          />
        </div>
        <div>
          <label htmlFor="mail-category" className="mb-1 block text-xs">
            Category
          </label>
          <select name="category" id="mail-category" defaultValue={p.category ?? ""}>
            <option value="">All categories</option>
            {mailClassifications.map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mail-from" className="mb-1 block text-xs">
            From (IST)
          </label>
          <input type="date" id="mail-from" name="from" defaultValue={p.from} />
        </div>
        <div>
          <label htmlFor="mail-to" className="mb-1 block text-xs">
            Through (IST)
          </label>
          <input type="date" id="mail-to" name="to" defaultValue={p.to} />
        </div>
        <Button type="submit" variant="outline">
          Filter messages
        </Button>
      </form>
      {((p.from && !from) || (p.to && !to) || (from && to && from >= to)) && (
        <p role="alert" className="mb-5 text-sm text-destructive">
          Enter a valid date range. Dates are interpreted in India Standard Time.
        </p>
      )}
      {!filtered.length && (
        <Panel>
          <h2>
            {p.view === "attention"
              ? "Nothing needs your attention here"
              : "Your inbox starts here"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Refresh a connected inbox or import recruiting messages. No sample emails are added.
          </p>
        </Panel>
      )}
      {["Today", "This week", "Older"].map((group) => {
        const messages = filtered.filter((m) => mailDateGroup(m.receivedAt) === group);
        return (
          messages.length > 0 && (
            <section key={group} className="mb-8">
              <h2 className="mb-4 text-base">{group}</h2>
              <div className="space-y-3">
                {messages.map((m) => {
                  const attention = mailAttention(m);
                  return (
                    <Panel key={m.id}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/mail/${m.id}`}
                            className="text-sm font-semibold text-foreground"
                          >
                            {m.subject}
                          </Link>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {m.sender} · {displayDate(m.receivedAt, dates, true)}
                          </p>
                        </div>
                        <StatusBadge status={m.classification} />
                      </div>
                      {attention && (
                        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                          {attention.reason}
                        </p>
                      )}
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{m.snippet}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        <Link href={`/mail/${m.id}`} className="text-sm text-link">
                          Read message →
                        </Link>
                        <ActionForm action={setMailAttention}>
                          <input type="hidden" name="id" value={m.id} />
                          <input
                            type="hidden"
                            name="state"
                            value={m.attentionState === "DONE" ? "OPEN" : "DONE"}
                          />
                          <Button type="submit" variant="ghost" size="sm">
                            {m.attentionState === "DONE" ? "Reopen action" : "Mark done"}
                          </Button>
                        </ActionForm>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </section>
          )
        );
      })}
      {rows.length === 200 && (
        <p className="text-xs text-muted-foreground">
          Showing up to 200 messages. Use a date range to find older mail.
        </p>
      )}
    </>
  );
}
