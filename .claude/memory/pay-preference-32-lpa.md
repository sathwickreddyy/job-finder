---
name: pay-preference-32-lpa
description: User prefers companies paying above ₹32 LPA when choosing openings to apply to (2026-11-01)
metadata:
  node_type: memory
  type: user
  originSessionId: db689d72-4e6d-4357-8452-a68d1115b7ba
  modified: 2026-11-01T16:44:57.526Z
---

When ranking or choosing openings, the user prefers companies whose pay is above ₹32 LPA (stated 2026-11-01). This sits on top of the AGENTS.md shortlist floor (₹15 LPA, sourced).

**Why:** the user's own target for the current job search (5 yrs backend, Bengaluru/Hyderabad).

Only Hyderabad and Bengaluru openings/companies matter (stated 2026-11-01) — drop Remote, Pune, Chennai, NCR etc.

Store discovered companies, researched pay and openings in the JobOps Companies portal (`POST /api/v1/companies/batch`: COMPENSATION facts + ROLE facts with `openingUrl`), not only in scratch files — the user asked to reuse that space.

**How to apply:** rank by sourced evidence only — JobOps `company_facts` COMPENSATION (INR `totalAnnual`/`fixedAnnual`, role-specific) first, then the listing's own stated salary range; mark everything else "pay unknown" rather than guessing from brand. A company's best recorded figure may be for a more senior level than the opening, so say which role the figure is for.
