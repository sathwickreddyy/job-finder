# Company timeline for Mail and company pages — design

Piece 2 of 4 in the connected workspace redesign. Builds on `2026-10-30-shared-mail-foundation-design.md` (one email record, tags, one attention flag, on-demand Check mail) and replaces its stopgap `/mail` UI.

## Why

Mail and company pages show the same story in different places: `/mail` lists emails, the company page lists applications, and the Applications lanes show a third view. A busy applicant should open one company and see everything in order: what they sent, every email from that company, rounds and outcomes, with the one thing to do next.

## Picks from the live gallery (`/gallery/timeline`, 2026-10-31)

| Section            | Pick | What it means                                                                                          |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------ |
| Company timeline   | B    | Day ledger, newest first: one dense row per entry, grouped by day; rows open in place.                 |
| Handling new email | B    | One button for the suggested outcome; other outcomes behind "Something else"; "Just info" beside them. |
| Tags and filters   | B    | Tonal pills that carry the colour; one tag at a time.                                                  |
| Mail rail          | A    | Two lines per company: latest signal under the name, due day or quiet days on the right.               |
| Company page       | B    | Timeline on the left; roles, pay and the interview loop beside it.                                     |

Decided earlier in the visual companion: the rail has one row per company, grouped Needs you, Waiting on them, Closed and Needs a home.

## 1. One company index

- `readCompanyIndex(now)` in `src/features/timeline/read.ts` returns one row per company: `{ key, name, slug, group, signal, due, newCount }`.
- It reuses the Applications pipeline: `readApplications` → `readMailTriage` → `buildQueue` → `buildLanes`. Mail and Applications therefore show the same needs-you signal (piece 3 depends on this).
  - Lane `needs` → Needs you, `active` → Waiting on them, `closed` → Closed.
  - Any open email whose `company_key` is the company's key also puts it in Needs you.
  - Companies with mail but no application records get a row too: Needs you with open mail, otherwise Closed.
- Needs a home holds mail with no `company_key`. Its count is the open emails.
- Order: Applications' lane order (urgency, then recent activity). Mail-only companies follow by latest email.
- Row text: the signal is the newest open email's kind ("Interview", "Offer") when there is one, otherwise the lane's next step. The due label is the lane's existing when-label, for example "Today, 3:00 pm", "Sun" or "2 days late".
- Excluded mail never counts anywhere (`notExcluded`).

## 2. The company timeline (one component)

- `readCompanyTimeline(key, { tag, q, application, cursor })` returns `{ company, roles, entries, nextCursor }`. `CompanyTimeline` in `src/features/timeline/timeline.tsx` renders it on `/mail` and on the company page.
- Entries:
  - **Emails** come from `listMail({ company: key, attention: "all", tag, q, application, cursor })`, 50 per page, as `MailItem`s.
  - **Steps** are the company's application events and rounds.
    - Mail-driven events (`MAIL_LINKED`, `MAIL_UNLINKED`, `ACKNOWLEDGEMENT_RECEIVED`) are dropped, because the email itself shows them.
    - Events whose `payload.mailMessageId` is on the timeline are dropped too; they annotate that email instead ("Recorded: Round scheduled").
    - Step text is the event's stored summary.
- Order: newest first, grouped by India date ("Today", "Yesterday", "Fri 30 Oct"). Booked rounds and OA deadlines in the future sit in a "Coming up" group above Today.
- Steps older than the oldest loaded email appear after "Show older", so a page never mixes a partial email history with a complete step history. When every email fits on one page, every step shows.
- A tag or search filter hides steps and shows only matching emails.
- With two or more roles, role chips filter by application. Company mail that is linked to no role shows only under "All roles".
- Each row shows a tonal tag icon, the sender (bold while open, with a "Needs you" pill), the subject (plus the role when there are several), and the time.
  - Selecting a row opens it in place: sender name and address, a note when the folder is not Inbox (for example "Outlook Junk"), the plain-text body (HTML is never rendered), then handling or the handled line.
  - Open emails show their handling bar without being opened.

## 3. Handling a new email

- **Suggested outcome:** the email's classification maps to an outcome through the existing `suggestedOutcome` table in `triage.ts`. The suggestion stands only if the resolved application allows it (`availableOutcomes`); otherwise "Just info" is the suggestion. One line under the button names the email kind behind the suggestion; nothing reads the email beyond its classification.
- **Primary button:** "Record round scheduled" (or the suggested outcome's label). Outcomes that need a time or deadline open the existing one-line form first.
- **"Something else":** reveals the other available outcomes as chips. "Just info" always sits beside the primary button.
- **Which application:** the linked one first, then the company's only open application.
  - With several open, the button first asks "Which role?" and shows the open roles.
  - With none, only "Just info" and "Place at…" are offered.
- **Writes** go through the existing `handleMailAction` → `handleMail`. The handled line reads "Recorded: …" or "Marked as just info".
- **Undo** exists only for Just info.
  - `PATCH /api/v1/mail/{id}` gains `attention: "open"`. It reopens an email handled as Just info, writes `MAIL_REOPENED` to the activity log, and returns 409 once an outcome was recorded from that email.
  - Recorded outcomes are corrected on the application page, as today.
- **Placement:** "Place at…" (Needs a home, or a wrong company) uses the existing `updateMail`.

## 4. Tags, search and filters

- Tag pills sit in the pane header: "All" plus five tonal pills with counts, one at a time. The colours are final as the current `--tag-*` tokens.
- Search sits at the top of the rail and looks through fetched mail (subject, sender, body) with `listMail`'s `q`.
- A tag or a search narrows the rail and the timeline together:
  - The rail keeps only companies with matching mail and shows "n matches".
  - The timeline shows only those emails.
  - Clearing restores both.

## 5. Mail view (`/mail`)

- **Layout.** On a wide screen, the rail (18.5rem) sits beside the pane. On a phone, the rail is the page; choosing a company opens the pane with an "All companies" back link. Nothing scrolls sideways.
- **Rail header:** Check mail with the last-checked time, an Inboxes button that opens the existing connections and folders panel in a drawer, and search.
- **Groups:** Needs you and Waiting on them start open. Closed starts collapsed. Needs a home starts open only while it holds open mail.
- **Rows:** the name, bold with a count badge while there is new mail, and the due label on the right. Due today uses the link colour; overdue and long-quiet use amber. The second line is the signal.
- **Pane header:** the company name (linking to its company page), city, role chips, the next step, tag pills and a secondary "Mail rule" button that opens the existing company rule editor.
- **Default:** the first Needs you company is selected. With nothing in Needs you, the pane says "Nothing needs you" with the last check time and Check mail.
- **URL:** `/mail?company=<key>&tag=<tag>&q=<text>&role=<applicationId>&mail=<id>`, plus `?view=home` for Needs a home.
  - `company` also accepts a name or alias, resolved with `companyKeyFor`.
  - `mail` opens that email and scrolls to it.

## 6. Company page

- Tabs become Timeline, Compensation, Interviews and About.
  - Timeline is the default and replaces Your progress; `?tab=progress` opens Timeline.
  - Compensation, Interviews and About keep their current content, and the metric tiles move onto those tabs.
- The Timeline tab has two columns on a wide screen. `CompanyTimeline` is on the left; the aside on the right stays in view and holds:
  - **Your roles:** each application with its method, status and resume file, plus saved openings not yet applied to.
  - **Pay:** the summary range and its basis, linking to Compensation.
  - **Interview loop:** the typical rounds and the report count, linking to Interviews.
- On a phone, the aside sits above the timeline as a compact two-column grid.
- The header keeps the company name, city and links, and adds the next step line.

## 7. Links, redirects and cleanup

- `/mail/<id>` redirects to `/mail?company=<key>&mail=<id>`, or to `?view=home&mail=<id>` for unplaced mail. Excluded or missing mail returns 404. The page's own UI is deleted.
- Old links are redirected:
  - `/mail?view=…` drops `view`.
  - `?application=<id>` becomes that application's company plus `role=<id>`.
- The company page's mail link and the Applications detail "All mail" link point to the new URLs.
- **Deleted:** the stopgap Needs attention and All mail tabs, the "All companies" scope list and the flat email list.
- **Kept:** the connections, folders and rule components, now reached from the rail header and pane header.
- The gallery stays at `/gallery/timeline` as the record of the picks.

## 8. Testing

- **Unit:**
  - Timeline assembly: dropping mail-driven events, annotating emails with their recorded outcome, the Coming up group, India day grouping, role filter and pagination boundaries.
  - Index rows and groups: lane mapping, open mail forcing Needs you, mail-only companies, Needs a home.
  - Suggestion resolution: allowed, disallowed, which role, no application.
  - URL mapping and redirects.
- **Integration (`jobops_e2e` only):**
  - `readCompanyIndex` and `readCompanyTimeline` over fixtures with records, events, rounds, placed and unplaced mail, and excluded mail.
  - Just info reopening, and its 409 after an outcome.
- **Browser:**
  - Choosing a company.
  - Recording the suggested outcome, Something else and Which role.
  - Just info and Undo.
  - Tag pill and search narrowing the rail and the timeline.
  - Placing a Needs a home email.
  - The company page's timeline and aside.
  - The redirects.
  - Phone width with no horizontal scroll, and light and dark screenshots.

## Decisions to confirm

1. **Overdue silence counts as Needs you**, as on Applications, rather than staying in Waiting on them with an amber flag as in the gallery sample. If wrong: one group rule.
2. **Research stays in tabs** behind a Timeline default, because Compensation and Interviews are too large for the aside. If wrong: a layout change on one page.
3. **`/mail/<id>` becomes a redirect** into the timeline, removing a second email screen. If wrong: restore the page from git.
4. **Companies with only handled mail and no application are listed under Closed.** If wrong: a fifth group.
5. **Undo exists only for Just info.** Outcomes are corrected on the application page. If wrong: an outcome undo needs its own design.
6. **The suggestion's reason is the email kind**, since there is no AI reading the email. If wrong: copy only.

## Out of scope

Applications lanes and previews (piece 3), Home (piece 4), scheduled checks, history recovery, editing or sending mail, rendering HTML email, and new classification rules.
