import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { resumeVersions } from "@/db/schema";
import { DetailSection } from "../workspace/pane";
import { editCount, TrackedChanges } from "./changes";
import { ToolChecks } from "./checks";
import { Chips } from "./chips";
import { summarizeTool } from "./derive";
import { diffResumes } from "./diff";
import { JobBar } from "./job-bar";
import { Scores } from "./scores";
import { getFit, type Fit } from "./service";
import { TOOL_SOURCES, type OptimizerDetails } from "./tools";

/** The recorded fit plus tracked changes from the base version's extracted text. */
export async function loadFit(versionId: string) {
  const fit = await getFit(versionId);
  if (!fit?.baseVersionId) return { fit, diff: null };
  const texts = await db
    .select({ id: resumeVersions.id, text: resumeVersions.extractedText })
    .from(resumeVersions)
    .where(inArray(resumeVersions.id, [versionId, fit.baseVersionId]));
  const mine = texts.find((t) => t.id === versionId)?.text;
  const base = texts.find((t) => t.id === fit.baseVersionId)?.text;
  return { fit, diff: mine && base ? diffResumes(base, mine) : null };
}

export function FitView({ fit }: { fit: Fit }) {
  if (!fit.target || !fit.snapshot)
    return (
      <section aria-label="Job this file is tailored for" className="space-y-3">
        <p className="m-0 rounded-full bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          Not tailored for a job
        </p>
        {fit.derivedFrom.length > 0 ? (
          <div className="px-1 text-xs">
            <p className="m-0 text-muted-foreground">
              {fit.derivedFrom.length} tailored file
              {fit.derivedFrom.length === 1 ? " was" : "s were"} made from this one
            </p>
            <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
              {fit.derivedFrom.map((d) => (
                <li key={d.id}>
                  <Link href={`/resumes?file=${d.id}`}>{d.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="m-0 px-1 text-xs text-muted-foreground">
            Scores appear here once an agent tailors a file for a saved job description.
          </p>
        )}
      </section>
    );
  const tools = Object.fromEntries(
    TOOL_SOURCES.map((s) => [s, summarizeTool(s, fit.mine[s], fit.base[s])]),
  ) as Parameters<typeof Scores>[0]["tools"];
  const optimizer = fit.mine["resume-ats-optimizer"]?.parsed as OptimizerDetails | undefined;
  return (
    <div className="space-y-6">
      <JobBar target={fit.target} snapshot={fit.snapshot} />
      <Scores tools={tools} format={optimizer?.format ?? []} />
      {fit.chips.length > 0 && <Chips chips={fit.chips} />}
      <ToolChecks mine={fit.mine} />
    </div>
  );
}

export function ChangesSection({ diff }: { diff: ReturnType<typeof diffResumes> }) {
  const n = editCount(diff);
  return (
    <DetailSection title="What changed" status={`${n} edit${n === 1 ? "" : "s"}`}>
      <TrackedChanges diff={diff} />
    </DetailSection>
  );
}
