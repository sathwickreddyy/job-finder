# Repository Guidelines

## Current State

The runnable JobOps application lives in `jobops/`. It is a Next.js App Router modular monolith with
PostgreSQL/Drizzle, private local uploads, deterministic matching and supervised
missions. There are no LLM calls or autonomous external submissions.

Run all application commands from the `jobops/` directory at the repository root:
`npm run dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, and
`db:migrate` / `db:seed`. Browser tests use a separate marked `jobops_e2e`
database, port 3211, and `data/e2e-uploads`; never point them at personal data.

## Commits

- Project commit key: `JOB_FINDER`.
- Use the most granular applicable Jira issue key when an issue owns the work.
- When no Jira issue covers the work, use `JOB_FINDER-9999: <summary>`.
- Do not use another project's key or conventional-type prefixes such as `feat`,
  `fix`, or `docs`.
- Finalize and record any project-key change here before using the new key.
- Only commit when explicitly requested. Propose a commit after each logical unit
  is complete and verified; keep unrelated changes in separate commits.
- Include `Co-Authored-By: Codex <noreply@openai.com>` for Codex-assisted commits.
- Do not rewrite existing commits solely to change their prefixes.

## Security

Do not commit secrets, personal resumes, generated databases, or local data.

## Product scope

- The user is based in India. Focus discovery on Indian openings and portals. LinkedIn is explicitly included for India-focused job searches and referrals, alongside Naukri, Instahyre, Cutshort, and Hirist; do not default to overseas openings.
- Use Indian cities, INR/LPA compensation, notice periods, and Asia/Kolkata display defaults.
- Redesign the core experience through a live visual companion and component gallery. The user chooses the direction before the main interface is replaced.
- The first redesign centers on actions delegated to external ChatGPT/Claude computer use and Codex/Claude Code: find openings, review job descriptions, tailor resumes interactively, update portals, and prepare applications or referral/cold-email/LinkedIn outreach.
- Keep agent progress, resume revisions, approval requests and execution results tracked in JobOps through an API. The app does not need its own LLM calls. Keep sending, submission and portal-change approvals explicit.
- Make on-demand email refresh, date-based grouping and urgent action items prominent. Start with this core workflow before adding other features.
