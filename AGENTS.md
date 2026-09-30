# Repository Guidelines

## Current State

This repository is a clean project skeleton. The previous implementation,
tests, dependencies, tooling, deployment configuration, and local data have
been removed. Do not assume any framework or runtime is installed or configured.

## Directory Structure

- `app/`: future backend source.
- `web/src/`: future frontend source.
- `tests/`: future tests.
- `config/`: future configuration.
- `data/`: ignored local generated data.
- `resumes/`: ignored local resume files.
- `docs/`: future documentation.

Directories currently contain only empty `.gitkeep` placeholders.

## Development

No build, run, lint, or test commands exist yet. Update these guidelines and
README.md when a new implementation establishes the stack and its commands.

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
