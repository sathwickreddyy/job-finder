import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Check, FileText } from "lucide-react";
import { db } from "@/db";
import { mailMessages } from "@/db/schema";
import { StatusBadge } from "@/components/ui";
import { TaskLauncher } from "@/features/tasks/form";
import { listTasks, pendingTasks, taskOptions } from "@/features/tasks/read";
import { LiveTasks } from "@/features/tasks/live";
import { mailAttention } from "@/features/mail/attention";
import { MailRefresh } from "@/features/mail/refresh";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
export default async function HomePage() {
  const [options, tasks, pending, messages, preferences] = await Promise.all([
    taskOptions(),
    listTasks(12),
    pendingTasks(),
    db
      .select()
      .from(mailMessages)
      .where(eq(mailMessages.attentionState, "OPEN"))
      .orderBy(desc(mailMessages.receivedAt))
      .limit(300),
    getDisplayPreferences(),
  ]);
  const attention = messages
    .map((message) => ({ message, attention: mailAttention(message) }))
    .filter((item) => item.attention)
    .sort((a, b) => a.attention!.priority - b.attention!.priority)
    .slice(0, 5);
  const taskLink = (t: (typeof tasks)[number]) =>
    t.input.workflow === true ? `/tasks/${t.id}` : `/missions/${t.id}`;
  return (
    <>
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 text-xs text-muted-foreground">YOUR WORKSPACE · INDIA</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            What’s your next move?
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Choose a starting point. Shape it with your assistant. Decide what happens next.
          </p>
        </div>
        <span className="pt-1 text-xs text-muted-foreground">
          {displayDate(new Date(), preferences)}
        </span>
      </header>
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
        <section className="min-w-0">
          <h2 className="text-sm font-medium text-muted-foreground">Start something</h2>
          <TaskLauncher options={options} />
          <div className="mt-7 flex items-start gap-3 border-t border-border pt-6">
            <FileText size={22} className="mt-1 shrink-0 text-link" aria-hidden />
            <div className="flex-1">
              <h3 className="mb-1 text-sm">
                {options.resumes.length
                  ? "Your context, ready when you are"
                  : "Start with the resume you already use"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {options.resumes.length
                  ? "Resume, preferences, and public profiles in one place."
                  : "Add your resume and bring your own preferences."}
              </p>
            </div>
            <Link href="/my-profile" className="shrink-0 text-sm text-link">
              {options.resumes.length ? "My profile" : "Set up"} →
            </Link>
          </div>
        </section>
        <aside className="min-w-0 space-y-8 xl:border-l xl:border-border xl:pl-8">
          <section aria-labelledby="review-heading">
            <h2 id="review-heading" className="mb-5 text-base">
              For your review{pending.length ? ` · ${pending.length}` : ""}
            </h2>
            {pending.length ? (
              <div className="divide-y divide-border">
                {pending.map((t) => (
                  <Link
                    href={taskLink(t)}
                    key={t.id}
                    className="block py-4 first:pt-0 hover:no-underline"
                  >
                    <p className="text-sm font-medium text-foreground">{t.title}</p>
                    <p className="mt-1 text-xs text-warning">
                      {t.status === "WAITING_FOR_USER"
                        ? "Your assistant has a question"
                        : "A proposal is ready"}{" "}
                      →
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-4">
                <Check size={24} className="mb-4 text-link" aria-hidden />
                <h3>You’re all caught up</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  When your assistant has work ready, you’ll review it here before the next move.
                </p>
              </div>
            )}
            <LiveTasks reviewKeys={pending.map((t) => `${t.id}:${t.updatedAt.toISOString()}`)} />
          </section>
          <section className="border-t border-border pt-7">
            <div className="mb-5 flex justify-between gap-3">
              <h2 className="m-0 text-base">Needs your attention</h2>
              <Link href="/inbox?view=attention" className="text-xs text-link">
                Inbox →
              </Link>
            </div>
            {attention.length ? (
              <div className="mb-5 space-y-5">
                {attention.map(({ message, attention: item }) => (
                  <article key={message.id}>
                    <Link
                      href={`/mail/${message.id}`}
                      className="text-sm font-medium text-foreground"
                    >
                      {message.subject}
                    </Link>
                    <p className="mt-1 text-xs text-warning">{item!.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {displayDate(message.receivedAt, preferences)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mb-5 text-sm text-muted-foreground">
                Interview details, assessments and replies that need you will appear here.
              </p>
            )}
            <MailRefresh compact />
          </section>
        </aside>
      </div>
      <section className="mt-12 border-t border-border pt-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="m-0 text-lg">Your tasks</h2>
          <Link href="/tasks" className="text-sm text-link">
            View all →
          </Link>
        </div>
        {tasks.length ? (
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <Link
                key={t.id}
                href={taskLink(t)}
                className="flex flex-wrap items-center justify-between gap-3 py-4 hover:no-underline"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{t.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(t.input.assistant ?? "Manual task")} ·{" "}
                    {displayDate(t.updatedAt, preferences)}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="py-5 text-sm text-muted-foreground">
            No tasks yet. Pick a starting point above, or bring your own goal.
          </p>
        )}
      </section>
    </>
  );
}
