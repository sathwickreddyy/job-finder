import type { ReactNode } from "react";
import { displayDate, type DisplayPreferences } from "@/features/candidate/preferences";
import {
  compensationAmount,
  interviewQuestions,
  publicationYear,
  recentResearchFacts,
  researchConversationKey,
  researchLabel,
  researchUrl,
  type ResearchFact,
} from "./research-data";

function ResearchValue({ value }: { value: unknown }) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && !value.length)
  )
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
            <dt className="inline capitalize text-muted-foreground">{researchLabel(key)}: </dt>
            <dd className="inline">
              <ResearchValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (typeof value === "number") return <>{value.toLocaleString("en-IN")}</>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  return <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{String(value)}</span>;
}

function ResearchTable({
  title,
  columns,
  empty,
  children,
}: {
  title: string;
  columns: string[];
  empty?: string;
  children?: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-base font-semibold">{title}</h3>
      <div
        tabIndex={0}
        role="region"
        aria-label={title + " table, scroll horizontally"}
        className="max-w-full overflow-x-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-background text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border [&_td]:min-w-28 [&_td]:max-w-sm [&_td]:px-4 [&_td]:py-4 [&_td]:align-top">
            {children ?? (
              <tr>
                <td colSpan={columns.length} className="text-muted-foreground">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Reference({ fact, preferences }: { fact: ResearchFact; preferences: DisplayPreferences }) {
  const url = researchUrl(fact.sourceUrl);
  return (
    <div className="min-w-40 space-y-2">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link [overflow-wrap:anywhere]"
        >
          {fact.sourceTitle || new URL(url).hostname}
        </a>
      ) : (
        <span>Source link unavailable</span>
      )}
      <p className="text-xs capitalize text-muted-foreground">
        {researchLabel(fact.verificationStatus)} · {researchLabel(fact.sourceKind)}
      </p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Source dates</summary>
        <div className="mt-2 space-y-1">
          {typeof fact.data.publishedAt === "string" && (
            <p>Published {fact.data.publishedAt.slice(0, 10)}</p>
          )}
          {fact.occurredAt && <p>Reported event {displayDate(fact.occurredAt, preferences)}</p>}
          <p>First seen {displayDate(fact.firstObservedAt, preferences)}</p>
          <p>Last seen {displayDate(fact.lastObservedAt, preferences)}</p>
        </div>
      </details>
    </div>
  );
}

function Report({ fact }: { fact: ResearchFact }) {
  return (
    <div className="min-w-44 space-y-2">
      <p className="font-medium">{fact.title}</p>
      <p>
        <ResearchValue value={fact.data.role ?? fact.data.title} />
        {fact.data.level ? (
          <>
            {" "}
            · <ResearchValue value={fact.data.level} />
          </>
        ) : null}
      </p>
      {fact.summary && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {fact.summary}
        </p>
      )}
      {Object.keys(fact.data).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-link">All report details</summary>
          <div className="mt-2 space-y-1">
            <ResearchValue value={fact.data} />
          </div>
        </details>
      )}
    </div>
  );
}

function Pay({ value, currency }: { value: unknown; currency: unknown }) {
  return (
    <div className="whitespace-nowrap">
      <span>{compensationAmount(value, currency)}</span>
      {typeof value === "number" &&
        typeof currency === "string" &&
        currency.toUpperCase() === "INR" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {(value / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} lakh
          </p>
        )}
    </div>
  );
}

function Rounds({ fact }: { fact: ResearchFact }) {
  const rounds = Array.isArray(fact.data.rounds) ? fact.data.rounds : [];
  return (
    <div className="min-w-56 space-y-3">
      {fact.data.roundCount !== undefined && (
        <p>
          <ResearchValue value={fact.data.roundCount} /> rounds reported
        </p>
      )}
      {rounds.length ? (
        <ol className="list-inside list-decimal space-y-3">
          {rounds.map((round, index) => {
            const data =
              round && typeof round === "object" ? (round as Record<string, unknown>) : {};
            return (
              <li key={index}>
                {typeof round === "string" ? (
                  round
                ) : (
                  <>
                    <span className="font-medium">
                      <ResearchValue value={data.name ?? data.title ?? "Round " + (index + 1)} />
                    </span>
                    {data.durationMinutes !== undefined && (
                      <>
                        {" "}
                        · <ResearchValue value={data.durationMinutes} /> min
                      </>
                    )}
                    {data.summary ? (
                      <p className="mt-1">
                        <ResearchValue value={data.summary} />
                      </p>
                    ) : null}
                    {Array.isArray(data.topics) && data.topics.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <ResearchValue value={data.topics} />
                      </div>
                    )}
                    {researchUrl(data.referenceUrl) && (
                      <a
                        href={researchUrl(data.referenceUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-xs text-link"
                      >
                        Round reference
                      </a>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-muted-foreground">Round details not recorded</p>
      )}
      {Array.isArray(fact.data.topics) && fact.data.topics.length > 0 && (
        <div className="text-xs">
          <p className="mb-1 text-muted-foreground">Topics</p>
          <ResearchValue value={fact.data.topics} />
        </div>
      )}
    </div>
  );
}

export function CompanyResearch({
  facts,
  preferences,
}: {
  facts: ResearchFact[];
  preferences: DisplayPreferences;
}) {
  const visibleFacts = recentResearchFacts(facts);
  const conversationCount = new Set(
    visibleFacts.filter((fact) => fact.sourceKind !== "OFFICIAL").map(researchConversationKey),
  ).size;
  const totalConversations = new Set(
    facts.filter((fact) => fact.sourceKind !== "OFFICIAL").map(researchConversationKey),
  ).size;
  const compensation = visibleFacts.filter((fact) => fact.category === "COMPENSATION");
  const interviews = visibleFacts.filter((fact) => fact.category === "INTERVIEW");
  const questions = interviews.flatMap((fact) =>
    interviewQuestions(fact).map((question) => ({ fact, question })),
  );
  const otherCategories = [
    ...new Set(
      visibleFacts
        .filter((fact) => !["COMPENSATION", "INTERVIEW"].includes(fact.category))
        .map((fact) => fact.category),
    ),
  ];
  return (
    <section className="min-w-0 space-y-7" aria-label="Company research">
      <p className="text-sm text-muted-foreground">
        {visibleFacts.length
          ? `${conversationCount} community ${conversationCount === 1 ? "conversation" : "conversations"}${totalConversations > conversationCount ? ` shown of ${totalConversations} saved` : ""}. `
          : "No sourced research saved yet. "}
        Interviews first; newest publication first. Up to 10 community conversations per company.
        Official evidence is separate. Missing details stay unrecorded; community reports are
        labelled. Scroll across each table for all columns.
      </p>
      <ResearchTable
        title="Interview details"
        columns={[
          "Published year",
          "Report / role / level",
          "Application route",
          "Rounds & topics",
          "Outcome",
          "Reference",
        ]}
        empty="No interview reports recorded."
      >
        {interviews.length
          ? interviews.map((fact) => (
              <tr key={fact.id}>
                <td>{publicationYear(fact.data)}</td>
                <td>
                  <Report fact={fact} />
                </td>
                <td>
                  <ResearchValue value={fact.data.applicationRoute} />
                </td>
                <td>
                  <Rounds fact={fact} />
                </td>
                <td>
                  <ResearchValue value={fact.data.outcome} />
                </td>
                <td>
                  <Reference fact={fact} preferences={preferences} />
                </td>
              </tr>
            ))
          : undefined}
      </ResearchTable>
      <ResearchTable
        title="Interview questions"
        columns={[
          "Published year",
          "Report / role / level",
          "Round",
          "Question",
          "Topic",
          "Question reference",
          "Report source",
        ]}
        empty="No interview questions recorded."
      >
        {questions.length
          ? questions.map(({ fact, question }, index) => (
              <tr key={fact.id + ":" + index}>
                <td>{publicationYear(fact.data)}</td>
                <td>
                  <p className="font-medium">{fact.title}</p>
                  <ResearchValue value={fact.data.role} />
                  {fact.data.level ? (
                    <>
                      {" "}
                      · <ResearchValue value={fact.data.level} />
                    </>
                  ) : null}
                </td>
                <td>
                  <ResearchValue value={question.round} />
                </td>
                <td>
                  <div className="min-w-64">
                    <ResearchValue value={question.text} />
                  </div>
                </td>
                <td>
                  <ResearchValue value={question.topic} />
                </td>
                <td>
                  <a
                    href={question.referenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link"
                  >
                    {question.referenceUrl === fact.sourceUrl ? "View in report" : "View question"}
                  </a>
                </td>
                <td>
                  <Reference fact={fact} preferences={preferences} />
                </td>
              </tr>
            ))
          : undefined}
      </ResearchTable>
      <div className="space-y-3">
        <ResearchTable
          title="Compensation"
          columns={[
            "Published year",
            "Report / role / level",
            "Experience (years)",
            "Fixed / year",
            "Variable / year",
            "Joining bonus",
            "Equity (as reported)",
            "Total / year",
            "Reference",
          ]}
          empty="No compensation reports recorded."
        >
          {compensation.length
            ? compensation.map((fact) => (
                <tr key={fact.id}>
                  <td>{publicationYear(fact.data)}</td>
                  <td>
                    <Report fact={fact} />
                  </td>
                  <td>
                    <ResearchValue value={fact.data.yearsExperience} />
                  </td>
                  {["fixedAnnual", "variableAnnual", "joiningBonus", "equity", "totalAnnual"].map(
                    (key) => {
                      // Stock grants carry their own currency and are never converted.
                      const grant =
                        key === "equity" && fact.data.equity && typeof fact.data.equity === "object"
                          ? (fact.data.equity as Record<string, unknown>)
                          : undefined;
                      return (
                        <td key={key}>
                          <Pay
                            value={grant ? grant.amount : fact.data[key]}
                            currency={grant ? grant.currency : fact.data.currency}
                          />
                        </td>
                      );
                    },
                  )}
                  <td>
                    <Reference fact={fact} preferences={preferences} />
                  </td>
                </tr>
              ))
            : undefined}
        </ResearchTable>
        <p className="text-xs text-muted-foreground">
          Annual INR amounts are shown in rupees and lakh (1 lakh/year = 1 LPA). Joining bonus is
          one-time; equity follows the source’s stated value and vesting period. Totals are
          recorded, never estimated.
        </p>
      </div>
      {otherCategories.map((category) => (
        <ResearchTable
          key={category}
          title={researchLabel(category).replace(/^./, (char) => char.toUpperCase())}
          columns={["Published year", "Report", "Details", "Reference"]}
        >
          {visibleFacts
            .filter((fact) => fact.category === category)
            .map((fact) => (
              <tr key={fact.id}>
                <td>{publicationYear(fact.data)}</td>
                <td>
                  <p className="min-w-44 font-medium">{fact.title}</p>
                  {fact.summary && (
                    <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {fact.summary}
                    </p>
                  )}
                </td>
                <td>
                  <div className="min-w-56">
                    <ResearchValue value={fact.data} />
                  </div>
                </td>
                <td>
                  <Reference fact={fact} preferences={preferences} />
                </td>
              </tr>
            ))}
        </ResearchTable>
      ))}
    </section>
  );
}
