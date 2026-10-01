# Company ingestion implementation plan

**Goal:** let an external assistant hydrate persistent company cards using ordinary JSON/curl on the trusted LAN, without inventing jobs, applications or resumes.

**Architecture:** extend the existing PostgreSQL modular monolith with company, location, fact and observation tables. Existing applications remain the source of application activity. Retain the approved compact cards and separate Bengaluru/Hyderabad sections.

**Spec:** ../specs/2026-10-01-company-ingestion-api-design.md

**Constraints:** no ingestion token, no external submissions, no dummy records in the personal database, no database resets. Commit each verified logical unit with JOB_FINDER-9999 and the Codex co-author footer.

## Task 1 — local-network transport

- [x] Test private-host boundaries, same-origin requests, curl exemptions and server-action rejection.
- [x] Modify `src/lib/security.ts`, `src/proxy.ts` and dev/start scripts to listen on 0.0.0.0 while retaining public-host authentication.
- [x] Run security tests and commit the transport unit.

## Task 2 — persistent company ingestion

- [x] Add the four tables in `src/db/schema.ts`, generate an additive migration, and preserve the eight previously verified real companies.
- [x] Implement validation and transactional keyed merge in `src/features/companies/{validation,ingestion,http}.ts`.
- [x] Add collection, detail, batch and schema routes under `src/app/api/v1/companies/`.
- [x] Test malformed/bounded input, identity conflicts, partial updates, idempotence, history and atomic rollback. Use only the isolated E2E database.
- [x] Commit the persistent API unit after integration checks.

## Task 3 — cards, clean data and agent handoff

- [x] Read active companies from PostgreSQL in `src/features/companies/read.ts`; preserve slug-based resume references and DB-check resume actions.
- [x] Show sourced research in card disclosures, retaining submitted PDF references and dynamic city sections.
- [x] Restrict fictional seeding to marked `jobops_e2e` and inspect the main database with the existing fingerprinted cleanup utility.
- [x] Add runnable curl examples, payload/merge documentation and the browser-agent instruction to `README.md`.
- [x] Run typecheck, lint, unit tests, build and isolated browser/API integration checks. Apply the additive migration to the personal workspace and verify the live listener/API.
- [x] Commit the page/handoff unit and report URLs and verification.

## Review focus

Repeated reports must not duplicate facts or revisions. Name/alias conflicts must roll back a complete batch. Renames must not detach applications. A company without a recorded location must remain discoverable. Missing or malicious Origin headers must never create a server-action bypass.
