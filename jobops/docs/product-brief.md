> Historical initial brief. The approved [simple job-search design](superpowers/specs/2026-10-01-simple-job-search-design.md) and current README supersede its task, mission and agent-API requirements.

You are a senior staff-level full-stack engineer working autonomously on my machine.

Your task is to create a brand-new production-quality project called **JobOps**, a personal career operating system for managing job discovery, applications, resumes, profiles, recruiting emails, and structured missions that can later be executed manually by me or by interactive computer-use products such as ChatGPT Work/Computer Use, Codex computer use, or Claude Cowork.

This is NOT an AI API application.

Do NOT integrate OpenAI API, Anthropic API, Gemini API, LangChain, agent SDKs, MCP-based AI execution, or any paid LLM API.

The application itself must never invoke Codex, ChatGPT, Claude, or another LLM.

Instead, the application must expose structured information, mission pages, files, forms, import/export surfaces, and agent-friendly pages so that an interactive computer-use agent can open the application in a browser, understand a mission, perform actions on external websites such as Naukri, LinkedIn, company career pages, etc., and return to JobOps to record the result.

Think of JobOps as the **control plane and source of truth**.

ChatGPT/Claude/Codex are optional human-supervised operators, completely outside the backend architecture.

Do not ask me questions during implementation unless something is literally impossible to proceed with. Make sensible engineering decisions yourself, document them, implement them, test them, and continue until the application is runnable.

Do not stop after scaffolding.

Do not generate placeholder-only pages.

Do not implement fake functionality that merely renders buttons.

Build a usable V1 end-to-end.

# PRODUCT PHILOSOPHY

The central model is:

JobOps decides and remembers WHAT needs doing.

An operator decides HOW to perform the work.

An operator can be:

- HUMAN
- CHATGPT
- CLAUDE
- CODEX
- OTHER

But operator values are only metadata.

There must be no API integration with these systems.

The application should work perfectly even if every action is performed manually by me.

The core workflow is:

Entity -> Action -> Mission -> Operator performs work -> Result/Evidence -> JobOps updates state.

The application must be optimized for:

- one user initially
- local development on macOS
- eventual deployment to a private/public domain
- fast daily usage
- excellent UX
- explicit user control
- no job application spam
- no autonomous sending/submitting
- complete auditability
- easy use by computer-use agents
- strong structured data
- minimal operational complexity

# TECHNOLOGY STACK

Use:

- Next.js latest stable with App Router
- TypeScript strict mode
- React
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Drizzle ORM preferred; Prisma is acceptable only if there is a strong implementation reason
- Zod for runtime validation
- Docker Compose for local PostgreSQL
- NextAuth/Auth.js only if authentication meaningfully improves V1; otherwise implement a simple local single-user protection mechanism and document production auth
- Vitest for unit tests where appropriate
- Playwright for important end-to-end flows
- ESLint
- Prettier

Prefer a single Next.js repository rather than unnecessary frontend/backend separation.

Do not introduce:

- Kubernetes
- Redis
- Kafka
- Temporal
- Celery
- microservices
- unnecessary queues
- GraphQL
- separate FastAPI backend

unless there is an extremely strong reason.

This should be a clean modular monolith.

# DEVELOPMENT EXPERIENCE

The application must be runnable with approximately:

git clone ...
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev

Provide useful scripts such as:

npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio

The project must successfully build before you consider the implementation complete.

# HIGH-LEVEL UI

Create a polished dashboard with these primary sections:

Today
Jobs
Applications
Resumes
Profiles
Mail
Missions
Settings

Use a professional desktop-first UI because I will mostly run it from my computer.

It should still be responsive.

Avoid an over-designed marketing dashboard.

This is an operational tool.

The UI should favor information density, clarity, keyboard-friendly workflows, fast filtering, and meaningful status indicators.

# TODAY / COMMAND CENTER

The Today page should answer:

What should I do today?

Show useful cards/sections such as:

New jobs awaiting review

Jobs shortlisted but not acted upon

Applications ready for review

Applications awaiting follow-up

Recent recruiting email events

Upcoming interviews

Profiles that have not been inspected/refreshed recently

Open missions

Missions waiting for my review

Recent activity

Include obvious actionable buttons:

Find Today's Jobs

Add Job

Review Shortlisted Jobs

Create Discovery Mission

Review Mail Updates

Review Applications

Inspect Naukri Profile

Create Profile Update Mission

View Follow-Ups

Do not invent metrics just to make the dashboard look impressive.

Use actual stored data.

# CORE DOMAIN MODEL

Design the database carefully.

Do not create one giant generic table.

At minimum implement entities equivalent to the following.

## CandidateProfile

This is the canonical source of truth about me.

Fields should support:

full name
preferred name
primary email
phone
current city
country
years of experience
current company
current role
current compensation optional
expected compensation optional
notice period
last working day optional
preferred locations
remote preference
desired roles
LinkedIn URL
GitHub URL
portfolio URL
career summary
work authorization answers
sponsorship answers
relocation preference
standard application answers
additional structured metadata

Standard application answers must support named questions and values.

Example:

"Are you authorized to work in India?" -> "Yes"

"Do you require sponsorship?" -> "No"

Unknown values must be explicitly representable.

Never guess UNKNOWN fields.

## Resume

Represents a logical resume family.

Examples:

Backend Senior

Platform Engineering

Data Platform

AI Platform

Fields:

id
name
slug
description
category
isActive
createdAt
updatedAt

## ResumeVersion

A Resume can have many versions.

Fields:

id
resumeId
versionLabel
originalFilename
storagePath
mimeType
fileSize
sha256
extractedText
summary optional
skills JSON
keywords JSON
experienceTags JSON
createdAt
isCurrent

Actual PDF files must be retained.

Provide a storage abstraction.

For V1, local filesystem storage is acceptable and probably preferable.

Create something like:

data/uploads/resumes/

Do not directly scatter file handling throughout route handlers.

Create a storage service abstraction so it can later move to Cloudflare R2 or S3.

Resume upload should:

validate PDF
calculate SHA-256
store the original file
extract text
create the version
support preview/download
extract deterministic keyword information where reasonably possible without an LLM

Use a suitable local PDF parser.

Do not OCR unless necessary.

## Job

Fields should include:

id
company
title
location
workMode
employmentType
canonicalUrl
source
externalId optional
experienceMin optional
experienceMax optional
salaryMin optional
salaryMax optional
currency optional
postedAt optional
firstSeenAt
lastSeenAt
status
notes
createdAt
updatedAt

Statuses might include:

NEW
REVIEWING
SHORTLISTED
IGNORED
PREPARING
APPLIED
CLOSED

Use a proper enum.

## JobSnapshot

Jobs change or disappear.

Preserve what existed when I reviewed/applied.

Fields:

id
jobId
capturedAt
description
requirements JSON
skills JSON
rawText
metadata JSON

When a job description is edited/imported again, create an appropriate snapshot instead of silently destroying useful history.

## JobResumeMatch

Store resume-to-job evaluation generated by deterministic keyword matching or manual user input.

Fields:

jobId
resumeVersionId
score
matchedKeywords
missingKeywords
manualNotes
createdAt

Do NOT pretend deterministic keyword overlap is sophisticated AI.

Clearly label it appropriately in the UI as keyword coverage / heuristic match.

## Application

Fields:

id
jobId
resumeVersionId
status
appliedAt optional
applicationUrl optional
source
currentStage
nextActionAt optional
notes
createdAt
updatedAt

Statuses/stages should support:

DRAFT
PREPARING
READY_FOR_REVIEW
APPLIED
ACKNOWLEDGED
ASSESSMENT
RECRUITER_SCREEN
TECHNICAL_INTERVIEW
MANAGER_INTERVIEW
FINAL_INTERVIEW
OFFER
REJECTED
WITHDRAWN
CLOSED

Model status/stage thoughtfully instead of creating contradictory values.

## ApplicationEvent

This is an append-only timeline/history.

Fields:

id
applicationId
eventType
source
summary
payload JSON
confidence optional
occurredAt
createdAt

Examples:

APPLICATION_CREATED
APPLICATION_SUBMITTED
ACKNOWLEDGEMENT_RECEIVED
ASSESSMENT_RECEIVED
INTERVIEW_REQUESTED
INTERVIEW_SCHEDULED
REJECTION_RECEIVED
OFFER_RECEIVED
MANUAL_NOTE

## Profile

Represents job portal profiles.

Fields:

id
provider
displayName
profileUrl
usernameOrEmail optional
status
lastInspectedAt
lastUpdatedAt
targetState JSON
knownState JSON
notes
createdAt
updatedAt

Providers should initially support:

NAUKRI
LINKEDIN
INSTAHYRE
WELLFOUND
CUTSHORT
OTHER

Never store portal passwords.

## Contact

Fields:

id
company
name
title
email optional
linkedinUrl optional
source
verificationStatus
verificationSource optional
notes
createdAt
updatedAt

Email verification statuses:

UNKNOWN
VALID
INVALID
ACCEPT_ALL
UNVERIFIED
MANUAL_VERIFIED

The V1 application does not need to automatically call paid email verification APIs.

It should support manually recording verification results and later integration.

## Mission

This is one of the most important entities.

Fields:

id
type
title
entityType
entityId optional
goal
status
priority
constraints JSON
input JSON
expectedResult JSON
createdBy
createdAt
startedAt optional
completedAt optional
updatedAt

Mission statuses:

DRAFT
READY
IN_PROGRESS
WAITING_FOR_USER
READY_FOR_REVIEW
COMPLETED
FAILED
CANCELLED

Mission types initially:

DISCOVER_JOBS
INSPECT_JOB
COMPARE_RESUME
PREPARE_APPLICATION
APPLY_JOB
INSPECT_PROFILE
UPDATE_PROFILE
FIND_CONTACT
VERIFY_CONTACT
REVIEW_MAIL
FOLLOW_UP_REVIEW
CUSTOM

## MissionStep

Fields:

id
missionId
sequence
title
instruction
status
requiresApproval
metadata JSON
createdAt
updatedAt

## MissionExecution

One mission may be attempted by different operators.

Fields:

id
missionId
operator
status
startedAt
completedAt optional
notes
createdAt

Operators:

HUMAN
CHATGPT
CLAUDE
CODEX
OTHER

Again: these are ONLY metadata.

No external AI API calls.

## MissionEvidence

Fields:

id
missionId
executionId optional
type
value
storagePath optional
metadata JSON
createdAt

Evidence types:

URL
TEXT
SCREENSHOT
FILE
CONFIRMATION
NOTE

## MailMessage

Store only recruiting/job-related messages that the user imports or Gmail sync later classifies as relevant.

Fields:

id
externalId
threadId optional
provider
sender
senderName
recipient
subject
snippet
receivedAt
bodyText optional
bodyHtml optional
classification
linkedApplicationId optional
processedAt optional
createdAt

## MailEvent

Fields:

id
mailMessageId
type
confidence
linkedApplicationId optional
status
details JSON
createdAt

Support classifications such as:

APPLICATION_ACKNOWLEDGEMENT
ASSESSMENT
INTERVIEW
REJECTION
OFFER
RECRUITER_OUTREACH
FOLLOW_UP
UNKNOWN

# RESUME VAULT

Build a strong Resumes experience.

The main page should display resume families and current versions.

For each resume show:

name
category
current version
last updated
keyword/skill chips
usage count
active/inactive state

Provide:

Upload Resume
Create Resume Family
Upload New Version
Preview PDF
Download PDF
View Extracted Text
View Keywords
Edit Tags
View Version History
Set Current Version
Archive

Create a useful PDF preview experience.

A browser-native PDF viewer is fine.

Show keywords grouped sensibly.

Do not artificially assign proficiency levels from keyword counts.

The application should make it easy for a computer-use operator to download the selected resume from a mission.

Every relevant mission page should expose a prominent "Download selected resume" control.

# KEYWORD EXTRACTION

Implement a deterministic initial keyword extractor.

The extractor should detect common engineering technologies and meaningful terms from resume text and job descriptions.

Use maintainable dictionaries/categories rather than hundreds of fragile regex statements.

Suggested categories:

languages
frameworks
databases
messaging
cloud
infrastructure
data
AI/ML
architecture
testing
observability
leadership

Example keywords:

Python
Java
TypeScript
Spring Boot
FastAPI
PostgreSQL
Snowflake
Kafka
Redis
AWS
Docker
Kubernetes
distributed systems
microservices
event-driven architecture
REST
gRPC
CI/CD
system design

The extracted keyword result must be editable manually.

Job/resume keyword comparison should be explainable.

Example UI:

Matched: Python, Kafka, PostgreSQL

Missing from resume: Kubernetes, AWS

Resume-only: Snowflake, FastAPI

Keyword coverage: 76%

Never call this an AI score.

# JOB MANAGEMENT

Jobs page must provide:

search
company filter
role filter
location filter
source filter
status filter
posted-date/freshness filter
experience filter
sort by newest
sort by recently added
sort by keyword coverage

Views:

table/list view
job details drawer/page

Job details should show:

company
role
location
source
posted date
URL
description
requirements
keywords
resume recommendations / keyword comparison
notes
application status
mission history
timeline

Actions:

Open Original Job

Shortlist

Ignore

Create Inspect Mission

Compare Resumes

Prepare Application

Create Apply Mission

Add Contact

Create Find Contact Mission

# BULK JOB IMPORT

This is critical for computer-use agents.

Create a dedicated agent-friendly import page:

/import/jobs

The page should support:

paste JSON
paste CSV
optional simple text table

JSON is the primary interface.

Expected format:

[
{
"company": "Example",
"title": "Senior Software Engineer",
"location": "Bengaluru",
"url": "https://...",
"source": "COMPANY_CAREERS",
"postedAt": "2026-09-30",
"experienceMin": 4,
"experienceMax": 7,
"description": "...",
"notes": "..."
}
]

Implement:

schema validation
clear row-level validation errors
URL normalization
duplicate detection
preview before import
merge strategy
skip duplicates
create snapshots where appropriate
import summary

Duplicate detection should consider canonical URL first and then sensible fallback combinations such as company + title + location.

A computer-use agent should be able to discover 20 jobs elsewhere, return to this page, paste structured JSON, validate, and import them with minimal clicking.

# JOB DISCOVERY MISSION

Create UI to generate a DISCOVER_JOBS mission.

Form fields:

desired roles
locations
minimum experience
maximum experience
sources
freshness
maximum results
required keywords optional
excluded keywords optional
companies optional
notes

Suggested sources:

Naukri
LinkedIn
Company Careers
Instahyre
Wellfound
Cutshort

When created, generate a clean human-readable mission page and machine-friendly context.

Example mission goal:

Find up to 30 recently posted jobs matching the configured criteria. Prefer official company career pages. Do not apply to anything. Return structured job records for import.

The mission should include the expected output JSON schema.

# MISSION UX

Every mission needs two representations.

Human view:

/missions/[id]

Agent view:

/missions/[id]/agent

The human view can be polished.

The Agent View must be extremely clear and intentionally simple.

Do not rely on visually clever cards.

It should display obvious headings and plain structured content:

MISSION ID

TYPE

STATUS

GOAL

TARGET ENTITY

INPUT DATA

CANDIDATE INFORMATION

SELECTED RESUME

CONSTRAINTS

STEPS

APPROVAL REQUIREMENTS

SUCCESS CRITERIA

EXPECTED OUTPUT

RESULT SUBMISSION LINK

RELATED LINKS

FILES

The agent page should contain explicit anchors/buttons such as:

Open Job

Download Resume

Open Profile

Open Result Form

Return to JobOps

Also expose:

/missions/[id]/context.json

This endpoint returns clean JSON describing the mission.

This is not an AI integration.

It is a structured representation accessible by a browser/computer-use operator.

The JSON should contain:

mission metadata
goal
entity
candidate details relevant to mission
selected resume metadata/download link
constraints
steps
success criteria
expected result schema
result URL

Avoid exposing unrelated private data.

# APPLY JOB MISSION

This is a major workflow.

When I click Create Apply Mission, the system should create something equivalent to:

Goal:

Prepare my application for Company X — Senior Backend Engineer.

Selected Resume:

Backend Senior v8

Constraints:

Do not submit final application without explicit human approval.

Do not fabricate skills.

Do not fabricate employment history.

Do not alter my resume.

Do not send emails.

If any required candidate information is UNKNOWN, stop and record the question.

Expected outcome:

Application completed and ready for my review.

Suggested mission steps:

Open application page.

Inspect current form.

Fill candidate details using CandidateProfile.

Upload selected resume.

Answer standard questions using canonical answers only.

Record any unknown or ambiguous questions.

Stop before final submission.

Return to JobOps.

Record result.

The application must support changing these instructions before creating the mission.

# RESULT CAPTURE

Create:

/missions/[id]/result

The result form should be very simple because computer-use agents may operate it.

Support:

status
summary
result URL
selected resume
unknown questions
notes
evidence URL
screenshots/files
application status update
profile state update
contact result
structured JSON result where relevant

When a result changes an underlying entity, do NOT silently overwrite important state.

For example, Apply Job result should be able to:

mark application READY_FOR_REVIEW

or

mark APPLIED only when appropriate

and append an ApplicationEvent.

Mission completion should remain auditable.

# PROFILE MANAGEMENT

Build a Profiles page.

Initial providers:

Naukri
LinkedIn
Instahyre
Wellfound
Cutshort

A profile details page should show:

provider
profile URL
last inspected
last updated
known state
target state
difference between known and target state
notes
missions

KnownState and TargetState may contain:

headline
summary
current role
experience
skills
preferred roles
preferred locations
notice period
current resume identifier

Create:

Inspect Profile Mission

Update Profile Mission

For Update Profile Mission, compute/display a clear diff.

Example:

HEADLINE

CURRENT:
Senior Software Developer

TARGET:
Senior Software Engineer | Backend & Platform Engineering | Python | Java | Distributed Systems

SKILLS TO ADD:
Snowflake
Distributed Systems

SKILLS TO REMOVE:
none

RESUME

CURRENT:
backend-v7

TARGET:
backend-v8

Mission constraints:

only apply approved differences
do not change unrelated fields
do not submit unknown data
record final observed state

Again, JobOps does not automate the external portal itself.

# APPLICATION TRACKER

Build both list/table and Kanban-style visualization if reasonable without overengineering.

Useful stages:

Preparing
Ready for Review
Applied
Acknowledged
Assessment
Recruiter Screen
Technical Interview
Manager Interview
Final Interview
Offer
Rejected

Application detail page should have:

job information
resume used
application URL
status/stage
timeline
mail events
missions
contacts
notes
next action
follow-up date

Allow manual movement between stages.

Every significant change should append an ApplicationEvent.

# MAIL

For V1, implement the database/UI and a clean Gmail-readonly integration boundary.

If Gmail OAuth can be implemented reliably within this project, implement it using gmail.readonly only.

Do NOT request send, modify, delete, label, or broad Gmail permissions.

If credentials are unavailable during implementation, the application must still work using a local/import mode.

Provide .env placeholders and clear setup instructions.

Support:

Connect Gmail / Configure Gmail

Sync recruiting mail

Mail inbox filtered to job-related messages

Manual link to application

classification

confidence

review queue

Do not auto-update an application for low-confidence classifications.

Implement deterministic matching first.

Useful patterns may include phrases like:

thank you for applying

application received

we received your application

next step

assessment

technical interview

interview availability

unfortunately

we have decided not to proceed

offer

recruiting team

Where reasonable, combine:

sender domain
company
subject
body phrases
existing applications

into confidence.

No AI API.

Suggested behavior:

high-confidence obvious acknowledgement -> propose/application event

high-confidence rejection -> propose/application event

ambiguous mail -> NEEDS_REVIEW

Provide a "Review Mail Updates" page.

Never send email from JobOps V1.

# CONTACTS

Provide contact management by company.

Fields:

name
title
email
LinkedIn
source
verification status
notes

Job page should show associated contacts.

Support a FIND_CONTACT mission.

Mission example:

Find an appropriate recruiter, hiring manager, engineering manager, or potential referral contact for this job.

Do not message them.

Return:

name
role
profile URL
email if publicly available
source
verification status if checked

Result should be easy to import.

# SAFETY AND EXPLICIT CONTROL

The UI must distinguish safe/read-only operations from consequential operations.

JobOps itself will not perform external computer actions, but mission constraints must communicate them clearly.

Use concepts equivalent to:

READ_ONLY

EXTERNAL_WRITE

USER_APPROVAL

IRREVERSIBLE

Examples:

Discover jobs -> READ_ONLY

Inspect profile -> READ_ONLY

Fill application -> EXTERNAL_WRITE

Submit application -> USER_APPROVAL / IRREVERSIBLE

Send recruiter email -> USER_APPROVAL

Modify Naukri -> USER_APPROVAL

Never create a default mission that instructs an operator to mass apply.

Never create an automatic mail-sending capability in V1.

# ACTIVITY AND AUDIT HISTORY

Create a lightweight ActivityLog.

Record relevant actions:

job created
job updated
job shortlisted
resume uploaded
resume version selected
mission created
mission started
mission completed
application status changed
mail linked
profile inspected
contact added

Today page may consume these.

# AGENT-FRIENDLY DESIGN

This is an important product requirement.

Interactive computer-use agents must find the app easy to operate.

Therefore:

Use semantic HTML.

Use real buttons.

Use proper labels.

Avoid icon-only critical actions.

Avoid drag-and-drop as the only way to perform an operation.

Provide text alternatives.

Use stable URLs.

Avoid hidden hover-only menus for essential actions.

Use clear form validation.

Do not make agent pages dependent on complex client-side animation.

Critical mission information should be present as normal DOM text.

Use tables and simple forms for bulk operations.

Provide copy-to-clipboard where useful.

Provide JSON import/export.

Every page should have descriptive headings.

Agent View should have extremely predictable layout.

# SEARCH

Implement useful global/local search where appropriate.

At minimum Jobs, Applications, Resumes, Contacts and Missions should be searchable.

Use PostgreSQL queries initially.

Do not add Elasticsearch.

# FILTER PERSISTENCE

Where reasonably simple, preserve important list filters in URL query parameters.

Example:

/jobs?status=SHORTLISTED&location=Bengaluru

This makes links shareable with computer-use agents and preserves state.

# SEED DATA

Create useful seed/demo data so the application is immediately understandable.

Use fictional company names or clearly marked demo data.

Seed:

CandidateProfile

3 resume families with a few fake keyword sets

5-10 jobs

several applications

Naukri/LinkedIn profiles

a few missions

a few application/mail events

Do not use my real personal secrets.

# SETTINGS

Include:

Candidate Profile

Job Preferences

Standard Answers

Resume Storage

Mail Integration

Mission Defaults

Data Export

Basic application preferences

Job Preferences should support:

desired roles
locations
min/max experience
preferred technologies
excluded roles
remote preference

These can prepopulate mission creation.

# DATA EXPORT

Because this is my personal career data, provide export capability.

At minimum:

jobs CSV/JSON

applications CSV/JSON

contacts CSV/JSON

missions JSON

candidate profile JSON

Optional full-data export if easy.

# ARCHITECTURE

Use a modular directory organization.

For example, something along the lines of:

src/
app/
components/
features/
jobs/
resumes/
applications/
missions/
profiles/
mail/
contacts/
candidate/
db/
lib/
services/
storage/
pdf/
keywords/
mail/
validation/
types/

Do not mechanically follow this if Next.js conventions suggest something cleaner.

Domain logic should not be embedded randomly inside React components.

Create service/domain modules for:

job import

duplicate detection

resume parsing

keyword extraction

resume/job comparison

mission generation

application event creation

mail classification

storage

# DATABASE

Provide migrations.

Use indexes where obvious.

Examples:

job canonicalUrl
job company/title
application jobId
mission status/type
mail externalId
resume sha256
application nextActionAt

Use proper foreign keys.

Use transactions for multi-step state changes where necessary.

Avoid soft-delete everywhere unless there is a genuine need.

# VALIDATION

Use Zod at boundaries.

Do not trust JSON import input.

Validate file uploads.

Validate URLs.

Normalize URLs when possible.

Reject unsupported resume types in V1.

Protect against path traversal in file storage.

Limit upload size.

# SECURITY

Do not store:

Naukri passwords

LinkedIn passwords

Google passwords

browser cookies

OpenAI credentials

Anthropic credentials

The application should never request them.

For local V1, provide reasonable protection against accidentally exposing personal data.

Add documentation explaining production considerations:

HTTPS

authentication

secure Gmail OAuth token storage

file storage permissions

CSRF considerations

database backups

Do not log sensitive OAuth tokens.

# ERROR HANDLING

Avoid generic "Something went wrong" everywhere.

Provide actionable messages.

JSON import errors should identify exact rows/fields.

Resume parsing failure must preserve the uploaded file if appropriate and let me retry.

Gmail being unconfigured must not break Mail UI.

External links being unavailable should not crash pages.

# TESTING

Write meaningful tests rather than chasing arbitrary coverage.

At minimum test:

job duplicate detection

job import validation

keyword extraction

resume/job comparison

mission context generation

mission result handling

application event creation

mail rule classification

unknown CandidateProfile values

Write Playwright tests for the most important happy paths:

upload resume

add/import job

create discovery mission

open agent view

create apply mission

record mission result

update application status

Do not mock everything to the point that tests prove nothing.

# README

Create an excellent README.

It should include:

what JobOps is

what it deliberately does NOT do

architecture

screenshots section placeholder if screenshots cannot be automatically generated

local setup

environment variables

database setup

Gmail read-only setup

resume storage

mission model

how to use with ChatGPT Work / Computer Use

how to use with Claude Cowork

how to use manually

backup/export

production deployment considerations

security model

limitations

future roadmap

Explicitly explain:

There is no OpenAI/Anthropic API integration.

An external computer-use agent merely interacts with JobOps and other websites as a user/operator.

# AGENT USAGE DOCUMENTATION

Create docs/agent-usage.md.

Show realistic workflows.

Example:

1. Open JobOps.
2. Create DISCOVER_JOBS mission.
3. Open mission Agent View.
4. In ChatGPT Work or Claude Cowork instruct:
   "Open this mission URL and execute it exactly. Do not exceed mission constraints."
5. Agent searches external sources.
6. Agent returns to /import/jobs.
7. Agent pastes structured results.
8. User validates/imports.
9. Mission is completed.

Another:

Create APPLY_JOB mission.

Agent fills external application.

Agent stops before Submit.

Agent records READY_FOR_REVIEW.

User reviews.

User manually submits or explicitly instructs agent to continue.

# INITIAL DAILY WORKFLOW

Optimize the application around this routine:

Morning:

Open Today.

Click Find Today's Jobs.

Create discovery mission using saved preferences.

Hand mission to ChatGPT/Claude if desired.

Import discovered jobs.

Review top jobs.

Shortlist interesting ones.

Compare against resumes.

For a selected role:

Create Prepare/Application mission.

Select resume.

Have an operator fill application.

Stop before submit.

Review.

Submit intentionally.

During the day:

Mail sync identifies recruiting updates.

Applications update only after deterministic/manual review.

Follow-ups appear on Today.

Occasionally:

Inspect Naukri profile.

Compare known state to target state.

Create Update Profile mission.

Agent/human applies explicit changes.

# VISUAL DESIGN

Aim for something similar in quality philosophy to Linear, Vercel dashboards, GitHub projects, Raycast, or a strong modern internal admin product.

Do not clone them.

Use:

clean typography
dense but readable tables
subtle borders
good spacing
excellent empty states
clear statuses
keyboard-accessible controls
dark/light mode if straightforward

Avoid:

giant gradients
marketing hero sections
unnecessary charts
AI sparkle icons everywhere
cartoon graphics
glassmorphism overload

This is a serious engineering tool.

# NO FAKE AI FEATURES

Never add:

"Ask AI"

"AI Optimize"

"AI Rewrite Resume"

"AI Job Score"

unless it works deterministically without an AI API and is clearly named appropriately.

If functionality is based on keyword overlap, call it:

Keyword Coverage

or

Resume/JD Match

not AI Match.

# IMPLEMENTATION STRATEGY

Implement incrementally but continue autonomously.

A sensible order is:

foundation and database

CandidateProfile/settings

Resume vault/upload/parsing

Jobs/manual add/import

keyword extraction + resume/job comparison

Applications

Missions

Agent View/context JSON/result forms

Profiles

Contacts

Mail domain + deterministic classifier

Today dashboard

Activity history

tests

documentation

polish

If Gmail OAuth becomes the only thing blocking completion because credentials are not available, implement the entire integration surface and fallback/import mode, document exactly what configuration I need, and continue with everything else.

Do not stop the project because external credentials are unavailable.

# DEFINITION OF DONE

Do not consider this complete until:

npm install succeeds

database starts using Docker Compose

migrations apply

seed works

dev server runs

production build succeeds

typecheck succeeds

lint succeeds

tests pass or any unavoidable issue is clearly documented

I can upload and preview a resume PDF

I can inspect extracted text and keywords

I can manually add a job

I can bulk import jobs using JSON

duplicates are detected

I can compare job keywords to resume keywords

I can create and manage an application

I can create a mission

Agent View works

context.json works

mission result submission works

I can manage job portal profiles

I can create a profile-update mission with a diff

I can manage contacts

Mail area works even without Gmail credentials

I can track application events

Today page shows actual actionable data

README explains the complete workflow

docs/agent-usage.md explains computer-use interaction

No OpenAI/Anthropic/Gemini AI API dependency exists anywhere in the repository

# FINAL EXECUTION INSTRUCTIONS

You are authorized to create this as a new project in the current working environment.

First inspect the current directory so you do not overwrite an existing project.

Create a new appropriately named directory, preferably:

jobops

If `jobops` already exists and appears unrelated, choose a safe alternative rather than overwriting it.

Do not delete unrelated files.

Use git.

Initialize the repository.

Commit logically if convenient.

You do not need to ask me to approve routine package installation, file creation, migrations, local Docker usage, linting, testing, or project scaffolding.

Do not pause merely to tell me what you plan to do.

Proceed with implementation.

When encountering an error:

investigate it
fix it
rerun the affected command
continue

Prefer solving problems over explaining them to me.

Before finishing, open/run the application locally if your environment permits browser verification.

Perform a final engineering review for:

broken flows
bad schema decisions
unused code
unsafe file handling
poor validation
placeholder UI
missing indexes
type errors
accessibility of important controls
agent-unfriendly interactions

Fix issues you discover.

Finally provide me a concise handoff containing:

project path

architecture summary

how to start it

environment variables I need

database commands

Gmail configuration still required, if any

implemented functionality

tests/build status

known limitations

recommended next improvements

Do not give me a tutorial before implementation.

Build the project.
