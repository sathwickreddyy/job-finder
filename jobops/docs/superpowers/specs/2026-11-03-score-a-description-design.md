# Score a description

Approved on 2026-11-03 from the live gallery at `/gallery/score-scratch` (picks: where you open it
C side sheet; paste and pick A one résumé, one box; must-haves B score first, adjust after; scores
A three dials; when you're done B nothing kept). The gallery was removed when this shipped.

## Why

The user wants to check a résumé against any job description they come across, without first
saving an opening, and without leaving the page they're on. Score against a job stays the way to
record scores; this is a scratchpad next to it.

## What it does

- A **Score a description** button on `/resumes` opens a side sheet from the right; the page stays
  visible behind a scrim. Escape, the close button or the scrim closes it.
- The sheet has one **Résumé** dropdown and one **Job description** box. The dropdown lists every
  version whose text was extracted, newest family first, labelled by family and version; it starts
  on the file open on the page (`?file=`), else the family's current version.
- **Score this description** asks the scoring service for suggested terms, marks every term a
  must-have, and runs all three checks at once. Each dial fills as its check returns; a failed
  check shows its own error and the others still show.
- Under the dials, the terms are tap-to-change chips (must-have → nice to have → not counted).
  Each change re-runs the Keyword check and ATS optimizer about 400 ms after the last tap; the
  ResumeNext dial doesn't depend on terms and isn't re-run. A late answer for an older term list
  is dropped. With no must-haves left, the two term-based dials show "—" and the sheet asks for at
  least one must-have.
- Changing the résumé or the description after a run clears the scores until **Score** is pressed
  again.
- **Copy results** copies a plain-text summary: résumé, the three scores, must-haves found and
  missing. **Close** clears everything.

## What it never does

- Nothing is saved: no opening, snapshot, term list, assessment, activity-log row or file. The
  description is held only in the sheet's state and in the requests that score it.
- No new scoring logic in Next.js. Terms come from `/v1/requirements/suggest`; scores come from the
  scoring service and ResumeNext through the existing clients.
- No claim that a score is an employer ATS result. The sheet says the scores are tool
  diagnostics, and that ResumeNext sends the text to resumenext.io.

## API (local, LAN-trusted like the other `/api/v1` routes)

- `POST /api/v1/score-text/terms` `{ description }` → `{ terms: ReviewedTerm[] }`, every term
  `required`. Description 1–20,000 characters (ResumeNext's limit, so all three checks can run).
- `POST /api/v1/resumes/{versionId}/score-text` `{ description, tool, terms? }` → `{ score }`.
  `terms` is required for the Keyword check and ATS optimizer and needs at least one must-have;
  ResumeNext ignores it. Tool failures return 502 with `{ error, code }` and the existing copy;
  an unextracted file is 422, an unknown one 404.
- Scores: Keyword check is the weighted coverage (`toLexicalDetails(...).weighted`), ATS optimizer
  is `match_score`, ResumeNext is `ats_score`, all read through the existing mappers.

## Display

- Reuses `Dials` from the revision panel with no current-résumé tick; the footnote states the
  colour bands and that these are tool diagnostics.
- Chips reuse the term-review chip styles; copy says must-have / nice to have / not counted.

## Calls left to the builder

- ResumeNext gets an empty target role and company (the scratchpad has no opening). Builder's call.
- The button sits in the Resumes page header next to Upload. Builder's call; other pages can add
  the same sheet later.
