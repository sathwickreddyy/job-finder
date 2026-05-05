# Repository Guidelines

## Project Structure & Module Organization

This is a local-first job search tracker with a FastAPI/SQLite backend and React/Vite frontend.

- `app/` contains Python code: CLI entrypoint in `main.py`, FastAPI routes in `app/api/`, sources in `app/sources/`, scoring in `app/scoring/`, storage in `app/storage/`, and resume helpers in `app/resume/`.
- `web/` contains the React 18 + TypeScript SPA. Routes live in `web/src/routes/`, shared UI in `web/src/components/`, and API helpers/types in `web/src/lib/`.
- `tests/` contains Python `pytest` tests. Frontend tests are colocated as `*.test.ts` or `*.test.tsx` under `web/src/`.
- `config/` stores YAML seed data, `resumes/` stores markdown resume variants, and `data/` stores generated local state.

## Build, Test, and Development Commands

- `docker compose build` builds API and web images.
- `docker compose up -d api web` starts web `:47130` and API `:47131`.
- `make test` runs backend `pytest`, then frontend Vitest.
- `make lint` runs backend `ruff`, then frontend ESLint.
- `.venv/bin/pytest -q` runs only backend tests.
- `cd web && npm run dev` starts the Vite dev server.
- `cd web && npm run build` type-checks and builds the SPA.
- `make types` regenerates `web/src/lib/api-types.ts`; the API must be running.

## Coding Style & Naming Conventions

Use Python type hints and Pydantic models for shared data shapes. Keep backend modules snake_case and tests named `test_*.py`. Run `ruff` before submitting.

Frontend code uses TypeScript, React function components, Tailwind utilities, and 2-space indentation. Name components/routes in `PascalCase.tsx`; colocate tests as `Component.test.tsx`. Keep generated API types in `web/src/lib/api-types.ts`.

## Testing Guidelines

Add or update tests with behavior changes. Backend tests should cover models, storage, scoring, sources, and API routes. Frontend tests use Vitest and Testing Library; prefer user-visible assertions. Run `make test` before PRs that span both stacks.

## Commit & Pull Request Guidelines

Git history uses concise Conventional Commit-style subjects, for example `feat(docker): ...`, `docs(spec): ...`, `chore(memory): ...`, and `test+ci: ...`.

PRs should include a short description, test results, linked issues or docs where relevant, and screenshots for UI changes. Note schema, config, or environment changes explicitly.

## Security & Configuration Tips

Do not commit secrets, personal production resumes, or generated SQLite data. Use `.env` locally, keep `.env.example` shareable, and ensure optional integrations such as Notion, Gmail, Outlook, and LLM providers degrade when credentials are missing.
