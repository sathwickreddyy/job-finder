import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { Button, EmptyState, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { listMissions } from "@/features/missions/service";
import { MISSION_STATUSES, MISSION_TYPES } from "@/features/missions/domain";
import { MISSION_LABELS } from "@/features/missions/templates";
export const dynamic = "force-dynamic";
export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "";
  const type = typeof query.type === "string" ? query.type : "";
  const missions = await listMissions({ q, status, type });
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title="Missions"
        description="Define work, hand it to an operator, and keep results and evidence in one place."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/missions/new?type=DISCOVER_JOBS">Discovery mission</Link>
            </Button>
            <Button asChild>
              <Link href="/missions/new">Create mission</Link>
            </Button>
          </>
        }
      />
      <Panel className="mb-5">
        <form method="get" className="grid items-end gap-3 md:grid-cols-4">
          <div>
            <label htmlFor="q" className="mb-1 block text-sm">
              Search missions
            </label>
            <input id="q" name="q" placeholder="Title or goal" defaultValue={q} />
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-sm">
              Status
            </label>
            <select id="status" name="status" defaultValue={status}>
              <option value="">All statuses</option>
              {MISSION_STATUSES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="mb-1 block text-sm">
              Type
            </label>
            <select id="type" name="type" defaultValue={type}>
              <option value="">All types</option>
              {MISSION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {MISSION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Filter</Button>
            <Button variant="ghost" asChild>
              <Link href="/missions">Clear</Link>
            </Button>
          </div>
        </form>
      </Panel>
      {missions.length ? (
        <Panel className="overflow-x-auto p-0">
          <table>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission) => (
                <tr key={mission.id}>
                  <td>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/missions/${mission.id}`}
                    >
                      {mission.title}
                    </Link>
                    <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                      {mission.goal}
                    </p>
                  </td>
                  <td>{MISSION_LABELS[mission.type]}</td>
                  <td>
                    <StatusBadge status={mission.status} />
                  </td>
                  <td>
                    {
                      ({ 1: "High", 2: "Normal", 3: "Low" } as Record<number, string>)[
                        mission.priority
                      ]
                    }
                  </td>
                  <td>{displayDate(mission.createdAt, preferences)}</td>
                  <td>
                    <Link
                      className="text-primary hover:underline"
                      href={`/missions/${mission.id}/agent`}
                    >
                      Agent view
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : (
        <EmptyState
          title="No missions match"
          description="Create a discovery mission using your saved preferences, or define work for a job, application, profile or contact."
          action={
            <Button asChild>
              <Link href="/missions/new">Create mission</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
