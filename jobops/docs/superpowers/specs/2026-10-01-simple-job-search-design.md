# Simple job search: approved Option A

Status: Option A approved on 2026-10-01; production implementation complete; review and verification recorded in `docs/verification.md`.

This replaces the earlier action-home brief. The user's latest instructions remove agent API setup, task progress, proposals and approval layers from the everyday experience. The app supplies prompts, stores files and records outcomes. The user's existing ChatGPT/Claude conversations do the research and collaborative writing.

## Start with one clear action

Home has one prominent **Find openings** action. Personal LinkedIn, GitHub, portfolio and other saved URLs appear as recognizable cards; missing links invite the user to add them. Indian job portals have separate cards. Graphs summarize actual recorded activity, without a demonstration dataset or fabricated site analytics.

The live comparison is at `/gallery/simple` (also reachable through `/gallery`). A/B switches compare spacious cards and a readable prompt with compact rows and an editable prompt. Both retain the already-approved Google blue, neutral surfaces, red destructive controls where needed, and shared Tailwind tokens. The system font remains unchanged. Content is left aligned; no decorative animation or gradient backgrounds.

## Pages and next steps

| Page            | Obvious action                    | What it keeps                                                              |
| --------------- | --------------------------------- | -------------------------------------------------------------------------- |
| Home            | Find openings                     | Personal site links and real search activity graphs                        |
| Find openings   | Copy the full prompt              | Editable role, India location and optional preferences below the prompt    |
| Job description | Save an opening                   | Company, role, source URL and complete description                         |
| Resumes         | Upload or view a file             | Original/revised versions, bullet changes, company/role usage, assessments |
| Resume prompt   | Copy the full prompt              | Exact job description and selected resume context when available           |
| Applications    | Record an application or outreach | Date, destination, company/role, exact resume version and outcome          |
| Inbox           | Refresh mail                      | Existing date grouping and clear high-priority actions                     |
| My sites        | Save a profile link               | Existing URLs, improvement notes and useful evidence of work               |

A direct application and a referral/cold message are simple choices when a role is ready. They do not create a mission or proposal. The app must never imply it applied, emailed, refreshed an account or updated a profile unless that operation actually occurred.

## Resume behavior

- Preserve original PDF bytes and keep revised uploads as distinct versions.
- Show the actual file with open/download fallbacks, never a generated substitute.
- Store the user's or assistant's bullet-by-bullet change notes alongside the exact version.
- Show which company and role used each file, distinguishing preparation from a submitted application.
- Keep external ATS-readiness estimates tied to the exact resume and job-description version. Record source, assessment date, scoring method, score/scale and findings. An absent assessment stays absent.
- Label the existing deterministic dictionary score as **keyword coverage**, separate from an external ATS estimate. Neither is an employer ATS result or a hiring guarantee.
- The app does not rewrite resumes or assume it can read external assistant memory.

## Interaction requirements

Buttons respond immediately to a press. Copy changes to Copied only after the clipboard succeeds and provides a manual fallback on failure. Selections have obvious active states; native dropdowns remain keyboard accessible. Reduced motion removes the press transform. Forms show validation, pending and saved states without artificial delays. Secondary settings stay behind a clearly named disclosure.

## Implemented gallery boundaries

- Reads current profile URLs, resume files/usage, saved openings and applications.
- Home charts use actual dates in Asia/Kolkata. Saved openings and sent applications are separate series. Drafts are excluded from the sent count.
- Copying prompts, changing preferences, switching layouts/themes, selecting resume details and viewing a local PDF are interactive.
- Preview forms are deliberately labelled temporary. They do not write personal data, seed the database, save assessments, apply to a job, contact anyone or create API credentials.
- Existing-record links and Inbox open the implemented production flow.
- Gallery controls remain previews; production pages persist the real records.

## Production implementation

The implementation reuses description snapshots, private PDF storage, profiles, application events and mail refresh. Spacious pages replace visible task routes; additive schema changes store version notes and sourced assessments. Historical records are retained.

Validate the complete path: copy an India-focused prompt → save a real description → upload/view an original and revised PDF → record changes/assessment → choose direct application or outreach → record the exact resume used → see the correct landing-page metrics and inbox actions. Then provide the user a concise step-by-step walkthrough with their first real opening.

## Gallery verification

On 2026-10-01, lint, TypeScript and targeted formatting checks passed. Local Chromium exercised all seven preview pages in both layouts at desktop and 390px mobile width (28 overflow checks), with no page errors. Verified the old gallery redirect, actual clipboard contents and copy failure feedback, prompt editing/reset, preference-driven prompt updates, dropdown changes, job-description context, resume detail selections, theme changes and chart selection. A synthetic PDF stayed in a local blob preview; a renamed HTML file was rejected. Shared button press feedback and its reduced-motion alternative were checked in Chromium separately. These checks validate the gallery, not completion of the replacement production workflow.
