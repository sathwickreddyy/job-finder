import type { FitGroup } from "./service";
import type { LexicalDetails, OptimizerDetails } from "./tools";

export type Where = OptimizerDetails["keywords"][number]["where"];
/**
 * shown: in Experience. add-bullet: only in Summary or Skills. found: mentioned, sections unknown.
 * elsewhere: mentioned outside those three sections. unclear: only a negated or uncertain mention.
 */
export type MustHaveState = "shown" | "add-bullet" | "found" | "elsewhere" | "unclear" | "missing";
export type MustHaveRow = { term: string; state: MustHaveState; where: Where | null };

const order: MustHaveState[] = ["shown", "add-bullet", "found", "elsewhere", "unclear", "missing"];
const lower = (s: string) => s.toLocaleLowerCase();

/** The job's must-haves from the recorded keyword check, placed with the ATS optimizer's sections. */
export function mustHaveRows(group: Pick<FitGroup, "mine">): MustHaveRow[] {
  const lexical = group.mine["jobops-lexical"]?.parsed as LexicalDetails | undefined;
  const optimizer = group.mine["resume-ats-optimizer"]?.parsed as OptimizerDetails | undefined;
  if (!lexical) return [];
  const rows = lexical.findings
    .filter((f) => f.importance === "required")
    .map((f): MustHaveRow => {
      if (f.status === "not_evidenced") return { term: f.term, state: "missing", where: null };
      if (f.status === "unclear") return { term: f.term, state: "unclear", where: null };
      const keyword = optimizer?.keywords.find((k) => lower(k.term) === lower(f.term));
      if (!keyword || keyword.found === 0) return { term: f.term, state: "found", where: null };
      const w = keyword.where;
      const state =
        w.experience > 0 ? "shown" : w.summary + w.skills > 0 ? "add-bullet" : "elsewhere";
      return { term: f.term, state, where: w };
    });
  return rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
}
