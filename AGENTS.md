# Repository Guidelines

## Current State

The runnable JobOps application lives in `jobops/`. It is a Next.js App Router modular monolith with
PostgreSQL/Drizzle, private local PDF uploads, complete assistant prompts and direct application/outreach
records. Legacy mission data remains stored, but its UI and agent endpoints are retired. There are no LLM calls or autonomous external submissions.

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
- Current workflow preference (2026-10-01): start simple and enhance incrementally. Give each activity a proper page, a concrete label and one obvious next action. The complete editable discovery prompt belongs at the top, ready to copy into an existing ChatGPT or Claude conversation.
- The user explicitly removed agent API setup, progress tracking, proposals and approval machinery from the requested experience. This supersedes the earlier agent-task workflow. Keep the user's application/outreach decisions in a straightforward manual flow; do not add internal AI calls or automatic sending.
- The landing page brings together personal profile/portfolio links and India-focused job sites in recognizable icon cards, alongside graphs of real recorded activity. Keep a prominent Find openings starting point. Do not invent activity, profile views, impact scores or ATS results.
- Resumes are user-provided files. Preserve and preview originals and revised versions; track bullet changes, exact company/role usage, and source-labelled assessments for the specific resume and job description. Resume rewriting happens in the user's external assistant conversation.
- Make on-demand email refresh, date-based grouping and urgent action items prominent. Start with this core workflow before adding other features.
- Option A (spacious cards) was approved on 2026-10-01 for the simple prompt-first pages. The gallery remains available at `/gallery/simple`. Use shared Tailwind 4 theme tokens; avoid component-local palette literals.
- Option B (compact cards) was approved on 2026-10-01 for Companies, with separate Bengaluru and Hyderabad sections. The live company gallery remains at `/gallery/companies`. Resume references follow a selected family’s current version; application records retain their exact submitted version.
- Companies redesign approved and implemented on 2026-10-01 at `/companies`: segmented Grid/Compare/Pipeline switcher, compact cards with pay range, rounds, bonus/stock/benefits and style mix, a compare table on one shared LPA scale, a pipeline board, and a tabbed company page (layout B) with metric tiles. Spec: `jobops/docs/superpowers/specs/2026-10-01-companies-redesign-design.md`. Compensation facts must carry numeric `currency` + `fixedAnnual`/`totalAnnual` and `role`; interview facts need typed round `kind`s, `roundCount` and an `outcome` enum. Stock stays in its original currency and is never converted.
- Home redesign approved on 2026-10-01 from the live gallery at `/gallery/home` (picks: identity card A, live profile mosaic B, job-site icon cards A, linear-bar loading popup A, shape-morph buttons C). Profile previews use browser-side embeds only (live portfolio iframe, GitHub avatar and contribution graph, sandboxed LinkedIn badge); Medium and other sites that block framing open in a new tab. The loading popup appears app-wide for navigations and saves slower than 200 ms. Spec: `jobops/docs/superpowers/specs/2026-10-01-home-redesign-design.md`.
- Exclude QA, testing, SDET and test-automation roles from opening discovery and company research (2026-10-01). Project44 and Everpure were deleted at the user's request; do not re-add them.
- Company shortlist policy approved on 2026-10-02: require at least one sourced, role-specific INR annual compensation report of at least ₹15 LPA. Use the source-stated annual total when available and annual fixed salary otherwise; never infer totals or convert stock. Prefer SDE-2 or equivalent and higher; SDE-1 qualifies only when its recorded annual amount strictly exceeds ₹20 LPA. Historical fresher headline CTCs and reports with an unclear annual period cannot qualify a company on their own. Do not restore removed companies without new qualifying evidence. Keep database backups and deletion manifests private and uncommitted.
- Suggestions are editable starting points. Support custom goals and user-approved preferences supplied from existing assistant conversations. Do not assume access to ChatGPT or Claude memory.
- Consolidate LinkedIn, GitHub, portfolio websites and job portals. Support profile improvements and project showcases through clear prompts and notes, without another task/proposal layer.
- Provide a step-by-step walkthrough of finding an opening, saving its description, reviewing a resume and recording an application once the production flow is ready.
- Current color preference (2026-10-01): neutral white/charcoal surfaces with Google blue for primary controls, red for decline/destructive actions and yellow for review. The user explicitly approved Google blue or red and asked to remove the green theme; this supersedes the earlier no-blue preference. Avoid cyan glows and brown, terracotta, beige or peach themes.
- Follow Google Material 3 styling: tonal surfaces, paired foreground/container colors, rounded panels, pill-shaped controls and clear active states. Keep page backgrounds neutral and concentrate recognizable Google-style colors in action controls; avoid tinting the entire UI with a custom seed. This supersedes the earlier Mica/glass and warm theme directions.
