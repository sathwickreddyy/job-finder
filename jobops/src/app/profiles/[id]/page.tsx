import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { missions, profiles } from "@/db/schema";
import { PageHeader, Panel, StatusBadge } from "@/components/ui";
import { ProfileForm } from "@/features/profiles/profile-form";
import { computeProfileDiff } from "@/features/profiles/diff";
export const dynamic = "force-dynamic";
function display(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, id)); if (!profile) notFound();
  const history = await db.select().from(missions).where(and(eq(missions.entityType, "PROFILE"), eq(missions.entityId, id))).orderBy(desc(missions.createdAt));
  const preferences = await getDisplayPreferences();
  const changes = computeProfileDiff(profile.knownState, profile.targetState);
  return <><PageHeader title={profile.displayName} description={`${profile.provider} profile. Last inspected ${displayDate(profile.lastInspectedAt, preferences)}. Last externally updated ${displayDate(profile.lastUpdatedAt, preferences)}.`} actions={<><a href={profile.profileUrl} target="_blank" rel="noopener noreferrer" className="button-secondary">Open profile</a><Link className="button-secondary" href={`/missions/new?type=INSPECT_PROFILE&entityType=PROFILE&entityId=${id}`}>Create inspect mission</Link><Link className="button" href={`/missions/new?type=UPDATE_PROFILE&entityType=PROFILE&entityId=${id}`}>Create update mission</Link></>} /><div className="stack"><Panel title="Known → target differences">{changes.length ? <div className="table-wrap"><table><thead><tr><th>Field</th><th>Observed</th><th>Target</th></tr></thead><tbody>{changes.map((change) => <tr key={change.field}><td className="cell-title">{change.field}<div className="cell-subtitle">{change.added?.length ? `Add: ${change.added.join(", ")}` : ""}{change.removed?.length ? ` Remove: ${change.removed.join(", ")}` : ""}</div></td><td><div className="whitespace-pre-wrap break-words">{display(change.current)}</div></td><td><div className="whitespace-pre-wrap break-words">{display(change.target)}</div></td></tr>)}</tbody></table></div> : <p className="muted">No actionable differences. Add explicit target fields below to prepare an update mission.</p>}<p className="field-hint mt-4">Only approved differences may be applied. UNKNOWN targets are excluded; record the final observed state after external changes.</p></Panel><Panel title="Profile state and notes"><ProfileForm profile={profile} /></Panel><Panel title="Mission history">{history.length ? <div className="stack-sm">{history.map((mission) => <div className="queue-row" key={mission.id}><div><Link href={`/missions/${mission.id}`} className="cell-title">{mission.title}</Link><p className="cell-subtitle">{mission.type} · {displayDate(mission.createdAt, preferences)}</p></div><StatusBadge status={mission.status} /></div>)}</div> : <p className="muted">No missions yet. Inspect the profile before preparing a change.</p>}</Panel></div></>;
}
