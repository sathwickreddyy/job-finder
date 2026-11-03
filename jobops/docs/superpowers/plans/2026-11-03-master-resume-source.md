# Master résumé source implementation plan

> Execute inline with superpowers:executing-plans. Do not commit unless requested.

**Goal:** Implement approved master-only A and pin its entry above the timeline.
**Architecture:** Mark one resume version per family as the master anchor; store
immutable DOCX revisions in a separate table and private file storage. Render
master text and ledger conditionally in the existing page, leaving applied files
on the existing PDF/fit path.
**Stack:** Next.js, Drizzle/PostgreSQL, bounded fflate/XML extraction, Vitest.
**Spec:** `../specs/2026-11-03-master-resume-source-design.md`.

## Constraints and verification focus

Docker-only application checks. Reuse this checkout on `codex/master-resume-source`.
Preserve every submitted file/hash, base id and application link. Never infer a
master from `isCurrent` or its label. Validate actual DOCX bytes, keep concurrent
updates from losing data, and show historical source dates honestly. Keep the
master visible above timeline rows even under Sent, but respect text search.

## Task 1: Master source persistence and files

- [x] Add failing DOCX extraction/delta tests and integration coverage for immutable
      revisions, stale edits, factual corrections and preservation of PDF records.
- [x] Add `resume_versions.is_master` with a unique per-family partial index and
      `resume_master_revisions` containing typed blocks, reason, source date,
      correction flag and DOCX/optional PDF private storage references.
- [x] Implement bounded DOCX extraction, paragraph deltas, row-locked append-only
      writes, typed reads and agent GET/POST plus safe current/historical downloads.
- [x] Run targeted unit and marked `jobops_e2e` integration tests in Docker.

## Task 2: Master-only view and pinned entry

- [x] Test that a master is outside dated lineage, remains accessible under Sent,
      respects search, and an ordinary default file is not treated as a master.
- [x] Pin explicit masters above the dated file rows. Render approved A using the
      current content/inspector columns; add DOCX download, optional PDF preview,
      focused update drawer, and copyable historical wording with correction labels.
- [x] Verify application PDFs and their fit inspector retain their current path.
- [x] Run relevant resume rendering tests, typecheck and production Docker build.

## Task 3: Import, verify and hand off

- [x] Back up the local database and audit exact source/application references.
- [x] Import the preserved November 1 and 2 DOCXs with explicit source dates;
      do not overwrite the baseline or any submitted PDF. Record source provenance.
- [x] Verify real master/download/ledger behavior and an existing application in
      the browser, including narrow-screen behavior; save proof screenshots.
- [x] Update guidance/API docs, record verification, and propose one logical commit.

## Verification

844 unit tests passed; 19 targeted marked-database tests passed. Production Docker
build and typecheck passed. Read-only review findings were fixed and rechecked.
The two preserved DOCX sources were imported with source dates, and downloads
matched their bytes. All existing PDF rows and application links were compared
with the private backup and are unchanged. Browser checks covered the pinned
master, Sent filter, update drawer, existing Target PDF/fit view and 390 px layout.
No commit was created.
