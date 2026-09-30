import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { db } from "@/db";
import {
  jobs,
  jobSnapshots,
  applications,
  applicationEvents,
  contacts,
  missions,
  missionSteps,
  missionExecutions,
  missionEvidence,
  candidateProfiles,
} from "@/db/schema";
export async function GET(request: NextRequest) {
  const entity = request.nextUrl.searchParams.get("entity"),
    format = request.nextUrl.searchParams.get("format") ?? "json";
  if (
    !["jobs", "applications", "contacts", "missions", "candidate"].includes(entity ?? "") ||
    !["json", "csv"].includes(format)
  )
    return NextResponse.json(
      { error: "Choose jobs, applications, contacts, missions or candidate, and json or csv." },
      { status: 400 },
    );
  if (format === "csv" && ["missions", "candidate"].includes(entity!))
    return NextResponse.json({ error: "This entity supports JSON export." }, { status: 400 });
  let records: Record<string, unknown>[] = [];
  if (entity === "jobs") {
    const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt));
    const snapshots = await db.select().from(jobSnapshots).orderBy(desc(jobSnapshots.capturedAt));
    records = rows.map((j) => {
      const history = snapshots.filter((s) => s.jobId === j.id);
      return {
        ...j,
        url: j.canonicalUrl,
        description: history[0]?.description ?? "",
        keywords: history[0]?.skills ?? [],
        ...(format === "json" ? { snapshots: history } : {}),
      };
    });
  }
  if (entity === "applications") {
    const rows = await db
      .select({ app: applications, job: jobs })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id));
    const events = format === "json" ? await db.select().from(applicationEvents) : [];
    records = rows.map(({ app, job }) => ({
      ...app,
      company: job.company,
      title: job.title,
      ...(format === "json" ? { events: events.filter((e) => e.applicationId === app.id) } : {}),
    }));
  }
  if (entity === "contacts") records = await db.select().from(contacts);
  if (entity === "candidate") records = await db.select().from(candidateProfiles);
  if (entity === "missions") {
    const [rows, steps, executions, evidence] = await Promise.all([
      db.select().from(missions),
      db.select().from(missionSteps),
      db.select().from(missionExecutions),
      db.select().from(missionEvidence),
    ]);
    records = rows.map((m) => ({
      ...m,
      steps: steps.filter((s) => s.missionId === m.id),
      executions: executions.filter((e) => e.missionId === m.id),
      evidence: evidence
        .filter((e) => e.missionId === m.id)
        .map(({ storagePath, ...e }) => ({ ...e, hasFile: Boolean(storagePath) })),
    }));
  }
  const content =
    format === "json"
      ? JSON.stringify(
          { exportedAt: new Date().toISOString(), version: 1, entity, records },
          null,
          2,
        )
      : Papa.unparse(
          records.map((record) =>
            Object.fromEntries(
              Object.entries(record).map(([k, v]) => [
                k,
                v instanceof Date
                  ? v.toISOString()
                  : v !== null && typeof v === "object"
                    ? JSON.stringify(v)
                    : v,
              ]),
            ),
          ),
          { escapeFormulae: true },
        );
  return new NextResponse(content, {
    headers: {
      "Content-Type":
        format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jobops-${entity}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
