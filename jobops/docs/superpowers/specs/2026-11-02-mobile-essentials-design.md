# Mobile essentials

Approved in the live gallery on 2 November 2026: navigation A, analytics A, mail A,
applications B. The revised application journey uses connected circles with dates and
one list, without Needs you / Waiting / Closed tabs. The user authorized implementation,
removal of every gallery, and ongoing atomic commits without further confirmation.

Below 768px, JobOps opens on an Overview with real recorded analytics and attention mail.
The three bottom destinations are Overview (`/`), Mail (`/mail`) and Applications
(`/applications`). Keep the compact header, theme switch and iPhone safe-area spacing.
Desktop retains its existing pages and navigation.

Overview shows sent applications, applications currently interviewing, offers received and
closed applications, plus sending activity for 7 or 28 India calendar days. Exclude
previous employment and outreach from application analytics. Never invent missing dates.
Mail is an attention-only inbox with expandable messages, tags, inbox provenance and
on-demand refresh. Reuse existing outcome forms, placement, Just info and Undo rules;
required dates, multiple-role choices and refusals still apply. A focused handled email
may remain visible long enough to inspect the result or Undo Just info.

Applications show all records in one list, next actions first, with a dated circle journey
and one next step. Rejection stops the journey at the appropriate step. Rows expand in
place using the existing query links and forms. Previous employment stays off this list.

Remove all gallery routes, demo components and dead gallery styles and links. Preserve
shared production components and historical design specifications. Use Docker for all
UI/API servers. Tests may mutate only the marked `jobops_e2e` database.
