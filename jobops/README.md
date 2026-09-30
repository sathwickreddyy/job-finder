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

Open [JobOps](http://127.0.0.1:3210). PostgreSQL binds to `127.0.0.1:5549`; the application binds to `127.0.0.1:3210`. These ports avoid the other local projects. A new workspace starts empty, ready for your own candidate information, resume and saved jobs. Starting the application or applying migrations never inserts sample data.

Use the exact origin configured in `APP_URL` when opening the application. If you change the application port or host, update both the launch command and `APP_URL`; update the Gmail callback too when Gmail is configured. Mutating requests from a different origin are rejected.

Fictional data is reserved for controlled demonstrations and the isolated browser-test database. `npm run db:seed` is an explicit opt-in command; do not run it as part of normal setup. Its candidate facts, companies, contacts, PDFs and messages are fictional. It preserves existing records and candidate configuration, but deliberately inserts missing examples. Unknown application answers remain `UNKNOWN` until you provide them.

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
scripts/                 Isolated browser tests and opt-in fictional fixtures
tests/                   Domain, security, storage and browser tests
data/uploads/            Private PDF files; ignored by Git
```

A resume assessment references one immutable job-description snapshot and one PDF version. Later edits cannot silently retarget that assessment. Direct submission dates and outreach-sent events are different facts. Legacy tables and domain code remain for historical integrity; they do not create a second user workflow.

External ATS-readiness estimates must name their source and method. They are not employer ATS results. The existing dictionary-overlap engine is keyword coverage; it is never presented as an external ATS score.

## Commands

| Command                                   | Purpose                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                             | Local workbench on port 3210                                   |
| `npm run build` / `npm start`             | Production build / loopback production server                  |
| `npm run lint`                            | ESLint                                                         |
| `npm run typecheck`                       | Strict TypeScript                                              |
| `npm run test`                            | Vitest domain/security/storage/PDF tests                       |
| `npm run test:e2e`                        | Real Chromium workflows in an isolated database/server/storage |
| `npm run format` / `npm run format:check` | Prettier                                                       |
| `npm run db:generate`                     | Generate SQL after a schema change                             |
| `npm run db:migrate`                      | Apply committed migrations                                     |
| `npm run db:seed`                         | Explicit fictional data for controlled demos/tests only        |
| `npm run db:studio`                       | Local Drizzle Studio; keep it private                          |

Install the browser once with `npx playwright install chromium`. `test:e2e` derives a separate `jobops_e2e` database using the local PostgreSQL credentials, uses `data/e2e-uploads`, `.next-e2e`, and port 3211, and checks an ownership marker before using an existing test database. It never drops or resets your normal database. The database role needs `CREATEDB` (the Docker development role has it). Test data remains in the isolated database for inspection; application data is not cleaned or reset.

Verified results and integration limits are recorded in [verification.md](docs/verification.md). The retired endpoint and origin-protection checks are included in the normal browser suite.

## Environment

| Variable                                   | Required / behavior                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `DATABASE_URL`                             | PostgreSQL connection; example targets the local Compose service               |
| `APP_URL`                                  | Canonical origin; defaults to `http://127.0.0.1:3210`                          |
| `JOBOPS_ACCESS_TOKEN`                      | 32+ characters required beyond loopback; optional browser unlock for local use |
| `STORAGE_ROOT`                             | Default `./data/uploads`; persistent private local directory                   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Gmail web OAuth client                                                |
| `GOOGLE_REDIRECT_URI`                      | Same-origin `/api/gmail/callback`; example in `.env.example`                   |
| `GMAIL_TOKEN_ENCRYPTION_KEY`               | Optional Gmail prerequisite: base64-encoded 32 random bytes                    |

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

V1 is a single-user local tool. Its default loopback binding and Host checks reduce accidental exposure; mutations require the configured origin. Setting a 32+ character access token protects pages, server actions, files, exports with an HttpOnly cookie. The cookie is Lax to permit Google OAuth return navigation, Secure on HTTPS, and expires after twelve hours. Rotating the token invalidates existing sessions. Gmail state/PKCE cookies are separate.

For deployment, set the exact HTTPS `APP_URL`, a strong access token, production database credentials and Gmail callback, and place Next.js behind an HTTPS reverse proxy. Keep the application loopback-bound behind that proxy, preserve the canonical Host/Origin, restrict database/file access, use persistent storage, encrypted backups, and process supervision. A public service should replace the shared-token mechanism with mature authentication/authorization and rate limiting. No portal passwords, Google passwords, cookies from external websites or AI credentials are requested or stored.

The local Compose password is development-only. Use a managed/private database or your own restricted PostgreSQL credentials for deployment. Filesystem storage assumes one persistent application instance; use the storage service boundary for R2/S3 before horizontal scaling. Do not publish Drizzle Studio, test servers, Compose PostgreSQL, uploads or backups.

## Current limits

- This is a single-user local app. Live Gmail OAuth and personal-mailbox refresh still need your credentials and have not been tested against your actual inbox.
- Research, resume writing, applications and messages happen through your external assistant or by you. Saving a record never performs an external action.
- There is no closed-app push notification service or automatic background mail refresh.
- The app stores PDF resumes; OCR and document generation are not included.
- Record exports do not replace a database-plus-files backup.
