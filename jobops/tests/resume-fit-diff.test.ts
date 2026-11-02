import { describe, expect, it } from "vitest";
import { diffResumes, splitSections, wordDiff } from "@/features/resumes/fit/diff";

const base = `Asha Example
Senior Software Engineer | Backend Services
asha@example.invalid | Bengaluru, India
PROFESSIONAL SUMMARY
Senior engineer with 6 years building backend services in Java and Python, with event-driven
workflows on AWS.
CORE SKILLS
Languages: Java, Python, SQL
Cloud: AWS (S3, SQS, ECS), Docker,
Terraform
PROFESSIONAL EXPERIENCE
Example Bank July 2023 – Present
Senior Software Engineer Bengaluru, India
• Lead a team of four engineers building payment services.
• Designed a reconciliation framework, reducing delivery time by approximately 72% across
business modules.
• Built Kafka consumers for ledger events.
Example Retail February 2020 – June 2023
Software Engineer Bengaluru, India
• Built reusable AWS Step Functions workflows for order processing.
• Reduced SQL query time by approximately 43%.
• Maintained internal dashboards for operations teams.
EDUCATION
B.Tech in Computer Science, Example University 2020
`;

const edit = (from: string, to: string, text = base) => {
  if (!text.includes(from)) throw new Error(`fixture lacks ${from}`);
  return text.replace(from, to);
};

describe("splitSections", () => {
  it("names sections and splits experience by employer", () => {
    const sections = splitSections(base);
    expect(sections.map((s) => s.name)).toEqual([
      "Title line",
      "Summary",
      "Skills",
      "Example Bank",
      "Example Retail",
      "Education",
    ]);
    expect(sections[2].units).toEqual([
      "Languages: Java, Python, SQL",
      "Cloud: AWS (S3, SQS, ECS), Docker, Terraform",
    ]);
    expect(sections[3].units[2]).toBe(
      "• Designed a reconciliation framework, reducing delivery time by approximately 72% across business modules.",
    );
  });

  it("groups an employer line without dates with its dated role lines", () => {
    const text = edit(
      "Example Retail February 2020 – June 2023\nSoftware Engineer Bengaluru, India",
      "Example Retail Hyderabad, India\nSoftware Engineer July 2021 – June 2023\nIntern January 2021 – June 2021",
    );
    const sections = splitSections(text);
    expect(sections.map((s) => s.name)).toEqual([
      "Title line",
      "Summary",
      "Skills",
      "Example Bank",
      "Example Retail",
      "Education",
    ]);
    expect(sections[3].units.at(-1)).toBe("• Built Kafka consumers for ledger events.");
    expect(sections[4].units.slice(0, 2)).toEqual([
      "Software Engineer July 2021 – June 2023",
      "Intern January 2021 – June 2021",
    ]);
  });
});

describe("diffResumes", () => {
  it("a reworded bullet is one reworded change", () => {
    const mine = edit(
      "Built Kafka consumers for ledger",
      "Built Kafka consumers in Java for ledger",
    );
    const diff = diffResumes(base, mine);
    expect(diff.counts).toEqual({ reworded: 1, moved: 0, added: 0, dropped: 0 });
    expect(diff.sections).toEqual([
      {
        name: "Example Bank",
        changes: [
          {
            kind: "reworded",
            where: "Example Bank",
            before: "• Built Kafka consumers for ledger events.",
            after: "• Built Kafka consumers in Java for ledger events.",
          },
        ],
      },
    ]);
  });

  it("a moved bullet reports from and to", () => {
    const mine = edit(
      "• Built reusable AWS Step Functions workflows for order processing.\n• Reduced SQL query time by approximately 43%.",
      "• Reduced SQL query time by approximately 43%.\n• Built reusable AWS Step Functions workflows for order processing.",
    );
    const diff = diffResumes(base, mine);
    expect(diff.counts.moved).toBe(1);
    expect(diff.counts.reworded + diff.counts.added + diff.counts.dropped).toBe(0);
    const [change] = diff.sections[0].changes;
    expect(change).toMatchObject({ kind: "moved", where: "Example Retail" });
    expect([change.from, change.to].sort()).toEqual([2, 3]);
  });

  it("a dropped bullet", () => {
    const mine = edit("• Maintained internal dashboards for operations teams.\n", "");
    const diff = diffResumes(base, mine);
    expect(diff.counts).toEqual({ reworded: 0, moved: 0, added: 0, dropped: 1 });
    expect(diff.sections[0].changes[0]).toMatchObject({
      kind: "dropped",
      before: "• Maintained internal dashboards for operations teams.",
      after: null,
    });
  });

  it("wrapped lines join into one unit", () => {
    const mine = edit(
      "reducing delivery time by approximately 72% across\nbusiness modules.",
      "reducing delivery time\nby approximately 72% across business modules.",
    );
    expect(diffResumes(base, mine).sections).toEqual([]);
  });

  it("factsUnchanged false when a digit changes", () => {
    const diff = diffResumes(base, edit("approximately 72%", "approximately 75%"));
    expect(diff.factsUnchanged).toBe(false);
    expect(diff.factChanges).toEqual({ removed: ["72%"], added: ["75%"] });
  });

  it("factsUnchanged true for rewording only", () => {
    const diff = diffResumes(base, edit("Lead a team of four", "Lead a backend team of four"));
    expect(diff.factsUnchanged).toBe(true);
    expect(diff.counts.reworded).toBe(1);
  });

  it("ignores the extractor's page markers", () => {
    const paged = edit(
      "• Built Kafka consumers for ledger events.",
      "• Built Kafka consumers for ledger\n-- 1 of 2 --\nevents.",
    );
    const diff = diffResumes(paged, `${base}-- 2 of 2 --\n`);
    expect(diff.sections).toEqual([]);
    expect(diff.factsUnchanged).toBe(true);
  });

  it("factsUnchanged false when a month changes", () =>
    expect(diffResumes(base, edit("July 2023", "June 2023")).factsUnchanged).toBe(false));
});

describe("wordDiff", () => {
  it("marks inserted and removed words", () =>
    expect(wordDiff("Built Kafka consumers", "Built Java consumers")).toEqual([
      { op: "same", text: "Built " },
      { op: "del", text: "Kafka" },
      { op: "ins", text: "Java" },
      { op: "same", text: " consumers" },
    ]));
});
