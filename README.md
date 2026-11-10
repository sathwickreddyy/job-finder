# Job finder workspace

The application is [JobOps](jobops/README.md), a personal career workbench with companies, sourced developer research, jobs, applications, a PDF resume vault, profiles, contacts and recruiting mail.

Run `docker compose up -d --build` from this directory to start the UI/API, PostgreSQL and resume scoring service in Docker. Open [JobOps](http://127.0.0.1:3210). See the [application README](jobops/README.md) for first setup, database commands, optional mail configuration, tests and deployment notes.

Resume compatibility runs in its own [Python scoring microservice](services/resume-scoring/README.md),
included as the separate `resume-scoring` container. Its API documentation is at
[localhost:3212/docs](http://127.0.0.1:3212/docs). It can also run independently of JobOps.

External browser agents: read the [Company research API and working curl examples](jobops/README.md#company-research-api--for-browser-agents-and-curl). JobOps listens on `0.0.0.0:3210`; company ingestion uses ordinary JSON REST calls on the trusted LAN with no ingestion token.

Codex, Claude Code, Antigravity and other assistants share the [JobOps API automation guide](jobops/docs/api/automation.md). It lists what agents can do through the API and which steps require user confirmation or an external site.

## Installed assistant skills

Keep this inventory updated when project-related assistant skills are installed, replaced or removed.
These skills provide assistant instructions; application runtime dependencies are managed separately.

| Skill | Source | Installed location | Role in this project |
| --- | --- | --- | --- |
| `job-apply` | Project-owned shared playbook | Canonical `.claude/skills/job-apply/SKILL.md`; Codex `.agents/skills/job-apply` links to it | One-opening applications, referral deadlines, master-based résumé checks, reusable answers, mail verification and independent daily Naukri maintenance. |
| `resume-ats-optimizer` | [Paramchoudhary/ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills/tree/main/skills/resume-ats-optimizer) | User-level `~/.agents/skills/resume-ats-optimizer/SKILL.md` (verified 2026-11-02) | Resume/JD review guidance and the baseline keyword-coverage rubric used by the separate scoring service. |

Say **Apply for this job: <link>**, invoke `$job-apply` in Codex or `/job-apply` in Claude Code.
Without an identified opening, the assistant asks which one. Another assistant or a person can
read [the same ordered skill](.claude/skills/job-apply/SKILL.md) and its references directly.
Private answers/handoffs/maintenance receipts stay under ignored `jobops/data/job-apply/`.
See the [approved workflow design](jobops/docs/superpowers/specs/2026-11-03-job-apply-skill-design.md).

To install this skill in another assistant environment:

```sh
npx skills add https://github.com/Paramchoudhary/ResumeSkills --skill resume-ats-optimizer -g -y
```

The installed copy has no declared version; this command follows the upstream repository's current
default branch. Review its instructions before adopting updates. The Docker service implements its
own versioned scoring code and runs without the skill installed. It does not execute `SKILL.md` at
runtime. The skill's keyword formula is a lexical coverage measure, not a verified employer ATS score
or a universal pass threshold. See the [scoring methods and limits](services/resume-scoring/README.md#what-the-scores-mean).
