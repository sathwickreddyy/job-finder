---
name: Canonical resume lives in the portfolio sister project
description: Resume files (base .md, .docx, and .pdf) are maintained in the sathwick-portfolio sister repo; job-finder reads them via absolute paths, not copies
type: reference
---

Sathwick's canonical resume is maintained in the **sister project** `sathwick-portfolio`, not in this repo. The two projects are kept independent (no submodule, no clone-in-repo) — they sit side-by-side under `/Users/sathwick/my-office/professional_growth_projects/`.

**Expected locations (portfolio side):**
- `…/sathwick-portfolio/public/pdfs/resume.pdf`          — always present (live portfolio)
- `…/sathwick-portfolio/public/pdfs/resume.md`           — to be added 2026-05-06
- `…/sathwick-portfolio/public/pdfs/resume.docx`         — to be added 2026-05-06

**Experience signals (from portfolio constants):**
- Morgan Stanley — Senior Software Engineer, Liquidity Forecast Technology (Jul 2024 – present). Leading Gen AI initiatives, prompt engineering, agents.
- Amazon — SDE (Feb 2022 – Jun 2024). Distributed systems, Step Functions, EMR orchestration, saved $100K+/month, reduced boilerplate 40% across 10+ services.
- Oracle — Application Developer (Jan 2021 – Feb 2022). Business Analytics, RPD Generator, 43% SQL perf gain.
- YoE: ~5 years (since 2021). Primary stack: Python, Java, Spring Boot, FastAPI, React/TS, AWS (serverless, containers, big data), Gen AI.
- Source files: `sathwick-portfolio/src/constants/experiences.js`, `sathwick-portfolio/src/constants/about.js`.

**How to apply:**
- job-finder's `config/profile.yaml` exposes three resume path settings: `resume_md_path`, `resume_docx_path`, `resume_pdf_path`. Default to absolute paths pointing at the portfolio's `public/pdfs/` folder.
- The app must tolerate any subset of those files being missing (portfolio may add the `.md` / `.docx` later).
- The resume tailor reads the `.md` variant when present; falls back to `resumes/master.md` local stub if not.
- Never auto-write to the portfolio repo from job-finder — it's read-only from here.
- When seeding `resumes/master.md` in job-finder, use verbatim text from `experiences.js` and `about.js`. No fabrication, no paraphrase that inflates scope.
