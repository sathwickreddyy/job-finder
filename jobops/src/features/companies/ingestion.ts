import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  companyFactObservations,
  companyFacts,
  companyLocations,
  companyRecords,
} from "@/db/schema";
import { CompanyError } from "./http";
import {
  companyBatchSchema,
  companyFilterSchema,
  companyInputSchema,
  companyPatchSchema,
  locationIdentity,
  mergeData,
  normalizeCity,
  normalizeIdentity,
  uniqueNames,
  sourceClassification,
  validateFact,
  type CompanyFilters,
  type CompanyInput,
  type CompanyPatch,
} from "./validation";
export { CompanyError } from "./http";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Store = typeof db | Transaction;
type CompanyRow = typeof companyRecords.$inferSelect;
type FactRow = typeof companyFacts.$inferSelect;
export type CompanyRecord = CompanyRow & {
  locations: (typeof companyLocations.$inferSelect)[];
  facts: (FactRow & { observations?: (typeof companyFactObservations.$inferSelect)[] })[];
};
export type CompanyChanges = { fields: string[]; locations: string[]; facts: string[] };
export type CompanyWriteResult = {
  company: CompanyRecord;
  outcome: "created" | "updated" | "unchanged";
  changes: CompanyChanges;
};

function identityCondition(idOrSlug: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    ? or(eq(companyRecords.id, idOrSlug), eq(companyRecords.slug, idOrSlug))!
    : eq(companyRecords.slug, idOrSlug);
}
async function hydrate(
  store: Store,
  rows: CompanyRow[],
  history = false,
): Promise<CompanyRecord[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [locations, facts] = await Promise.all([
    store
      .select()
      .from(companyLocations)
      .where(inArray(companyLocations.companyId, ids))
      .orderBy(asc(companyLocations.city), asc(companyLocations.locationKey)),
    store
      .select()
      .from(companyFacts)
      .where(inArray(companyFacts.companyId, ids))
      .orderBy(asc(companyFacts.category), asc(companyFacts.factKey)),
  ]);
  const observations =
    history && facts.length
      ? await store
          .select()
          .from(companyFactObservations)
          .where(
            inArray(
              companyFactObservations.factId,
              facts.map((fact) => fact.id),
            ),
          )
          .orderBy(asc(companyFactObservations.observedAt), asc(companyFactObservations.id))
      : [];
  return rows.map((row) => ({
    ...row,
    locations: locations.filter((location) => location.companyId === row.id),
    facts: facts
      .filter((fact) => fact.companyId === row.id)
      .map((fact) =>
        history
          ? {
              ...fact,
              observations: observations.filter((observation) => observation.factId === fact.id),
            }
          : fact,
      ),
  }));
}
export async function getCompany(idOrSlug: string): Promise<CompanyRecord> {
  const rows = await db.select().from(companyRecords).where(identityCondition(idOrSlug)).limit(1);
  if (!rows.length) throw new CompanyError("Company was not found.", 404);
  return (await hydrate(db, rows, true))[0];
}
export async function listCompanies(input: CompanyFilters = {}): Promise<CompanyRecord[]> {
  const filters = companyFilterSchema.parse(input);
  const conditions = [];
  if (filters.status !== "ALL")
    conditions.push(eq(companyRecords.status, filters.status ?? "ACTIVE"));
  if (filters.updatedAfter)
    conditions.push(gt(companyRecords.updatedAt, new Date(filters.updatedAfter)));
  const rows = await db
    .select()
    .from(companyRecords)
    .where(and(...conditions))
    .orderBy(asc(companyRecords.name), asc(companyRecords.slug));
  const companies = await hydrate(db, rows);
  const query = filters.q ? normalizeIdentity(filters.q) : "";
  const city = filters.city ? normalizeIdentity(normalizeCity(filters.city)) : "";
  return companies.filter(
    (company) =>
      (!query ||
        [company.name, ...company.aliases, company.focus].some((text) =>
          normalizeIdentity(text).includes(query),
        )) &&
      (!city || company.locations.some((location) => normalizeIdentity(location.city) === city)),
  );
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object" && !(value instanceof Date))
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function factContent(fact: FactRow) {
  return {
    factKey: fact.factKey,
    category: fact.category,
    title: fact.title,
    summary: fact.summary,
    data: fact.data,
    sourceUrl: fact.sourceUrl,
    sourceTitle: fact.sourceTitle,
    sourceKind: fact.sourceKind,
    verificationStatus: fact.verificationStatus,
    confidence: fact.confidence,
    occurredAt: fact.occurredAt?.toISOString() ?? null,
  };
}
async function audit(
  tx: Transaction,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  await tx.insert(activityLogs).values({ action, entityType, entityId, summary, metadata });
}
async function mergeCompany(
  tx: Transaction,
  input: CompanyInput | CompanyPatch,
  target?: CompanyRow,
): Promise<CompanyWriteResult> {
  const now = new Date();
  const slug = target?.slug ?? (input as CompanyInput).slug;
  const existing =
    target ??
    (await tx.select().from(companyRecords).where(eq(companyRecords.slug, slug)).limit(1))[0];
  const aliases = uniqueNames(
    input.replaceAliases
      ? input.aliases!
      : [
          ...(existing?.aliases ?? []),
          ...(existing &&
          input.name &&
          normalizeIdentity(input.name) !== normalizeIdentity(existing.name)
            ? [existing.name]
            : []),
          ...(input.aliases ?? []),
        ],
  );
  const next = {
    name: input.name ?? existing?.name ?? "",
    aliases,
    focus: input.focus ?? existing?.focus ?? "",
    websiteUrl: input.websiteUrl === undefined ? (existing?.websiteUrl ?? null) : input.websiteUrl,
    careersUrl: input.careersUrl === undefined ? (existing?.careersUrl ?? null) : input.careersUrl,
    portalNote: input.portalNote ?? existing?.portalNote ?? "",
    status:
      input.archive === undefined
        ? (existing?.status ?? "ACTIVE")
        : input.archive
          ? "ARCHIVED"
          : "ACTIVE",
  };
  if (next.status === "ACTIVE") {
    const identities = new Set([next.name, ...aliases].map(normalizeIdentity));
    const active = await tx
      .select()
      .from(companyRecords)
      .where(eq(companyRecords.status, "ACTIVE"));
    const conflict = active.find(
      (row) =>
        row.id !== existing?.id &&
        [row.name, ...row.aliases].some((name) => identities.has(normalizeIdentity(name))),
    );
    if (conflict)
      throw new CompanyError(
        "Name or alias belongs to another active company. Patch its canonical identifier.",
        409,
        { canonicalCompany: { id: conflict.id, slug: conflict.slug, name: conflict.name } },
      );
  }
  const changes: CompanyChanges = { fields: [], locations: [], facts: [] };
  for (const [key, value] of Object.entries(next))
    if (!existing || stable(existing[key as keyof CompanyRow]) !== stable(value))
      changes.fields.push(key);
  const company = existing
    ? (
        await tx
          .update(companyRecords)
          .set({ ...next, updatedAt: now })
          .where(eq(companyRecords.id, existing.id))
          .returning()
      )[0]
    : (
        await tx
          .insert(companyRecords)
          .values({ slug, ...next })
          .returning()
      )[0];
  if (!existing)
    await audit(tx, "company.created", "company", company.id, `Added ${company.name}`, { slug });
  else if (changes.fields.length)
    await audit(
      tx,
      input.archive === true && existing.status !== "ARCHIVED"
        ? "company.archived"
        : "company.updated",
      "company",
      company.id,
      `Updated ${company.name}`,
      { fields: changes.fields },
    );
  const savedLocations = await tx
    .select()
    .from(companyLocations)
    .where(eq(companyLocations.companyId, company.id));
  for (const location of input.locations ?? []) {
    let locationKey = locationIdentity(location);
    let previous = savedLocations.find((row) => row.locationKey === locationKey);
    if (location.state === undefined) {
      const matches = savedLocations.filter(
        (row) =>
          normalizeIdentity(row.city) === normalizeIdentity(normalizeCity(location.city)) &&
          normalizeIdentity(row.country) === normalizeIdentity(location.country ?? "India"),
      );
      if (matches.length > 1)
        throw new CompanyError(
          "Multiple locations match this city and country. Supply state to choose the location.",
        );
      if (matches.length === 1) {
        previous = matches[0];
        locationKey = previous.locationKey;
      }
    }
    const sourceUrl =
      location.sourceUrl === undefined ? (previous?.sourceUrl ?? null) : location.sourceUrl;
    const communitySource = sourceUrl !== null && sourceClassification(sourceUrl) === "LEETCODE";
    const sourceChanged = sourceUrl !== previous?.sourceUrl;
    const verificationStatus =
      location.verificationStatus ??
      (sourceChanged
        ? communitySource
          ? "COMMUNITY_REPORTED"
          : "UNVERIFIED"
        : (previous?.verificationStatus ??
          (communitySource ? "COMMUNITY_REPORTED" : "UNVERIFIED")));
    const content = {
      city: normalizeCity(location.city),
      state: location.state ?? previous?.state ?? "",
      country: location.country ?? previous?.country ?? "India",
      workModes:
        location.workModes === undefined
          ? (previous?.workModes ?? [])
          : [...new Set(location.workModes)],
      isPrimary: location.isPrimary ?? previous?.isPrimary ?? false,
      sourceUrl,
      verificationStatus,
    };
    if (
      content.verificationStatus === "VERIFIED" &&
      (!content.sourceUrl || sourceClassification(content.sourceUrl) === "LEETCODE")
    )
      throw new CompanyError("Verified locations require non-community source evidence.");
    const changed =
      !previous ||
      Object.entries(content).some(
        ([key, value]) => stable(previous[key as keyof typeof previous]) !== stable(value),
      );
    const saved = previous
      ? (
          await tx
            .update(companyLocations)
            .set({ ...content, lastObservedAt: now })
            .where(eq(companyLocations.id, previous.id))
            .returning()
        )[0]
      : (
          await tx
            .insert(companyLocations)
            .values({
              companyId: company.id,
              locationKey,
              ...content,
              firstObservedAt: now,
              lastObservedAt: now,
            })
            .returning()
        )[0];
    const at = savedLocations.findIndex((row) => row.locationKey === locationKey);
    if (at < 0) savedLocations.push(saved);
    else savedLocations[at] = saved;
    if (changed) changes.locations.push(locationKey);
    await audit(
      tx,
      "company.location.observed",
      "company_location",
      saved.id,
      `${company.name}: ${saved.city}`,
      { companyId: company.id, changed },
    );
  }
  const savedFacts = await tx
    .select()
    .from(companyFacts)
    .where(eq(companyFacts.companyId, company.id));
  for (const fact of input.facts ?? []) {
    const previous = savedFacts.find((row) => row.factKey === fact.factKey);
    const previousContent = previous ? factContent(previous) : {};
    const candidate = {
      ...previousContent,
      ...fact,
      data: mergeData(previous?.data ?? {}, fact.data ?? {}),
    };
    // A changed source is reclassified unless the caller explicitly supplies its kind/status.
    if (fact.sourceUrl !== undefined && fact.sourceUrl !== previous?.sourceUrl) {
      if (fact.sourceKind === undefined) delete (candidate as Record<string, unknown>).sourceKind;
      if (fact.verificationStatus === undefined)
        delete (candidate as Record<string, unknown>).verificationStatus;
    } else if (
      fact.sourceKind !== undefined &&
      fact.sourceKind !== previous?.sourceKind &&
      fact.verificationStatus === undefined
    )
      delete (candidate as Record<string, unknown>).verificationStatus;
    const checked = validateFact(candidate);
    const content = {
      factKey: checked.factKey,
      category: checked.category,
      title: checked.title,
      summary: checked.summary ?? "",
      data: checked.data,
      sourceUrl: checked.sourceUrl,
      sourceTitle: checked.sourceTitle ?? "",
      sourceKind: checked.sourceKind,
      verificationStatus: checked.verificationStatus,
      confidence: checked.confidence ?? null,
      occurredAt: checked.occurredAt ? new Date(checked.occurredAt) : null,
    };
    const snapshot = { ...content, occurredAt: content.occurredAt?.toISOString() ?? null };
    const changed = !previous || stable(previousContent) !== stable(snapshot);
    const saved = previous
      ? (
          await tx
            .update(companyFacts)
            .set({ ...content, lastObservedAt: now, ...(changed ? { updatedAt: now } : {}) })
            .where(eq(companyFacts.id, previous.id))
            .returning()
        )[0]
      : (
          await tx
            .insert(companyFacts)
            .values({
              companyId: company.id,
              ...content,
              firstObservedAt: now,
              lastObservedAt: now,
            })
            .returning()
        )[0];
    const at = savedFacts.findIndex((row) => row.factKey === fact.factKey);
    if (at < 0) savedFacts.push(saved);
    else savedFacts[at] = saved;
    if (changed) {
      changes.facts.push(fact.factKey);
      await tx
        .insert(companyFactObservations)
        .values({ factId: saved.id, snapshot, observedAt: now });
    }
    await audit(
      tx,
      "company.fact.observed",
      "company_fact",
      saved.id,
      `${company.name}: ${saved.title}`,
      { companyId: company.id, factKey: saved.factKey, changed },
    );
  }
  const changed = changes.fields.length + changes.locations.length + changes.facts.length > 0;
  if (existing && !changes.fields.length)
    await audit(tx, "company.observed", "company", company.id, `Observed ${company.name}`, {
      changed,
    });
  return {
    company: (await hydrate(tx, [company], true))[0],
    outcome: existing ? (changed ? "updated" : "unchanged") : "created",
    changes: {
      fields: [...new Set(changes.fields)],
      locations: [...new Set(changes.locations)],
      facts: [...new Set(changes.facts)],
    },
  };
}
async function locked<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741021, 1)`);
    return work(tx);
  });
}
export async function upsertCompany(value: unknown): Promise<CompanyWriteResult> {
  const input = companyInputSchema.parse(value);
  return locked((tx) => mergeCompany(tx, input));
}
export async function patchCompany(idOrSlug: string, value: unknown): Promise<CompanyWriteResult> {
  const input = companyPatchSchema.parse(value);
  return locked(async (tx) => {
    const company = (
      await tx.select().from(companyRecords).where(identityCondition(idOrSlug)).limit(1)
    )[0];
    if (!company) throw new CompanyError("Company was not found.", 404);
    return mergeCompany(tx, input, company);
  });
}
export async function ingestCompanyBatch(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { companies?: unknown }).companies) &&
    (value as { companies: unknown[] }).companies.length > 100
  )
    throw new CompanyError("A batch accepts at most 100 companies.", 413);
  const input = companyBatchSchema.parse(value);
  return locked(async (tx) => {
    const results: CompanyWriteResult[] = [];
    for (const company of input.companies) results.push(await mergeCompany(tx, company));
    return {
      created: results.filter((result) => result.outcome === "created").length,
      updated: results.filter((result) => result.outcome === "updated").length,
      unchanged: results.filter((result) => result.outcome === "unchanged").length,
      companies: results.map((result) => result.company),
      results,
    };
  });
}
