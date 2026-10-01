import { z, ZodError } from "zod";
import {
  companyInputSchema,
  companyPatchSchema,
  factDataSchemas,
  fullFactSchema,
} from "./validation";
export class CompanyError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export const companyHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export function companyResponse(value: unknown, status = 200) {
  return Response.json(value, { status, headers: companyHeaders });
}
export function companyApiError(error: unknown) {
  if (error instanceof CompanyError)
    return companyResponse({ error: error.message, ...error.details }, error.status);
  if (error instanceof ZodError)
    return companyResponse(
      {
        error: "Invalid company payload.",
        issues: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      },
      400,
    );
  if (error instanceof SyntaxError) return companyResponse({ error: "Malformed JSON body." }, 400);
  const code =
    (error as { code?: string; cause?: { code?: string } } | null)?.code ??
    (error as { cause?: { code?: string } } | null)?.cause?.code;
  if (code === "23505") return companyResponse({ error: "Company identity already exists." }, 409);
  return companyResponse(
    { error: "Company data could not be stored. Check the local database and retry." },
    500,
  );
}
export async function companyJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new CompanyError("Send application/json.", 415);
  const limit = 512 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new CompanyError("Request exceeds 512 KiB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CompanyError("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new CompanyError("Request exceeds 512 KiB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export function companyContract() {
  const schema = (value: z.ZodType) => z.toJSONSchema(value, { io: "input" });
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const timestamp = { type: "string", format: "date-time" };
  const typedData = Object.fromEntries(
    Object.entries(factDataSchemas).map(([key, value]) => [`${key}Data`, schema(value)]),
  );
  const factPatch = schema(
    fullFactSchema.partial().extend({ factKey: fullFactSchema.shape.factKey }),
  );
  factPatch.properties!.data = {
    type: "object",
    additionalProperties: true,
    description:
      "JSON only, at most 20 nesting levels; unsafe prototype keys rejected. Nested objects merge recursively, arrays replace.",
  };
  const categoryRules = Object.keys(factDataSchemas).map((category) => ({
    if: { properties: { category: { const: category } }, required: ["category"] },
    then: { properties: { data: ref(`${category}Data`) } },
  }));
  const newFact = {
    ...factPatch,
    required: ["factKey", "category", "title", "sourceUrl"],
    allOf: categoryRules,
  };
  const input = schema(companyInputSchema);
  const patch = schema(companyPatchSchema);
  input.properties!.facts = {
    type: "array",
    maxItems: 1000,
    items: ref("FactPatch"),
    description:
      "New keys require category/title/sourceUrl; existing keys support partial updates.",
  };
  patch.properties!.facts = input.properties!.facts;
  const batch = {
    type: "object",
    additionalProperties: false,
    required: ["companies"],
    properties: {
      companies: { type: "array", minItems: 1, maxItems: 100, items: ref("CompanyInput") },
    },
  };
  const observation = {
    type: "object",
    required: ["id", "factId", "snapshot", "observedAt"],
    properties: {
      id: { type: "string", format: "uuid" },
      factId: { type: "string", format: "uuid" },
      snapshot: { type: "object", additionalProperties: true },
      observedAt: timestamp,
    },
  };
  const fact = {
    ...newFact,
    additionalProperties: true,
    properties: {
      ...factPatch.properties,
      id: { type: "string", format: "uuid" },
      companyId: { type: "string", format: "uuid" },
      firstObservedAt: timestamp,
      lastObservedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      observations: { type: "array", items: ref("Observation") },
    },
  };
  const location = {
    type: "object",
    required: [
      "id",
      "companyId",
      "locationKey",
      "city",
      "state",
      "country",
      "workModes",
      "isPrimary",
      "verificationStatus",
      "firstObservedAt",
      "lastObservedAt",
    ],
    properties: {
      id: { type: "string", format: "uuid" },
      companyId: { type: "string", format: "uuid" },
      locationKey: { type: "string" },
      city: { type: "string" },
      state: { type: "string" },
      country: { type: "string" },
      workModes: {
        type: "array",
        items: { type: "string", enum: ["ONSITE", "HYBRID", "REMOTE", "UNKNOWN"] },
      },
      isPrimary: { type: "boolean" },
      sourceUrl: { type: ["string", "null"] },
      verificationStatus: {
        type: "string",
        enum: ["VERIFIED", "COMMUNITY_REPORTED", "UNVERIFIED", "STALE"],
      },
      firstObservedAt: timestamp,
      lastObservedAt: timestamp,
    },
  };
  const company = {
    type: "object",
    required: [
      "id",
      "slug",
      "name",
      "aliases",
      "focus",
      "websiteUrl",
      "careersUrl",
      "portalNote",
      "status",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      id: { type: "string", format: "uuid" },
      slug: { type: "string" },
      name: { type: "string" },
      aliases: { type: "array", items: { type: "string" } },
      focus: { type: "string" },
      websiteUrl: { type: ["string", "null"] },
      careersUrl: { type: ["string", "null"] },
      portalNote: { type: "string" },
      status: { type: "string", enum: ["ACTIVE", "ARCHIVED"] },
      createdAt: timestamp,
      updatedAt: timestamp,
      locations: { type: "array", items: ref("Location") },
      facts: { type: "array", items: ref("Fact") },
    },
  };
  const writeResult = {
    ...company,
    properties: {
      ...company.properties,
      outcome: { type: "string", enum: ["created", "updated", "unchanged"] },
      changes: {
        type: "object",
        properties: {
          fields: { type: "array", items: { type: "string" } },
          locations: { type: "array", items: { type: "string" } },
          facts: { type: "array", items: { type: "string" } },
        },
      },
    },
  };
  const jsonResponse = (name: string, description: string) => ({
    description,
    content: { "application/json": { schema: ref(name) } },
  });
  const response = jsonResponse(
    "Company",
    "Canonical company. Detail includes locations, facts and fact observations.",
  );
  const writeResponse = jsonResponse(
    "CompanyWriteResult",
    "Canonical company with changed field/location/fact keys and created/updated/unchanged outcome.",
  );
  const errors = Object.fromEntries(
    [400, 404, 409, 413, 415, 500].map((code) => [
      code,
      jsonResponse(
        "Error",
        (
          {
            400: "Invalid payload or merged fact",
            404: "Company missing",
            409: "Identity conflict; canonicalCompany is returned",
            413: "Body over 512 KiB or batch over 100",
            415: "JSON content type required",
            500: "Storage failure",
          } as Record<number, string>
        )[code],
      ),
    ]),
  );
  const body = (name: string) => ({
    required: true,
    content: { "application/json": { schema: ref(name) } },
  });
  const identifier = { name: "idOrSlug", in: "path", required: true, schema: { type: "string" } };
  return {
    openapi: "3.1.0",
    info: {
      title: "JobOps Company Ingestion",
      version: "1.0.0",
      description:
        "Trusted single-user LAN API. No ingestion token. Browser Origin, when present, must match host; public deployments retain configured authentication. Body limit 512 KiB. Omitted fields preserve existing values. Slug is immutable. Aliases merge unless replaceAliases:true; renames retain the previous name as an alias. Locations merge by normalized city/state/country (Bangalore becomes Bengaluru); omitted state matches one existing city/country, ambiguity returns 400. Facts merge by factKey; data objects merge recursively, arrays replace. New facts require category/title/sourceUrl. Only official sources default VERIFIED; community and LeetCode cannot be VERIFIED, regardless of claimed sourceKind. LINKEDIN defaults UNVERIFIED. Identical fact ingestion advances lastObservedAt without adding observations; content changes append snapshots. No deletion; archive:true archives and archive:false restores. Batches are atomic. Never submit portal passwords, cookies or credentials.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/api/v1/companies": {
        get: {
          operationId: "listCompanies",
          parameters: [
            { name: "city", in: "query", schema: { type: "string" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["ACTIVE", "ARCHIVED", "ALL"], default: "ACTIVE" },
            },
            { name: "q", in: "query", schema: { type: "string" } },
            {
              name: "updatedAfter",
              in: "query",
              schema: { type: "string", description: "ISO date or timestamp" },
            },
            {
              name: "include",
              in: "query",
              schema: {
                type: "string",
                description:
                  "facts,locations; both included by default; supply one to omit the other",
              },
            },
          ],
          responses: {
            200: jsonResponse("CompanyCollection", "Deterministically ordered collection"),
            ...errors,
          },
        },
        post: {
          operationId: "upsertCompany",
          requestBody: body("CompanyInput"),
          responses: { 200: writeResponse, 201: writeResponse, ...errors },
        },
      },
      "/api/v1/companies/{idOrSlug}": {
        get: {
          operationId: "getCompany",
          parameters: [identifier],
          responses: { 200: response, ...errors },
        },
        patch: {
          operationId: "patchCompany",
          parameters: [identifier],
          requestBody: body("CompanyPatch"),
          responses: { 200: writeResponse, ...errors },
        },
      },
      "/api/v1/companies/batch": {
        post: {
          operationId: "ingestCompanyBatch",
          requestBody: body("CompanyBatch"),
          responses: {
            200: jsonResponse("BatchResult", "Atomic batch counts and canonical companies"),
            ...errors,
          },
        },
      },
      "/api/v1/companies/schema": {
        get: {
          operationId: "companySchema",
          responses: { 200: { description: "This self-contained OpenAPI 3.1 contract" } },
        },
      },
    },
    components: {
      schemas: {
        CompanyInput: input,
        CompanyPatch: patch,
        CompanyBatch: batch,
        FactPatch: { ...factPatch, allOf: categoryRules },
        NewFact: newFact,
        ...typedData,
        Fact: fact,
        Location: location,
        Observation: observation,
        Company: company,
        CompanyWriteResult: writeResult,
        CompanyCollection: {
          type: "object",
          required: ["companies"],
          properties: { companies: { type: "array", items: ref("Company") } },
        },
        BatchResult: {
          type: "object",
          required: ["created", "updated", "unchanged", "companies", "results"],
          properties: {
            created: { type: "integer" },
            updated: { type: "integer" },
            unchanged: { type: "integer" },
            companies: { type: "array", items: ref("Company") },
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  company: ref("Company"),
                  outcome: writeResult.properties.outcome,
                  changes: writeResult.properties.changes,
                },
              },
            },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: { path: { type: "string" }, message: { type: "string" } },
              },
            },
            canonicalCompany: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                slug: { type: "string" },
                name: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}
