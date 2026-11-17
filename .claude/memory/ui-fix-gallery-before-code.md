---
name: ui-fix-gallery-before-code
description: "For UI fixes, first mark issues on the current UI, then show a before/after gallery of only the chosen items, then code"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4a135154-891b-4e83-ac1e-1f6609a809f7
  modified: 2026-11-17T12:15:36.696Z
---

For UI changes in JobOps, the user wants this order: (1) mark issues on screenshots of the current UI and let them choose; (2) show a gallery with "now" next to "after" for only the chosen items, everything else untouched; (3) code only after they pick. Never propose a full redesign when they asked about issues, and never start coding fixes before the before/after gallery.

**Why:** On 2026-11-17 they pushed back twice: a full mail-page redesign gallery "messes up existing UI", and coding fixes without showing the target was not OK.

**How to apply:** Keep options minimal and anchored to the current look. Code should be loosely coupled, highly cohesive, in well-organised folders (small focused files, e.g. a new component in its own file rather than growing a 500-line file), and not over-engineered. Related: [[resume-revisions-by-agent]]
