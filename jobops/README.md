# JobOps

A simple personal job-search tracker for India: copy prompts into your existing assistant conversation, save job descriptions, keep real resume files, and record applications or outreach.

The approved spacious Option A is live. Home brings together your LinkedIn, GitHub, portfolio and other saved sites, Indian job portals, and graphs from actual recorded activity. **Find openings** is the starting action. The app provides prompts and keeps your records; ChatGPT, Claude or Codex work in your existing external conversation.

## Local setup

Requires Node.js 22.16+ (tested with 24), npm, and Docker Desktop. From the repository root:

```bash
cd jobops
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

Open [JobOps](http://127.0.0.1:3210). PostgreSQL binds to `127.0.0.1:5549`; the application listens on `0.0.0.0:3210` so you can also open `http://<your-private-LAN-IP>:3210`. These ports avoid the other local projects. No fictional candidate, resume, job or application records are inserted during normal setup.

With a local `APP_URL`, loopback, private IPv4/local IPv6 addresses and Tailscale IPv4 addresses (`100.64.0.0/10`) at the configured port are accepted. From another device on your tailnet, open `http://<this-computer's-Tailscale-IP>:3210`; you can keep `APP_URL=http://127.0.0.1:3210` for both local and Tailscale access. Device-name/MagicDNS URLs must match `APP_URL` exactly and require `JOBOPS_ACCESS_TOKEN`, like other configured hostname deployments. Browser mutations must come from the exact origin you opened. Company API writes also accept ordinary local/tailnet `curl` requests without an Origin header or access token. Other routes retain their origin checks. Host checks classify the target address, not the caller; the host firewall and tailnet policy control who can reach the listener. If you change the port, update the launch command and `APP_URL`; keep the Gmail callback on its configured origin.

`npm run db:seed` adds no dummy data. The company migration preserves the eight existing real companies and reviewed official location links, without inventing openings, salaries or application activity. Fictional fixtures are restricted to `db:seed:test`, which refuses every database except the local, ownership-marked `jobops_e2e`. Unknown application answers remain `UNKNOWN` until you provide them.

## Company research API — for browser agents and curl

Use this section as the ingestion contract for an external ChatGPT, Claude or Codex session. Read the machine-readable [OpenAPI schema](http://127.0.0.1:3210/api/v1/companies/schema) before writing. Ordinary curl calls from this computer or the trusted LAN require **no ingestion token**, no access cookie and no Origin header. Use a local terminal/execution tool; a cloud-only tool cannot reach your private LAN, and JavaScript on a LeetCode page has a different browser origin.

```bash
# On this computer. From another LAN device, use this computer's private IP.
export JOBOPS_URL=http://127.0.0.1:3210
# Example LAN target: export JOBOPS_URL=http://192.168.0.5:3210

curl --fail-with-body --silent --show-error "$JOBOPS_URL/api/v1/companies/schema"
curl --fail-with-body --silent --show-error "$JOBOPS_URL/api/v1/companies?city=Bengaluru"
curl --fail-with-body --silent --show-error "$JOBOPS_URL/api/v1/companies?city=Hyderabad"
curl --fail-with-body --silent --show-error "$JOBOPS_URL/api/v1/companies/google"
```

Create or update a company with a stable lowercase slug (letters, numbers and hyphens; `schema`, `batch` and UUID-shaped slugs are reserved). This runnable example uses Google's actual careers portal; it creates no fictional job, offer or application. Existing Google fields not supplied remain unchanged. Repeat it safely: locations and facts use stable identities.

```bash
curl --fail-with-body --silent --show-error \
  -X POST "$JOBOPS_URL/api/v1/companies" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "slug": "google",
  "name": "Google",
  "careersUrl": "https://www.google.com/about/careers/applications/jobs/results/?location=India",
  "locations": [
    {"city": "Bengaluru", "state": "Karnataka", "country": "India"},
    {"city": "Hyderabad", "state": "Telangana", "country": "India"}
  ],
  "facts": [{
    "factKey": "official-india-careers-portal",
    "category": "OTHER",
    "title": "India careers search",
    "summary": "Use the official careers search and inspect each role's location.",
    "data": {"portal": "Google Careers", "country": "India"},
    "sourceUrl": "https://www.google.com/about/careers/applications/jobs/results/?location=India",
    "sourceTitle": "Google Careers — India search",
    "sourceKind": "OFFICIAL"
  }]
}
JSON
```

Patch only supplied fields, using either the slug or UUID returned by the API:

```bash
curl --fail-with-body --silent --show-error \
  -X PATCH "$JOBOPS_URL/api/v1/companies/google" \
  -H 'Content-Type: application/json' \
  --data-binary '{"portalNote":"Google Careers · Choose Bengaluru or Hyderabad in the location filter."}'

# After extracting real evidence, save its JSON payload to company-research.json.
curl --fail-with-body --silent --show-error \
  -X PATCH "$JOBOPS_URL/api/v1/companies/google" \
  -H 'Content-Type: application/json' --data-binary @company-research.json
```

Ingest multiple companies atomically. This runnable batch updates official portal links for two existing real companies; unknown data stays unknown:

```bash
curl --fail-with-body --silent --show-error \
  -X POST "$JOBOPS_URL/api/v1/companies/batch" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{"companies":[
  {"slug":"google","name":"Google","careersUrl":"https://www.google.com/about/careers/applications/jobs/results/?location=India"},
  {"slug":"microsoft","name":"Microsoft","careersUrl":"https://careers.microsoft.com/"}
]}
JSON
```

| Endpoint                             | Behavior                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/companies`              | Active companies by default; optional `city`, `q`, `status=ACTIVE\|ARCHIVED\|ALL`, `updatedAfter`, `include=facts,locations` |
| `GET /api/v1/companies/{idOrSlug}`   | Company, locations, facts and each fact's observation history                                                                |
| `POST /api/v1/companies`             | Idempotent upsert; requires `slug` and `name`; returns 201 on create, 200 on merge                                           |
| `PATCH /api/v1/companies/{idOrSlug}` | Partial update; requires an existing identifier                                                                              |
| `POST /api/v1/companies/batch`       | `{ "companies": [...] }`, at most 100; all writes succeed or all roll back                                                   |
| `GET /api/v1/companies/schema`       | OpenAPI 3.1 payload schemas and category-specific data fields                                                                |

Write responses contain canonical company fields, `outcome` (`created`, `updated`, `unchanged`) and `changes`. Batch responses include counts and canonical company results. Errors contain `error` and optional field `issues` or `canonicalCompany`: 400 invalid input, 404 missing company, 409 identity conflict, 413 body/batch too large, 415 wrong content type. Bodies are limited to 512 KiB. Responses are not cached.

Core fields are `slug`, `name`, `aliases`, `focus`, `websiteUrl`, `careersUrl`, `portalNote`, `locations`, `facts`, `archive`, and `replaceAliases`. Omitted fields preserve data; `null` clears nullable URLs. Slugs stay fixed. Aliases merge without duplicates unless `replaceAliases: true` is supplied with `aliases`; a rename also retains the previous name for application matching. An overlapping active-company name/alias returns 409; patch the returned canonical identifier instead of creating a duplicate. `archive: true` hides a company from normal lists/cards; `archive: false` restores it. There is no delete endpoint.

Locations use `city`, optional `state`/`country` (default India), `workModes`, `isPrimary`, `sourceUrl`, and `verificationStatus`. Bangalore is normalized to Bengaluru. The full city/state/country tuple is the identity; include those values whenever known. A city-only patch can update a uniquely matching location while preserving its state; ambiguous locations require a state. Work modes accept `ONSITE`, `HYBRID`, `REMOTE`, `UNKNOWN`. Never infer office policy from the existence of an office.

Every new fact requires `factKey`, `category`, `title`, and `sourceUrl`. Optional fields: `summary`, `data`, `sourceTitle`, `sourceKind`, `verificationStatus`, `confidence` (0–1), `occurredAt` (ISO date/timestamp). Use a stable fact key derived from the post ID and subject, so retrying the same report does not duplicate it. A correction supplies the same fact key. Nested `data` objects merge; supplied arrays replace. Changed contents append an observation snapshot; identical contents only advance the observation time. First-observed timestamps stay fixed.

Every category accepts `data.publicationYear` (integer, e.g. the year printed on the source) and `data.publishedAt` (ISO publication date/timestamp). Record only publication metadata actually shown by the source; omit it if unknown. When both are supplied their years must match. `occurredAt` is the interview/offer/event date, and observation timestamps track when JobOps saw the report; neither substitutes for publication year.

Company research is presented as **Compensation**, **Interview details**, and **Interview questions** tables, each with publication year and clickable source references. Missing fields show “Not recorded.” Other categories have their own report/details/reference tables. On narrow screens each table scrolls horizontally. Original notes and additional fields remain available under **All report details**, and source timestamps under **Source dates**.

| Category                | Known `data` fields (additional JSON fields are preserved)                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `COMPENSATION`          | `role`, `level`, `yearsExperience`, `currency`, `fixedAnnual`, `variableAnnual`, `joiningBonus`, `equity`, `totalAnnual`, `vestingNotes`, `offerDate`              |
| `INTERVIEW`             | `role`, `level`, `outcome`, `roundCount`, `rounds` (strings or round objects below), `topics`, `questions` (strings or question objects below), `applicationRoute` |
| `TECH_STACK`            | `languages`, `frameworks`, `platforms`, `infrastructure`, `team`, `domain`                                                                                         |
| `ROLE`, `HIRING_SIGNAL` | `role`, `title`, `level`, `employmentType`, `minExperience`, `maxExperience`, `skills`, `status`, `openingUrl`                                                     |
| `WORK_MODE`             | `city`, `mode`, `officeDaysPerWeek`, `effectiveDate`                                                                                                               |
| `REFERRAL`              | `route`, `contactContext`, `responseNotes`, `conversionNotes`, `instructions`                                                                                      |
| `CULTURE`, `OTHER`      | A JSON object for source-backed information that does not fit another category                                                                                     |

Interview question objects use `{ "text": "…", "referenceUrl": "https://…", "topic": "…", "round": "…" }`; only `text` is required. Keep the question's wording and actual reference link. A string question links to its report. Round objects accept `name`, `summary`, `durationMinutes`, `topics`, `referenceUrl`, and their own `questions` array in the same format. Nested questions appear in the question table with their round name; their own link takes precedence over the round link, then the report source. Do not manufacture questions from a vague round description. Reference URLs must use HTTP(S) without credentials. The generated schema includes these fields.

For the file-based PATCH command above, `company-research.json` contains `{ "facts": [...] }` with stable `factKey` values, publication metadata and the actual extracted compensation/interview data. Keep each distinct source report as its own fact.

Store Indian compensation in rupees with `currency: "INR"` (1 LPA = 100000 INR/year); distinguish fixed pay, annual equity and total compensation. Unknown numbers should be omitted. `sourceKind` accepts `OFFICIAL`, `LEETCODE`, `LINKEDIN`, `COMMUNITY`, `OTHER`; `verificationStatus` accepts `VERIFIED`, `COMMUNITY_REPORTED`, `UNVERIFIED`, `STALE`. LeetCode is automatically identified from its URL and defaults to community-reported; community evidence cannot be labelled verified. Keep reports from different authors or dates as separate facts when they describe distinct experiences. Company presence does not establish a current vacancy.

The Companies page reads these persisted records, with separate Bengaluru/Hyderabad sections and additional cities when imported. Each compact card is fully clickable and opens `/companies/{slug}`. The company page brings together Open careers, portal details, website/aliases, locations, gathered research, saved openings, resume references and application history. The clicked city's resume reference appears first; company records cover all locations, including remote openings. Application counts and histories are joins over actual saved jobs/applications; ingestion does not invent them. Resume references still follow the family's current PDF, while submitted applications retain their exact file. REST writes refresh both the directory and company page.

Copy this instruction into your browser-control conversation:

> Read the Company research API section of this repository's README and GET http://127.0.0.1:3210/api/v1/companies/schema. Use my browser session to research developer opportunities in Bengaluru and Hyderabad, including LeetCode Discuss and official company careers pages. Record only information actually observed, with the exact source URL, publication year/date in data.publicationYear/data.publishedAt, and separate event date in occurredAt when known. Keep question-specific reference links in structured question objects. Extract roles/levels, INR compensation components, interview rounds/questions, tech stacks, work modes, referral routes and hiring/culture signals into sourced facts. Label community reports clearly; omit unknown fields. Check existing companies first, preserve slugs, and use stable fact keys. Use curl from this computer's terminal to POST/PATCH or batch real findings into JobOps, check every response, and resolve 409 conflicts using the returned canonical identifier. Never store external credentials, fabricate records, send messages, submit applications or change my resume files. Refresh /companies, open the company card, and verify the source-labelled research on its company page.

## Your first opening, step by step

1. Open **My sites & profile** to add your public links and working preferences. In **Resumes**, upload your original PDF. Files and profile links are private local records until you choose to share them.
2. On Home, choose **Find openings**. Read or edit the full prompt at the top, copy it into your existing ChatGPT or Claude conversation, and ask for India-based openings on LinkedIn India, Naukri, Instahyre, Cutshort, Hirist or official company careers pages.
3. Choose one verified opening. Use **Save a job description** to store its company, role, original link and full description. Extra fields are optional.
4. Choose **Review my resume** on that opening. Select the job and exact PDF, copy the prompt and attach the file to your assistant. Work through changes together. Upload the resulting PDF as a new version and save the bullet change log. If assessed, save its source, date, method and optional 0–100 estimate against the exact job description.
5. Choose **Direct application** or **Referral / message**. Copy that prompt, agree on the final file or message with your assistant, and confirm the external submission or sending yourself. Then record what actually happened, its date and the exact resume used. A planned action stays planned; a sent referral does not count as an application.
6. Open **Inbox** and refresh when you want replies. Connect Gmail first if you want live refresh; without a connection, you can import messages. Dates use India Standard Time, and **Needs attention** surfaces requests such as interviews and assessments. **Mark done** keeps the original message.

Each activity has its own page. Editing a prompt does not submit anything. The app does not access assistant memory, call an LLM, send messages or operate external job sites.

## What is implemented

- **Home:** personal website cards, India-focused job-site cards, real saved/submitted/interview/offer counts, weekly activity and source graphs. Empty data stays empty; site analytics are not connected.
- **Find openings:** complete editable, copyable prompt first; role/location/preferences in a disclosure below it. Saved preferences can be pasted from your existing assistant conversation.
- **Saved openings:** full job descriptions, source links, notes, status and immutable description history. Search and optional filters; JSON/CSV import with validation, preview, duplicate handling and preserved snapshots.
- **Companies:** clickable compact cards in separate Bengaluru/Hyderabad sections. Each company's page combines its careers portal, locations, source-labelled research, all saved openings, current resume references and actual application history. REST writes hydrate the directory and detail pages.
- **Resumes:** actual PDF upload/preview/download, original and revised files, byte-preserving version history, bullet changes, exact company/role usage and source-labelled assessments tied to the exact PDF and description. Missing scores remain missing. Older-description assessments are labelled. Files can be archived and their default version selected.
- **Applications and outreach:** direct-application, referral, cold-email and LinkedIn prompts; simple planned/sent records with dates and optional recipient, link, notes and exact resume. Application stages and timelines track later outcomes. Submitted resume choices remain fixed.
- **My sites & profile:** public profile/portfolio links, improvement notes, dedicated improvement prompts and reusable working preferences.
- **Inbox:** on-demand read-only Gmail refresh, India date groups and filters, actionable-message reasons and reversible done/reopen controls. Linking mail appends history; stage changes are optional.
- **Secondary settings:** candidate details, standard answers, preferences, display settings, storage, mail configuration, contacts and record exports.
- **Interface:** shared Tailwind 4 tokens, Google-blue actions, neutral dark/light surfaces, press/focus feedback and reduced-motion support. The live A/B [gallery](http://127.0.0.1:3210/gallery/simple) remains available.

Previous task/mission/proposal entry pages redirect to Find openings. Their external API/context routes return HTTP 410. Historical database records remain intact; there is no agent-access setup in the current UI.

## Architecture

Next.js App Router, React, strict TypeScript, Tailwind CSS 4, owned UI primitives, Zod, Drizzle and PostgreSQL. Server pages read relational data; validated server actions persist transactional updates. Private local storage preserves original PDFs. The app has no external AI dependency.

```text
src/app/                 Pages, downloads, exports and Gmail OAuth routes
src/components/          Navigation, prompt copy/edit controls and accessible forms
src/features/workspace/  Shared real-record reads, cards, graphs and prompts
src/features/            Jobs, applications, resumes, profiles, contacts and mail
src/db/                  Typed schema and lazy PostgreSQL pool
drizzle/                 Additive migrations and snapshots
scripts/                 Isolated browser tests; guarded test-only fictional fixtures
tests/                   Domain, security, storage and browser tests
data/uploads/            Private PDF files; ignored by Git
```

A resume assessment references one immutable job-description snapshot and one PDF version. Later edits cannot silently retarget that assessment. Direct submission dates and outreach-sent events are different facts. Legacy tables and domain code remain for historical integrity; they do not create a second user workflow.

External ATS-readiness estimates must name their source and method. They are not employer ATS results. The existing dictionary-overlap engine is keyword coverage; it is never presented as an external ATS score.

## Commands

| Command                                   | Purpose                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                             | Local workbench on port 3210                                   |
| `npm run build` / `npm start`             | Production build / LAN server on port 3210                     |
| `npm run lint`                            | ESLint                                                         |
| `npm run typecheck`                       | Strict TypeScript                                              |
| `npm run test`                            | Vitest domain/security/storage/PDF tests                       |
| `npm run test:e2e`                        | Real Chromium workflows in an isolated database/server/storage |
| `npm run format` / `npm run format:check` | Prettier                                                       |
| `npm run db:generate`                     | Generate SQL after a schema change                             |
| `npm run db:migrate`                      | Apply committed migrations                                     |
| `npm run db:seed`                         | Safe no-op; never inserts fictional data                       |
| `npm run db:seed:test`                    | Fixtures only in the marked local jobops_e2e database          |
| `npm run db:studio`                       | Local Drizzle Studio; keep it private                          |

Install the browser once with `npx playwright install chromium`. `test:e2e` derives a separate `jobops_e2e` database using the local PostgreSQL credentials, uses `data/e2e-uploads`, `.next-e2e`, and port 3211, and checks an ownership marker before using an existing test database. It never drops or resets your normal database. The database role needs `CREATEDB` (the Docker development role has it). Test data remains in the isolated database for inspection; application data is not cleaned or reset.

Verified results and integration limits are recorded in [verification.md](docs/verification.md). The retired endpoint and origin-protection checks are included in the normal browser suite.

## Environment

| Variable                                   | Required / behavior                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | PostgreSQL connection; example targets the local Compose service                                                        |
| `APP_URL`                                  | Canonical origin; defaults to `http://127.0.0.1:3210`                                                                   |
| `JOBOPS_ACCESS_TOKEN`                      | Optional browser unlock on the trusted LAN; 32+ characters required for public hosts. Local company API needs no token. |
| `STORAGE_ROOT`                             | Default `./data/uploads`; persistent private local directory                                                            |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Gmail web OAuth client                                                                                         |
| `GOOGLE_REDIRECT_URI`                      | Same-origin `/api/gmail/callback`; example in `.env.example`                                                            |
| `GMAIL_TOKEN_ENCRYPTION_KEY`               | Optional Gmail prerequisite: base64-encoded 32 random bytes                                                             |

Use `.env`; do not commit it. Generate independent access/encryption secrets locally:

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'
```

The first output can be `JOBOPS_ACCESS_TOKEN`; the second is `GMAIL_TOKEN_ENCRYPTION_KEY`. Keep the encryption key with your secure backups: changing it makes stored Gmail tokens unreadable.

## Gmail read-only setup

Mail import works with all Google variables empty. To connect a real account:

1. Create a Google Cloud project, enable the Gmail API, configure OAuth consent, and add your account as a test user if the app is in testing mode.
2. Create an OAuth **web application** client. Register exactly `http://127.0.0.1:3210/api/gmail/callback` locally (use your HTTPS domain in production).
3. Set client ID/secret, redirect URI and the base64 encryption key in `.env`, then restart Next.js.
4. Open Inbox → Mail connections → Connect Gmail read-only. Consent requests **only** `https://www.googleapis.com/auth/gmail.readonly`; state and PKCE protect the callback. Tokens are AES-256-GCM encrypted in PostgreSQL.
5. Return to Inbox and choose **Refresh mail**. Sync is manual, inbound only, bounded to batches of 100, and continues with a cursor. The initial window is 30 days; later sync overlaps the last completed window for deduplication. Deterministic relevance/classification rules retain recruiting messages for review.
6. Read a message and optionally use **Link message** to attach it to an existing record. Changing its stage is a separate optional control.

Live OAuth and mailbox sync require your credentials and were not exercised against a real account. Configuration, encryption, broad-scope rejection, import and reviewed-event behavior are tested. Google classifies `gmail.readonly` as a restricted scope; review its verification requirements before publishing the integration. Testing-mode tokens may expire. Follow [Google's Gmail scopes documentation](https://developers.google.com/workspace/gmail/api/auth/scopes) and [web-server OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server).

## Resume storage and backup

Original PDFs are limited to 10 MiB, validated by type/extension/signature, stored using opaque UUID filenames with private permissions, and served through protected routes. Names supplied by users never determine filesystem paths. Path traversal and symlinks are rejected. Parsing uses local `pdf-parse`, without OCR or network calls. Scanned/encrypted/corrupt PDFs may not yield usable text; originals remain available to view or download.

Back up the database and storage together. A JSON/CSV export is useful for portability but does not contain original resume/evidence bytes, OAuth connections or every settings record.

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U jobops -d jobops -Fc > backups/jobops.dump
tar -czf backups/jobops-uploads.tar.gz data/uploads
```

Run these commands from `jobops/`. The dump command targets the default Compose database; the archive command targets the default `STORAGE_ROOT`. If either location is customized, back up the configured database and actual storage directory instead. The Compose service must be running for `pg_dump`.

Store backups outside Git and securely preserve your `.env` secrets separately. Keep the original `GMAIL_TOKEN_ENCRYPTION_KEY` to restore Gmail connections. Test restoration into a **separate** database/storage root before relying on backups; do not restore over live data without an explicit decision.

The original development fixtures were removed from the main local workspace after being backed up. The one-time `scripts/clean-demo.ts` utility recognizes only the initial development session, preserves later edits, checks references from retained records, and requires an exact preview digest before applying a transactional deletion. It saves private record/upload backups under ignored `data/backups/`. It does not reset the schema, run at startup, or touch `jobops_e2e`. It is not a general-purpose delete or reset command.

## Production and security

V1 is a single-user tool for your trusted LAN. The dev/start scripts listen on all IPv4 interfaces. Host checks validate the target address; they do not authenticate a client's source IP, and forwarded headers do not establish trust. Your firewall and router define the network boundary. There is no ingestion token. Company API requests to a local target bypass the optional browser cookie; other pages, files and exports respect a configured access token. Browser mutations require the actual target origin. The cookie is Lax to permit Google OAuth return navigation, Secure on HTTPS, and expires after twelve hours. Rotating the token invalidates existing sessions. Gmail state/PKCE cookies are separate.

For public deployment, set the exact HTTPS `APP_URL`, a strong access token, production database credentials and Gmail callback, and place Next.js behind an HTTPS reverse proxy. Override the listener with `npm exec -- next start --hostname 127.0.0.1 --port 3210`, preserve the canonical Host/Origin, restrict database/file access, use persistent storage, encrypted backups, and process supervision. Public company API requests retain origin and access-cookie protection. A public service should replace the shared-token mechanism with mature authentication/authorization and rate limiting. No portal passwords, Google passwords, cookies from external websites or AI credentials are requested or stored.

The local Compose password is development-only. Use a managed/private database or your own restricted PostgreSQL credentials for deployment. Filesystem storage assumes one persistent application instance; use the storage service boundary for R2/S3 before horizontal scaling. Do not publish Drizzle Studio, test servers, Compose PostgreSQL, uploads or backups.

## Current limits

- This is a single-user local app. Live Gmail OAuth and personal-mailbox refresh still need your credentials and have not been tested against your actual inbox.
- Research, resume writing, applications and messages happen through your external assistant or by you. Saving a record never performs an external action.
- There is no closed-app push notification service or automatic background mail refresh.
- The app stores PDF resumes; OCR and document generation are not included.
- Record exports do not replace a database-plus-files backup.
