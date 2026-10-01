import type { companyFacts } from "@/db/schema";
import { displayDate, type DisplayPreferences } from "@/features/candidate/preferences";

const label = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();

function ResearchValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">Not recorded</span>;
  if (Array.isArray(value))
    return (
      <ul className="list-inside list-disc space-y-1">
        {value.map((item, index) => (
          <li key={index}>
            <ResearchValue value={item} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl className="space-y-1">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt className="inline text-muted-foreground">{label(key)}: </dt>
            <dd className="inline">
              <ResearchValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (typeof value === "number") return <>{value.toLocaleString("en-IN")}</>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  return (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {String(value)}
    </span>
  );
}

export function CompanyResearch({
  facts,
  preferences,
}: {
  facts: (typeof companyFacts.$inferSelect)[];
  preferences: DisplayPreferences;
}) {
  if (!facts.length) return null;
  const categories = [...new Set(facts.map((fact) => fact.category))];
  return (
    <section className="space-y-4 border-t border-border pt-4" aria-label="Company research">
      <h3 className="text-sm font-semibold">
        Company research · {facts.length} sourced {facts.length === 1 ? "note" : "notes"}
      </h3>
      {categories.map((category) => (
        <div key={category} className="space-y-3">
          <h4 className="text-xs font-semibold capitalize text-muted-foreground">
            {label(category)}
          </h4>
          {facts
            .filter((fact) => fact.category === category)
            .map((fact) => (
              <div key={fact.id} className="min-w-0 rounded-xl bg-background p-3 text-sm">
                <p className="font-medium">{fact.title}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {label(fact.verificationStatus)} · {label(fact.sourceKind)}
                </p>
                {fact.summary && (
                  <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {fact.summary}
                  </p>
                )}
                {Object.keys(fact.data).length > 0 && (
                  <div className="mt-3">
                    <ResearchValue value={fact.data} />
                  </div>
                )}
                <a
                  href={fact.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block break-all text-xs text-link"
                >
                  {fact.sourceTitle || new URL(fact.sourceUrl).hostname}
                </a>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fact.occurredAt && (
                    <>Reported event {displayDate(fact.occurredAt, preferences)} · </>
                  )}
                  First seen {displayDate(fact.firstObservedAt, preferences)} · Last seen{" "}
                  {displayDate(fact.lastObservedAt, preferences)}
                </p>
              </div>
            ))}
        </div>
      ))}
    </section>
  );
}
