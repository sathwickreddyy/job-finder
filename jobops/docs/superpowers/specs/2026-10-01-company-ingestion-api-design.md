# Company Ingestion API Design

**Date:** 2026-10-01  
**Status:** Implemented and verified

**Scope:** Persist company research and expose local-network REST endpoints that hydrate the JobOps Companies experience.

## Intent

JobOps currently renders eight companies from a TypeScript catalog. Browser research and command-line crawlers need a stable way to add companies and merge new findings without editing source code. The API will be called with `curl` by tools on the user's machine or trusted local network. Saved data will immediately feed the Companies page while existing jobs, applications, and resume usage remain the source of truth for the user's activity.

The first version is a single-user, trusted-LAN feature. It does not add an ingestion token, user accounts, automated crawling, portal login storage, automatic applications, or a delete endpoint.

## Network and Trust Boundary

- `npm run dev` and `npm run start` bind JobOps to `0.0.0.0:3210` so another device on the local network can reach it through the host machine's LAN address.
- JobOps accepts its existing loopback hostnames plus private IPv4 LAN addresses and local IPv6 addresses on port 3210.
- Company API `POST` and `PATCH` requests may omit `Origin`, which permits ordinary `curl` calls. Requests that include `Origin` must be same-origin with the requested JobOps host.
- Private-network mode does not require `JOBOPS_ACCESS_TOKEN`. The network is the trust boundary: any device that can reach port 3210 can read and write JobOps data.
- The existing access-token behavior remains available for a deployment configured with a public hostname. Public deployment guidance continues to require HTTPS and authentication.
- Request bodies are limited to 512 KiB, must use `application/json`, and never accept external-site credentials, cookies, or arbitrary files.

## Data Model

### `companies`

One canonical row per organization:

- `id`: UUID primary key.
- `slug`: unique, stable lowercase identifier used for idempotent ingestion.
- `name`: display name.
- `aliases`: JSON string array used to match imported jobs and applications.
- `focus`: short description such as `Payments & financial technology`.
- `website_url`: optional official homepage.
- `careers_url`: optional official careers portal.
- `portal_note`: concise instruction for using the careers portal.
- `status`: `ACTIVE` or `ARCHIVED`.
- `created_at`, `updated_at`.

Names, aliases, and URLs are normalized before persistence. A company name or alias cannot silently become an alias of two active companies.

### `company_locations`

Repeatable, queryable presence records:

- `id`, `company_id`.
- `city`, `state`, `country`.
- `work_modes`: JSON string array containing known values such as `ONSITE`, `HYBRID`, `REMOTE`, or `UNKNOWN`.
- `is_primary`.
- `source_url`, `verification_status`.
- `first_observed_at`, `last_observed_at`.

The unique identity is company plus normalized city/state/country. `Bangalore` is normalized to `Bengaluru` for matching and display.

### `company_facts`

Repeatable sourced research. A fact has stable columns for filtering and a flexible JSON payload for category-specific information:

- `id`, `company_id`.
- `fact_key`: caller-provided stable identifier, unique within a company.
- `category`: one of `COMPENSATION`, `INTERVIEW`, `TECH_STACK`, `ROLE`, `WORK_MODE`, `REFERRAL`, `CULTURE`, `HIRING_SIGNAL`, or `OTHER`.
- `title`, `summary`.
- `data`: JSON object whose schema is validated according to `category` when a typed schema exists.
- `source_url`, `source_title`.
- `source_kind`: `OFFICIAL`, `LEETCODE`, `LINKEDIN`, `COMMUNITY`, or `OTHER`.
- `verification_status`: `VERIFIED`, `COMMUNITY_REPORTED`, `UNVERIFIED`, or `STALE`.
- `confidence`: optional value from 0 to 1.
- `occurred_at`: optional date of an offer, interview, opening, or other event.
- `first_observed_at`, `last_observed_at`, `created_at`, `updated_at`.

LeetCode content defaults to `COMMUNITY_REPORTED`. Only official sources default to `VERIFIED`; callers may explicitly lower but may not automatically elevate a community source to verified.

Typed payloads include:

- Compensation: role/level, years of experience, currency, fixed pay, variable pay, joining bonus, equity, total compensation, vesting notes, and offer date.
- Interview: role/level, outcome, round count, round summaries, topics, questions, and application route.
- Role/hiring signal: title, level, employment type, experience range, skills, status, and observed opening URL.
- Technology: languages, frameworks, platforms, infrastructure, and team/domain context.
- Work mode: city, mode, office-day count, and effective date.
- Referral: route, contact context, response or conversion notes, and instructions that contain no private credentials.

Unknown future information uses `OTHER` with a JSON object rather than requiring a database migration.

## REST API

All successful responses include the canonical company with its locations and facts. Dates use ISO 8601 and list responses use deterministic ordering.

### `GET /api/v1/companies`

Lists companies. Optional query parameters:

- `city`
- `status`
- `q` for name, alias, or focus
- `updatedAfter`
- `include=facts,locations`

### `GET /api/v1/companies/{idOrSlug}`

Returns one canonical company with locations and facts. UUID and slug identifiers are accepted.

### `POST /api/v1/companies`

Creates or idempotently merges one company. `slug` and `name` are required. Repeating the same slug updates supplied core fields, merges aliases, and upserts locations and facts. Omitted fields remain unchanged.

```json
{
  "slug": "google",
  "name": "Google",
  "careersUrl": "https://www.google.com/about/careers/applications/jobs/results/?location=India",
  "locations": [
    {
      "city": "Bengaluru",
      "state": "Karnataka",
      "country": "India",
      "sourceUrl": "https://www.google.com/about/careers/applications/jobs/results/?location=India",
      "verificationStatus": "VERIFIED"
    }
  ],
  "facts": [
    {
      "factKey": "official-india-careers-portal",
      "category": "OTHER",
      "title": "India careers search",
      "summary": "Inspect each role's location on the official careers portal.",
      "data": {
        "portal": "Google Careers",
        "country": "India"
      },
      "sourceUrl": "https://www.google.com/about/careers/applications/jobs/results/?location=India",
      "sourceTitle": "Google Careers — India search",
      "sourceKind": "OFFICIAL"
    }
  ]
}
```

### `PATCH /api/v1/companies/{idOrSlug}`

Partially updates one company. Core scalar fields replace only when supplied. Aliases merge by default. Locations upsert by normalized place identity. Facts upsert by `factKey`, preserving `firstObservedAt` and updating `lastObservedAt`. The response states which fields, locations, and facts changed.

An explicit `archive: true` archives a company. An explicit `replaceAliases: true` permits deliberate alias replacement. The first version does not delete facts; a correction patches the fact and retains its observation timestamps.

### `POST /api/v1/companies/batch`

Accepts `{"companies": [...]}` with at most 100 companies and applies the same merge rules in one database transaction. A validation failure rejects the complete batch so crawlers can retry safely. The response includes created, updated, and unchanged counts plus canonical identifiers.

## Merge and Identity Rules

1. `slug` is the external idempotency key and never changes through ordinary ingestion.
2. A matching slug updates the existing company.
3. A new slug whose normalized name or alias belongs to an existing active company returns `409` with that company's identifier; the caller must patch the canonical record.
4. Arrays are normalized and de-duplicated. Omission never clears data.
5. Facts use `factKey` for idempotency. Re-ingesting the same fact updates its content and observation time without creating duplicates.
6. Source URLs are HTTP(S) only. Source evidence remains attached when displayed in JobOps.
7. Existing `jobs.company` text remains unchanged. Company lookups resolve jobs and applications through the canonical name and aliases, preserving all historical records.

## Page Integration

- The Companies page reads the new `companies` and `company_locations` tables instead of the TypeScript catalog.
- Cards keep the approved compact Option B design and separate Bengaluru and Hyderabad sections.
- Core card content remains careers-first: company identity, focus, city, portal link, saved openings, submitted applications, and resume reference.
- Sourced facts appear inside the existing expandable area, grouped by category with source, observed date, and verification label.
- The eight current catalog entries migrate into database seed data without inventing facts or current openings.
- Empty fact categories are omitted. The page remains useful when a company has only a careers link and location.

## Errors and Auditability

- `400`: schema or merge request is invalid.
- `404`: PATCH/GET identifier does not exist.
- `409`: slug/name/alias conflicts with another canonical company.
- `413`: request exceeds the body limit or batch count.
- `415`: content type is not JSON.
- `500`: unexpected storage failure, returned without database or secret details.

Every create, patch, archive, location upsert, and fact upsert writes an `activity_logs` entry. API responses use private, no-store headers.

## Verification

- Unit tests cover host classification, city/name normalization, schemas, merge behavior, fact validation, evidence classification, and conflict detection.
- Route tests cover create, idempotent POST, partial PATCH, fact history, archive, list/detail filters, invalid input, body limits, and atomic batch rejection.
- Security tests prove local-network `curl` requests without `Origin` work, foreign browser origins fail, and public-host behavior continues to require the existing access protection.
- Browser tests prove hydrated companies appear in the correct city section, source-labelled facts render, current resume references follow revisions, and application records keep their submitted resume version.
- `typecheck`, `lint`, unit tests, targeted browser tests, and a production build complete before handoff.

## Rollout

1. Add the schema and generated Drizzle migration.
2. Implement normalization, validation, merge services, and REST routes.
3. Update the network boundary and bind scripts to `0.0.0.0`.
4. Migrate the existing catalog into seed data and switch page reads to the database.
5. Add the fact display inside compact company cards.
6. Update `.env.example`, README, API examples, and verification documentation.

The migration is additive. Existing jobs, applications, resumes, files, and activity records are not rewritten or deleted.

## Implementation refinements

Fact changes also append immutable `company_fact_observations` snapshots; identical reports do not append another revision. Canonical renames retain the old name as an alias unless aliases are deliberately replaced. City-only location patches preserve a unique existing place, while ambiguous state/country matches return 400. Companies without locations stay visible in a Location not recorded section. Fictional test seeding refuses the personal database.
