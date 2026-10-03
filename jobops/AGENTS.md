# Repository Guidelines

## Current State

This directory contains the runnable JobOps application, a Next.js App Router modular monolith with
PostgreSQL/Drizzle, private local PDF uploads, complete assistant prompts and direct application/outreach
records. Legacy mission data remains stored, but its UI and agent endpoints are retired. There are no LLM calls or autonomous external submissions.

Run the UI/API and PostgreSQL with `docker compose up -d --build` from the repository root or
`jobops/`. Normal application use is Docker-only; do not start host UI/API/dev/test servers unless
the user explicitly requests host-side development. Stop any project servers before switching to Docker.

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
