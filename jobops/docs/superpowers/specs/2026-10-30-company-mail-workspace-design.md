# Company mail workspace — approved 2026-10-30

The current broad classifier imports networking and promotional mail; Outlook only searches Inbox and Gmail's initial query covers 30 days. This design replaces that experience with application and outbound-outreach updates, folder coverage and a separate historical recovery workflow. No LLM calls, scheduled polling, automatic sending or inferred application outcomes.

## Visual direction — revised after rejection on 2026-10-30

The user rejected both previous layouts, including the earlier B selection. Too many boxes, explanations and settings obscured mail. The required structure is cumulative results in one place, per-company mail and per-application mail, all as views of the same tracked messages. The new gallery at `/gallery/mail` replaces the A/B selector with one working direction; the revised cumulative mail-client layout was approved on 2026-10-30.

Design process follows Anthropic's Frontend Design skill. Palette uses the existing theme, with no component palette literals: neutral surface (`#202124` dark / `#f8f9fa` light), card (`#292a2d` / `#ffffff`), foreground (`#e8eaed` / `#202124`), primary (`#8ab4f8` / `#1a73e8`), review (`#fbbc04`), and destructive (`#f28b82` / `#c5221f`). Keep the app's system sans-serif for Material continuity. Type roles: 24px page title, 16px conversation subject, 14px messages, 12px provenance. All content is left aligned.

```
Mail                         Search                  Check mail
All mail | Companies | Applications      [scope if needed]
-----------------------------------------------------------
Latest       | compact conversation list | selected message
History      | grouped by received date  | company/application
Excluded     |                          | thread history
Accounts     |                          | review action
-----------------------------------------------------------
                folders / patterns in a secondary sheet
```

One outer workspace surface, horizontal row separators and a single selected row establish hierarchy. No hero, KPI tiles, repeated provider cards, explanation banners or permanent rule form. The boldness belongs to readable message subjects and clear scope changes. Secondary prose appears only in empty states and details. Company/app selectors set context without copying messages. Genuine employer updates, known outbound-contact replies, historical mail and excluded LinkedIn notifications are labelled sample data in the gallery. Rules and coverage are secondary dialogs; they do not dominate the initial view. On small screens, conversation list and reader switch views with a Back action.

Review against the brief: a card grid and separate dashboards would reproduce the rejected direction, so both were removed. The three scopes share one cumulative list, one selection model and one history policy. No new email is fetched from the gallery.

## User intent

This is a personal job-search tool. Prioritize updates on the user's applications and replies from people the user contacted. A saved contact is not proof of outbound outreach. Incoming connection requests, referrals requested from the user, newsletters, profile notifications, job digests and generic networking content do not belong in Latest. Genuine unsolicited job opportunities can be reviewed separately as leads; they must not create application records or urgent application actions by themselves.

LinkedIn notifications need positive evidence of a reply from a recipient in recorded outbound outreach: a stable profile URL or a verified identity extracted from the notification's actual message header, associated with the company's outreach. A shared notification sender or a name appearing in footers, recommendations or quoted text does not establish this. Ambiguous identities go to a separate review area, not Latest. Distinguish incoming message content from digest text and quoted history. Connection/referral requests and digests remain excluded even if an outbound contact appears somewhere in the message.

## Three independent operations

1. **Check latest** — per company or across companies/accounts; on demand. Only unseen matching incoming messages newer than that company's explicit monitoring baseline enter Latest.
2. **Find old mail** — all available dates, all folders, bounded resumable batches. All discoveries are history-only regardless of their timestamp. Show cursor progress and allow continuing later. Never claim a complete historical scan until all folders and pages finish.
3. **Review history** — source date, first tracked date, folder/account provenance, matched rule/evidence, linked application/outreach and handling decisions. Existing imported mail forms the initial tracked history; it must not be silently deleted or have linked outcomes undone.

At rollout, establish an explicit latest-monitoring baseline (Asia/Kolkata display). Previously imported mail and earlier discoveries stay historical. New company rules receive a baseline when monitoring begins. Rule edits or a folder move never reset it. The UI says when Latest starts. Searching from a custom earlier date is an explicit history operation, not a way to manufacture new arrivals.

## Company pattern

Persist a typed rule keyed by company ID, with version/history: enabled state, aliases, sender domains, exact sender addresses, optional subject-any phrases, exclude phrases, baseline, accounts and folder scope. Start from actual company/application evidence, display its source, and let the user edit it. Match literal normalized tokens, exact addresses and bounded domains; no user-supplied regex or executable provider queries. Do not trust a company name mentioned in an arbitrary footer. Require hiring intent or an existing application thread/verified outbound-contact reply. A portal/ATS sender domain alone cannot match every company using that ATS. Ambiguous matches across companies are held for review with evidence.

The production matcher loads recorded outgoing recipients on the server. The gallery’s boolean evidence flags are never accepted from a browser form. Unmatched but explicit personal application updates can be retained for manual association; they never create companies or application records.

## All-folder coverage

Show actual provider folder/label inventories and per-account coverage. Gmail labels include Inbox, custom labels, archived messages, Spam and Trash; API queries use `includeSpamTrash=true`. Gmail labels overlap; scan messages once and store multiple labels. Outlook needs recursive folder discovery (including hidden folders when supported), Inbox, Junk Email, archive, custom/nested folders and Deleted Items. Enumerate folders by provider ID, never by localized display name. Include direct mailbox messages where supported, with provenance from parent folder IDs and provider-controlled page continuations.

Sent/drafts are contextual evidence only, never incoming updates; they may establish sent-thread history only when the user intentionally records it. Search only provider-visible mail: expired or permanently removed spam/trash, an inaccessible online archive or deleted mail cannot be recovered by the app. Warn about folder errors and retention limits without presenting a partial scan as complete. No automatic clicking, attachment fetching or remote-image loading for spam; preview plain text with explicit provenance. Access remains `gmail.readonly` and delegated `Mail.Read`/`User.Read` plus offline renewal.

## Durable scanning and deduplication

- Ledger key: provider + account identity + immutable provider message identity. Include account in uniqueness; do not collapse independent Outlook accounts solely by Internet Message-ID. Preserve existing linked message IDs/references when migrating; backfill provenance without duplicating linked outcomes.
- Track seen metadata for excluded as well as imported messages, with rule version/reason. Discard unrelated full content once classified; do not accumulate a replica of all personal email. Re-evaluating a seen item can change its company/history association but cannot label it new. Separate provider scan watermarks from user read/unread state.
- Gmail stable IDs survive label moves; Outlook immutable IDs survive supported same-mailbox moves. Deduplicate across folders and query overlap. Same-account alias connections need mailbox-identity normalization to avoid scanning one mailbox twice.
- Store independent continuation checkpoints per account, company, operation, folder and rule revision. Commit page results and cursor atomically. Cancellation/errors retain committed pages. Serialize conflicting scans with existing connection locks; one folder/account failure must not block others.
- Capture a fixed upper boundary when each operation starts. Promote the latest watermark only when every selected page/folder in that scope completes. A retry does not advance past unscanned messages. Overlap handles provider delays; ledger identity prevents duplicate arrivals.
- Persist which rule classified an item and which notifications were suppressed. Show read/ignored/excluded history separately from outstanding decisions. A changed rule cannot reopen previously handled application outcomes.
- Audit import, match, link and review operations. Manual linking still controls application outcomes. No fabricated urgency based on old application dates discovered in history.

## Production acceptance checks after visual approval

Real folder enumeration for all three accounts, nested/localized folder fixtures, spam/trash inclusion, sent exclusion, 429/timeouts, malformed continuations and credential-forwarding checks. Replay an entire multi-page history scan twice; new count must stay zero. Move a message across folders; retain one tracked identity. Confirm old/unread messages do not enter Latest. Test duplicate Internet Message-ID across accounts and company-rule revision during a partial scan. Verify correct incoming LinkedIn contact reply passes while invites, digests, arbitrary-name mentions and requests asking the user for referrals do not. Check broad ATS senders cannot associate unrelated companies. Review migrated existing mail without deleting source data. Complete Docker build, tests in isolated environments and browser checks in both themes/narrow layouts.

## Rollout order

1. Approve the revised cumulative mail workspace and its company/application scopes. Keep the current app unchanged until then.
2. Add private database backup and migrations for rules, provenance, seen ledger and operation checkpoints.
3. Implement all-folder provider coverage and exact company/contact matching with regression tests.
4. Wire new UI, migrate old imports to history, establish monitoring baselines, and verify one per-company history pass and latest check on all accounts.
5. Walk through a real application update and a genuine reply to outbound outreach. Keep classification limitations visible.

## Implementation notes

`/mail` uses the approved layout with server-side scope/search pagination. Company and application pages link directly into that workspace; the old Emails drawer URL redirects there. Saved filters live in settings; `mail_tracking` holds account-scoped immutable identities, minimal metadata for exclusions and associations to retained matched messages. Migration 0010 keeps original mail IDs and references and establishes the monitoring baseline. Latest and historical scans checkpoint independently, with one page per account per server request (25 Gmail messages, 50 Outlook messages), and up to four short requests per user action. A history action after a completed scan intentionally rescans; persistent ledger identities keep all previously seen items out of new arrivals. Gmail uses mailbox-wide search with Spam/Trash included; Outlook’s mailbox-wide messages endpoint includes nested folders, with recursive hidden-folder inventory for provenance and sent/draft exclusions.

Latest scans include a one-day overlap and start with the rollout baseline; history scans have no lower date bound. The scan’s upper boundary is fixed until all pages complete. Source mail is never modified. Old or ignored mail re-evaluated under a new pattern can become historical matches but never fresh arrivals. Exact header/subject identity matching for LinkedIn remains conservative; ambiguous or unsupported notification formats are excluded rather than treated as replies.


## Verification — 2026-10-30

The production Docker build, TypeScript and ESLint pass. The unit suite passes 540 tests. Six guarded integration checks pass against the separately marked `jobops_e2e` database: immutable identity across folder moves, reviewed-history persistence, independent account identity, pending unassigned updates across rescans, page rollback/resume and cumulative/company/application pagination (including preserved manual links). Live latest checks completed across all three connected accounts. Existing message IDs and links remain intact; a private pre-migration backup is ignored by Git.

Historical recovery remains an explicit, resumable operation. Provider throttling or temporary failures preserve committed pages and are shown per account; a completed latest check does not claim that the entire historical mailbox was recovered. There are currently no saved applications or recorded outgoing recipients in the personal database, so the application selector becomes available after a real application is recorded, and unverified LinkedIn messages remain excluded.
