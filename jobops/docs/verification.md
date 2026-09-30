# Local verification

Verification date: October 1, 2026 (Asia/Kolkata). Environment: macOS with Node 24, Next.js 16.3.8 and PostgreSQL 17 from the local Compose service. Browser tests use a separate `jobops_e2e` database, port 3211, `data/e2e-uploads`, and `.next-e2e`; they preserve their fixtures and do not reset the normal career database.

Final verification passed: 59 unit tests across 13 files and all 14 Chromium flows. The latest browser run completed in 26.0 seconds after the Today navigation correction.

- `npm install`: successful; exact stable versions pinned in package and lockfile.
- `docker compose up -d` / `docker compose ps`: PostgreSQL healthy, loopback port 5549.
- `npm run db:migrate`: both committed migrations apply, numeric/range constraints and indexes active.
- `npm run db:seed`: successful and repeatable, existing rows preserved, actual fictional PDFs retained.
- `npm run db:generate`: no schema changes; 19 tables match the committed migrations.
- `npm run build`: successful, runtime-upload tracing warnings resolved.
- Production server smoke on a temporary loopback port: eleven pages, mission context JSON, and the selected PDF returned successfully; the temporary server was stopped afterward. The main workbench on port 3210 remains healthy.
- `npm run typecheck`: successful.
- `npm run lint`: successful.
- `npm run format:check`: successful.
- `npm run test`: 59 tests across 13 files passed.
- `npm run test:e2e`: 14 Chromium flows passed in 26.0 seconds.
- `npm audit`: zero reported vulnerabilities after the tested Drizzle transitive esbuild override.

Browser flows cover real PDF bytes/headers/extraction/current versions/archive, damaged-PDF retention, manual job and application approval/timeline, JSON preview/duplicates/snapshots/export, same-batch merge ordering and metadata preservation, responsive URL filters, discovery context privacy/agent headings/files, apply operator/results/approval, profile approved diff/stale-state behavior, UNKNOWN answers, contacts, mail review, Today sidebar navigation and the `/today` redirect, and the Inspect Naukri action.

Three screenshots were captured and inspected. PDF download, copyable agent-link clipboard behavior and the mobile layout were also checked. Initial test records in the normal development database were retained; the isolated runner preserves its own fixtures and performs no database reset or cleanup.

Gmail live OAuth and mailbox sync remain unverified without real Google credentials; configuration, encryption, exact read-only scope rejection and local/import mail review are tested. No external applications were submitted, emails sent, portal profiles changed, or real personal facts seeded.
