import { FormatIcon, Severity } from "./bits";
import type { ParsedRow } from "./derive";
import type { LexicalDetails, OptimizerDetails, ResumeNextDetails, ToolSource } from "./tools";

// ResumeNext reads wrapped bullet lines as extra jobs and reports each as "Experience — …".
const wrappedLineNote = (label: string) => label.startsWith("Experience —");

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
const notChecked = <p className="m-0 text-xs text-muted-foreground">Not checked yet</p>;

/** Every check each tool ran, with the agent's recorded reason when a suggestion was left alone. */
export function ToolChecks({ mine }: { mine: Partial<Record<ToolSource, ParsedRow>> }) {
  const optimizer = mine["resume-ats-optimizer"]?.parsed as OptimizerDetails | undefined;
  const resumenext = mine.resumenext?.parsed as ResumeNextDetails | undefined;
  const lexical = mine["jobops-lexical"]?.parsed as LexicalDetails | undefined;
  const issues = resumenext?.issues.filter((i) => !wrappedLineNote(i.label)) ?? [];
  const wrapped = (resumenext?.issues.length ?? 0) - issues.length;
  const missing = lexical?.findings.filter((f) => f.status === "not_evidenced") ?? [];
  return (
    <section aria-label="Checks by tool" className="space-y-4">
      <h3 className="m-0 text-sm font-semibold">Checks by tool</h3>
      <Group title="ATS optimizer: formatting">
        {optimizer ? (
          <ul className="m-0 list-none space-y-1 p-0">
            {optimizer.format.map((f) => (
              <li
                key={f.check}
                tabIndex={0}
                title={f.detail}
                className="group flex items-start gap-2 rounded text-xs"
              >
                <FormatIcon ok={f.ok} warn={f.warn} />
                <span>
                  {f.check}
                  <span className="hidden text-muted-foreground group-hover:block group-focus:block">
                    {f.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          notChecked
        )}
      </Group>
      <Group title="ResumeNext: issues">
        {resumenext ? (
          <ul className="m-0 list-none space-y-2 p-0">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <Severity level={issue.severity} />
                <span className="min-w-0">
                  <span className="block">{issue.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{issue.hint}</span>
                  {issue.decision && (
                    <span className="mt-1 block rounded-lg bg-muted px-2 py-1">
                      Not changing: {issue.decision}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {wrapped > 0 && (
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <Severity level="optional" />
                {wrapped} parser notes on wrapped lines
              </li>
            )}
            {!issues.length && !wrapped && <li className="text-xs">No issues reported</li>}
          </ul>
        ) : (
          notChecked
        )}
      </Group>
      <Group title="Keyword check: not evidenced">
        {lexical ? (
          <p className="m-0 text-xs">{missing.map((f) => f.term).join(", ") || "Nothing"}</p>
        ) : (
          notChecked
        )}
      </Group>
    </section>
  );
}
