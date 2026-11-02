import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { resumeVersions } from "@/db/schema";
import { DetailSection } from "../workspace/pane";
import { editCount, TrackedChanges } from "./changes";
import { ScoreFlow } from "../score/ui/flow";
import { ComparisonTable, showsComparison } from "./compare";
import { BriefView } from "./brief-view";
import { summarizeTool } from "./derive";
import { Dials } from "./dials";
import { diffResumes } from "./diff";
import { ResumeNextIssues } from "./issues-view";
import { JobBar } from "./job-bar";
import { mustHaveRows } from "./must-haves";
import { MustHaves } from "./must-haves-view";
import { getFit, type Fit } from "./service";
import {
  TOOL_SOURCES,
  type OptimizerDetails,
  type ResumeNextDetails,
  type ToolSource,
} from "./tools";

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

export function FitView({
  fit,
  selected = null,
  textReady = true,
  rescore = false,
}: {
  fit: Fit;
  selected?: string | null;
  textReady?: boolean;
  rescore?: boolean;
}) {
  if (!fit.groups.length)
    return (
      <section aria-label="Job this file is tailored for" className="space-y-3">
        <ScoreFlow versionId={fit.versionId} tailored={false} textReady={textReady} />
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
            Score this file against a saved opening, or tailor it for one with an agent.
          </p>
        )}
      </section>
    );
  const group = fit.groups.find((g) => g.snapshotId === selected) ?? fit.groups[0];
  const tools = Object.fromEntries(
    TOOL_SOURCES.map((s) => [s, summarizeTool(s, group.mine[s], group.base[s])]),
  ) as Record<ToolSource, ReturnType<typeof summarizeTool>>;
  const optimizer = group.mine["resume-ats-optimizer"]?.parsed as OptimizerDetails | undefined;
  const resumenext = group.mine.resumenext?.parsed as ResumeNextDetails | undefined;
  const ats = group.brief?.scores.atsOptimizer;
  return (
    <div className="space-y-6">
      {fit.docxPath && (
        <p className="m-0 truncate px-1 text-[11px] text-muted-foreground" title={fit.docxPath}>
          Editable DOCX: {fit.docxPath}
        </p>
      )}
      <JobBar
        key={group.snapshotId}
        target={group.target}
        snapshot={group.snapshot}
        label={group.tailored ? undefined : "Job this file was scored against"}
      />
      <ScoreFlow
        versionId={fit.versionId}
        tailored={fit.target !== null}
        textReady={textReady}
        rescore={
          rescore
            ? {
                snapshotId: group.snapshotId,
                company: group.target.company,
                title: group.target.title,
              }
            : undefined
        }
      />
      {showsComparison(fit.groups) && (
        <ComparisonTable
          versionId={fit.versionId}
          groups={fit.groups}
          selected={group.snapshotId}
        />
      )}
      <Dials
        tools={tools}
        captions={
          ats?.mustHavesFound != null
            ? {
                "resume-ats-optimizer": `${ats.mustHavesFound} of ${ats.mustHaves} must-haves found`,
              }
            : {}
        }
      />
      {group.mine["jobops-lexical"] && (
        <MustHaves
          rows={mustHaveRows(group)}
          hasOptimizer={!!optimizer}
          format={optimizer?.format ?? []}
        />
      )}
      <ResumeNextIssues summary={tools.resumenext} issues={resumenext?.issues ?? null} />
      {group.brief && <BriefView key={`brief-${group.snapshotId}`} brief={group.brief} />}
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
