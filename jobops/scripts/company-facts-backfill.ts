import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../src/db";
import { companyFacts, companyRecords } from "../src/db/schema";
import {
  factProblems,
  previewPatch,
  reviewFileSchema,
  type ReviewItem,
} from "../src/features/companies/backfill";
import { patchCompany } from "../src/features/companies/ingestion";

// One-time, reviewed normalization of company research. `export` lists facts that fail the
// compensation/interview contract; a person fills each item's patch or ambiguity reason;
// `check` validates the reviewed file read-only; `apply` writes it through patchCompany, so every
// change gets the API's validation and an observation snapshot. Nothing is written if any item fails.

type FactRow = typeof companyFacts.$inferSelect;
/** The writable fact fields only; ids and timestamps would fail the strict fact schema. */
const factFields = (fact: FactRow) => ({
  factKey: fact.factKey,
  category: fact.category,
  title: fact.title,
  summary: fact.summary,
  sourceUrl: fact.sourceUrl,
  sourceTitle: fact.sourceTitle ?? undefined,
  sourceKind: fact.sourceKind,
  verificationStatus: fact.verificationStatus,
  data: fact.data,
});

async function exportFile() {
  const rows = await db
    .select({ fact: companyFacts, slug: companyRecords.slug })
    .from(companyFacts)
    .innerJoin(companyRecords, eq(companyRecords.id, companyFacts.companyId))
    .where(inArray(companyFacts.category, ["COMPENSATION", "INTERVIEW"]));
  const items: ReviewItem[] = rows.flatMap(({ fact, slug }) => {
    const problems = factProblems(factFields(fact));
    return problems.length
      ? [
          {
            companySlug: slug,
            factKey: fact.factKey,
            category: fact.category as ReviewItem["category"],
            problems,
            current: fact.data,
            patch: null,
            ambiguous: "Not reviewed yet",
          },
        ]
      : [];
  });
  const day = new Date().toISOString().slice(0, 10);
  await mkdir("data/backfill", { recursive: true });
  const path = `data/backfill/${day}-company-facts.json`;
  await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));
  console.log(`${items.length} of ${rows.length} facts do not conform; written to ${path}`);
}

async function validateFile(path: string) {
  const file = reviewFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const ready = file.items.filter((item) => item.patch);
  const failures: string[] = [];
  for (const item of ready) {
    const [current] = await db
      .select({ fact: companyFacts })
      .from(companyFacts)
      .innerJoin(companyRecords, eq(companyRecords.id, companyFacts.companyId))
      .where(
        and(eq(companyRecords.slug, item.companySlug), eq(companyFacts.factKey, item.factKey)),
      );
    if (!current) {
      failures.push(`${item.companySlug}/${item.factKey}: fact not found`);
      continue;
    }
    const data = previewPatch(current.fact.data, item.patch!);
    const problems = factProblems({ ...factFields(current.fact), data });
    if (problems.length)
      failures.push(`${item.companySlug}/${item.factKey}: ${problems.join("; ")}`);
  }
  return { file, ready, failures };
}

async function run(command: string, path: string) {
  const { file, ready, failures } = await validateFile(path);
  const left = file.items.length - ready.length;
  if (failures.length) {
    console.error(`Nothing written. ${failures.length} items still fail:\n${failures.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  if (command === "check") {
    console.log(`${ready.length} patches conform; ${left} items left for review. Nothing written.`);
    return;
  }
  for (const item of ready)
    await patchCompany(item.companySlug, { facts: [{ factKey: item.factKey, data: item.patch! }] });
  console.log(`${ready.length} facts updated; ${left} left for review.`);
}

const [command, path] = process.argv.slice(2);
try {
  if (command === "export") await exportFile();
  else if ((command === "check" || command === "apply") && path) await run(command, path);
  else
    console.error(
      "Usage: tsx scripts/company-facts-backfill.ts export | check <file> | apply <file>",
    );
} finally {
  await closeDatabase();
}
