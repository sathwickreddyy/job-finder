# JobOps V1 design

The authoritative requirements are in `docs/product-brief.md`. JobOps is a single-user career control plane. All external portal actions are performed by a human or supervised browser operator. No LLM runtime, sending email, scraping workers, or autonomous submission exists in the application.

## Decisions

- Single Next.js App Router application, strict TypeScript, Tailwind 4 and owned shadcn components. PostgreSQL with Drizzle migrations; no alternate persistence mode.
- Separate relational entities for candidate, resume/version, job/snapshot/match, application/event, portal profile, contact, mission/step/execution/evidence, mail/message event, settings, and activity. UUIDs and foreign keys; append-only event creation within transactional writes.
- Candidate answers support explicit UNKNOWN. Compensation and unrelated metadata are omitted from mission contexts. Read-only discovery contexts omit candidate identity.
- Local storage behind an abstraction; opaque UUID paths, bounded uploads, PDF signature validation, SHA256, local text parsing, safe retry if parsing fails. Files never enter Git.
- Zod validation on imports and mutations. JSON and CSV preview, normalized URL and company/title/location duplicate detection, skip/merge with snapshots and atomic import.
- Deterministic category dictionary for keyword coverage. No inference of expertise. Resume versions and job keywords are editable.
- Applications use one canonical stage enum. Every movement creates an event; marking APPLIED requires an explicit human confirmation in the form.
- Missions have editable plans and constraints, plain agent DOM, limited context JSON, result forms and evidence. Results atomically update only explicitly selected entity state and preserve history. No automatic final submission.
- Profile update missions contain explicit field diffs. Contacts record public source and manual verification. Mail is read-only, deterministic, always reviewed before application state changes; JSON import works without credentials.
- Local-only default binding and host/origin checks. Optional single-user access token cookie, mandatory for production. OAuth tokens encrypted with a separately configured secret if Gmail is connected.
- URL-persisted search/filters and data exports. Fictional seed clearly marked demo and idempotent. Seed resume PDFs contain fictional text and are real downloadable PDFs.

## Visual direction

Desktop workbench: slate navy surfaces, muted blue accents, amber review state, teal completed state, system sans typography (no Inter). Compact tables, left navigation, restrained rounded panels, visible actions and clear focus. A localhost component gallery presents two live choices for navigation, work queues, status indicators and forms. The implementation selects compact table/workbench defaults under the user's explicit autonomous instruction; gallery remains available for later comparison. Responsive stacked views and an intentional plain agent view.

## Validation

Unit tests pin URL normalization/deduplication, row errors, token-boundary keyword extraction, explainable comparison, UNKNOWN answers, mission privacy/approval guards and mail classification. Real PostgreSQL and Playwright flows cover upload/preview, import/duplicate merge, discovery/context, apply/result/application timeline and profile/contact/mail updates. Build, lint, typecheck, tests, migrations, seed and Docker health must all run.

## Execution authority

The user explicitly requested autonomous implementation without questions or review gates. No commit is required; all changes remain reviewable in the existing Git repository. The new `jobops/` folder avoids replacing repository files.
