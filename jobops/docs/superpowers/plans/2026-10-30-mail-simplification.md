# Mail simplification and consistency

**Goal:** Make the existing mail workflow understandable and keep provider checks, saved results and application links consistent.

**Execution:** Implement and review in this chat without subagents. No commits without an explicit request. Preserve Docker-only application use and personal data.

**Design:** Retain the approved cumulative list/reader workspace, neutral Material surfaces, system sans-serif and Google blue actions. Compare two live treatments for the toolbar, filters and message actions at `/gallery/mail/controls` before replacing production controls. Refresh is the starting action; custom provider search, accounts and patterns are secondary. Gallery interactions use fictional data only.

## Corrections within the existing flow

- [ ] Add regressions for repeated provider identities within a batch in both scan paths. Update in-batch identity lookups after each persisted message; count each discovery once and preserve account boundaries.
- [ ] Keep company search saved results authoritative rather than merging stale transient results into saved pages. Keep the reader within the visible filtered page and preserve account context on company navigation.
- [ ] Synchronize the main workspace search with URL navigation; bind application-link choices to the selected message; clear misleading pending labels and preserve the reader on failed operations.
- [ ] Check linked-mail consistency between company results and the main workspace. Preserve explicit user links across rule changes and cached match decisions.
- [ ] Build the live controls gallery, verify it in Docker in dark/light and narrow layouts, and obtain the user's visual selection before applying the larger UI simplification.

## Validation

Run targeted regressions, the existing unit suite, TypeScript, ESLint and a production Docker build. Database regressions may use only the existing marked `jobops_e2e` database with synthetic providers. Review the running UI without triggering real scans or changing personal application/mail records. No schema, infrastructure or dependency changes are needed.

## Review focus

Repeated messages in the same page; immutable identities across folder moves; separate accounts sharing an Internet Message-ID; back/forward while filters change; link targets carried into another message; stale transient search results after exclusion; manual links with unchanged rule revisions; partial provider scans and truthful completion feedback.
