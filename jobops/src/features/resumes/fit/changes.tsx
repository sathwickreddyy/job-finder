import { MoveVertical } from "lucide-react";
import { diffResumes, wordDiff, type Change } from "./diff";

type Diff = ReturnType<typeof diffResumes>;
const KIND: Record<Change["kind"], string> = {
  reworded: "reworded",
  moved: "moved",
  added: "added",
  dropped: "dropped",
};

export const editCount = (diff: Diff) => Object.values(diff.counts).reduce((a, b) => a + b, 0);

function Words({ change }: { change: Change }) {
  if (!change.before)
    return <ins className="bg-success-soft text-success no-underline">{change.after}</ins>;
  if (!change.after) return <del className="text-danger-action">{change.before}</del>;
  return (
    <>
      {wordDiff(change.before, change.after).map((part, i) =>
        part.op === "ins" ? (
          <ins key={i} className="bg-success-soft text-success no-underline">
            {part.text}
          </ins>
        ) : part.op === "del" ? (
          <del key={i} className="mr-0.5 text-danger-action">
            {part.text}
          </del>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Word-level tracked changes from the base version, grouped by résumé section. */
export function TrackedChanges({ diff }: { diff: Diff }) {
  const counts = (Object.keys(KIND) as Change["kind"][])
    .filter((k) => diff.counts[k])
    .map((k) => `${diff.counts[k]} ${KIND[k]}`);
  const { removed, added } = diff.factChanges;
  return (
    <div>
      <p className="m-0 text-xs text-muted-foreground">
        From your master. {counts.length ? `${counts.join(", ")}.` : "No edits."}{" "}
        {diff.factsUnchanged ? (
          "Dates, titles and numbers unchanged."
        ) : (
          <span className="text-warning">
            Dates, titles or numbers changed:
            {removed.length ? ` removed ${removed.join(", ")}` : ""}
            {removed.length && added.length ? ";" : ""}
            {added.length ? ` added ${added.join(", ")}` : ""}.
          </span>
        )}
      </p>
      <div className="mt-3 space-y-4">
        {diff.sections.map((section) => (
          <div key={section.name}>
            <p className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">{section.name}</p>
            <div className="space-y-2">
              {section.changes.map((change, i) => (
                <p key={i} className="m-0 text-xs leading-relaxed">
                  {change.kind === "moved" ? (
                    <span className="text-muted-foreground">
                      <MoveVertical size={11} className="mr-1 inline" aria-hidden />
                      Line {change.from} → {change.to}:{" "}
                      {change.before === change.after ? (
                        `${change.after?.slice(0, 70)}…`
                      ) : (
                        <Words change={change} />
                      )}
                    </span>
                  ) : (
                    <Words change={change} />
                  )}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
