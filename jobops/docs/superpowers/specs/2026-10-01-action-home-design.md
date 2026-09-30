# Action home and supervised agent workflow

The user selected gallery direction A on 2026-10-01. Implement Home, Opportunities,
Inbox, and My profile, using the Mica background language from sde-prep-platform
and Living Moments. Keep the existing Next.js / React / Tailwind 4 modular monolith.
Use semantic Tailwind tokens for all new components, with dark and colourful light
themes. Retain existing detail routes as contextual tools rather than primary navigation.

My profile brings LinkedIn, GitHub, portfolio websites and job portals together.
Keep personal sites and project showcases as named links with descriptions and
editable improvement goals. Create profile-improvement or showcase tasks from the
hub, retain drafts/evidence, and require approval before any external publication.

Home offers five editable task starters and a custom task. It shows pending human
decisions, time-sensitive recruiting mail, and persistent task history. No fictional
content is inserted. A user can start with a goal without completing a large profile.

Store freeform working preferences and confirmed candidate facts separately. Users
can paste context prepared with ChatGPT/Claude, edit it, and save it. Each task captures
an editable preference snapshot. Existing assistant memory is external; the handoff
asks the assistant to reconcile its context with the user and propose changes rather
than inventing facts. No LLM integration or automatic desktop-agent launching.

Task handoff includes instructions, task URL, scoped API access, India-only discovery
constraints, selected resume, expected results, and explicit approval requirements.
Agents can read one task and report progress, questions, proposals and execution
evidence. Task credentials cannot read other tasks or approve actions. Credentials
are hashed, expire, can be revoked, and are shown only at creation.

Store immutable proposals and human decisions. Approval refers to one exact proposal;
new revisions need new approval. Support discovered jobs, resume revisions, portal
changes, application preparation, referrals, cold email and LinkedIn outreach. An
external-action report must reference an approved proposal. Store reports as operator
claims with evidence; the application does not itself submit or send anything.
Resume proposals keep original PDFs, show change summaries, and become current only
after user approval. Discovered jobs can be imported after review using existing
validated import logic. Existing mission and application history remains available.

Inbox refreshes Gmail only on demand, with honest disconnected/error states. Group by
India-local dates and make assessments, interviews, offers and deadline language
prominent. Urgency is a deterministic hint with an explanation, not an inferred exact
deadline. Users can mark attention items done; application updates retain their
existing explicit review flow.

Validation covers task context/auth isolation, idempotency, stale/absent approval,
preference persistence, resume proposal preservation, mail grouping, empty states,
keyboard/modal behaviour, themes, responsive layouts and existing application flows.
