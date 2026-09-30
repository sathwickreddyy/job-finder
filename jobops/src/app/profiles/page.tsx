import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { computeProfileDiff } from "@/features/profiles/diff";
export const dynamic = "force-dynamic";
export default async function ProfilesPage() {
  const preferences = await getDisplayPreferences();
  const records = await db.select().from(profiles).orderBy(desc(profiles.updatedAt));
  return <><PageHeader title="Profiles" description="Observed portal profiles and explicit changes to prepare for your next role." actions={<Link href="/profiles/new" className="button">Add profile</Link>} />{records.length ? <div className="table-wrap"><table><thead><tr><th>Profile</th><th>Status</th><th>Last inspected</th><th>Target changes</th><th>Next action</th></tr></thead><tbody>{records.map((profile) => <tr key={profile.id}><td><Link href={`/profiles/${profile.id}`} className="cell-title">{profile.displayName}</Link><div className="cell-subtitle">{profile.provider}</div></td><td><StatusBadge status={profile.status} /></td><td>{profile.lastInspectedAt ? displayDate(profile.lastInspectedAt, preferences) : <span className="badge badge-amber">Not inspected</span>}</td><td>{computeProfileDiff(profile.knownState, profile.targetState).length} fields</td><td><Link href={`/missions/new?type=INSPECT_PROFILE&entityType=PROFILE&entityId=${profile.id}`}>Inspect profile</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Know what your profiles actually say" description="Add a portal profile, record its observed state, and prepare specific changes with an approved mission." action={<Link href="/profiles/new" className="button">Add a portal profile</Link>} />}</>;
}
