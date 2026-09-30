import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { missions } from "@/db/schema";
import { Button, PageHeader, Panel, StatusBadge } from "@/components/ui";
export default async function TasksPage() {
  const rows = await db.select().from(missions).orderBy(desc(missions.updatedAt)).limit(200);
  return (
    <>
      <PageHeader
        title="Your tasks"
        description="Progress, decisions, and completed work stay together."
        actions={
          <Button asChild>
            <Link href="/tasks/new">Create task</Link>
          </Button>
        }
      />
      <Panel>
        {rows.length ? (
          <div className="divide-y divide-border">
            {rows.map((t) => (
              <Link
                key={t.id}
                href={t.input.workflow === true ? `/tasks/${t.id}` : `/missions/${t.id}`}
                className="flex flex-wrap items-center justify-between gap-4 py-4 hover:no-underline"
              >
                <span className="text-sm font-medium text-foreground">{t.title}</span>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Your first task starts on Home.</p>
        )}
      </Panel>
      {rows.length === 200 && (
        <Link href="/missions" className="mt-5 inline-block text-link">
          Search older tasks →
        </Link>
      )}
    </>
  );
}
