# Home redesign: identity, live profile previews and an app-wide loading popup

Date: 2026-10-01 · Status: approved design, awaiting implementation plan
Gallery: `/gallery/home` (picks: Profile header A, Profile previews B, Job sites A, Loading popup A,
Button feedback C)

## Goal

Home currently repeats generic copy ("Evidence of the things you build") under single-letter tiles,
says nothing about who the user is, and gives no feedback while a page or save is in progress.
After this change Home answers three questions at a glance: _who am I_ (identity from stored
profile data), _what do my profiles look like_ (live previews), and _where do I search_ (job sites
that open a concrete search). Every page change or save that takes noticeable time shows a
progress popup over a blurred page.

Nothing is invented. Identity comes from `candidate_profiles`, previews are the live public pages or
public images, and the numbers section keeps showing only recorded JobOps activity.

## 1. Home layout (top to bottom)

### 1.1 Identity card (Hero A)

One rounded panel (`rounded-panel`, `bg-card`, `shadow-surface`):

| Element        | Source and rule                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avatar (80 px) | `https://github.com/<handle>.png?size=160` when a GitHub link exists; otherwise the first letter of the name on `bg-selected`.                                                                                    |
| Name (`h1`)    | `preferredName`, else `fullName`, displayed exactly as stored.                                                                                                                                                    |
| Headline       | `currentRole` and `currentCompany` joined by " at "; either may be absent.                                                                                                                                        |
| Facts row      | City (`currentCity`), experience (`yearsOfExperience`: "1 year experience", "5 years experience", "5.5 years experience") and "Current resume: <version label>" linking to the version. Absent facts are omitted. |
| Summary        | First sentence of `careerSummary` (split after `.`, `!` or `?` followed by whitespace), clamped to two lines. Omitted when empty.                                                                                 |
| Profile chips  | One chip per stored link in the order LinkedIn, GitHub, Portfolio, Medium, then others. Favicon + handle (Portfolio shows "Portfolio") + external-link icon; opens in a new tab.                                  |
| Primary action | **Find openings** → `/find`, on the right at `lg` and below the content on smaller screens.                                                                                                                       |

With no candidate profile at all, the card shows "Add your name, role and city" linking to
`/my-profile` in place of name, headline and facts; the chips and Find openings remain.

**Entrance.** The card is the only element on Home with a load animation: avatar, name and headline,
facts, summary and chips fade and rise 10 px in a 70 ms stagger using the Material emphasized
decelerate curve (560 ms). `prefers-reduced-motion` disables it through the existing global rule.

### 1.2 Your profiles (Previews B, live mosaic)

Heading "Your profiles" with a "Manage links" link to `/my-profile`. A three-column grid at `md`
(one column below):

| Tile                   | Grid placement     | Content                                                                                                                      |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Portfolio              | 2 columns × 2 rows | Live page rendered at 1280 px wide and scaled to fit (non-interactive thumbnail, `loading="lazy"`).                          |
| Resume                 | 1 column           | First page of the current resume PDF (`#toolbar=0&navpanes=0&view=FitH`), non-interactive.                                   |
| GitHub                 | 1 column           | Avatar, handle, `github.com/<handle>`, and the contribution graph image with caption "Public contributions, last 12 months". |
| LinkedIn               | 2 columns          | LinkedIn icon and "Shows LinkedIn's official profile badge."                                                                 |
| Medium and other links | 1 column each      | Site icon and "<Site> can't be previewed inside JobOps."                                                                     |

Every tile has a footer with the site icon, title as `h3`, handle, a **Preview** button and an
open-in-new-tab icon link. The Preview button's hit area covers the whole tile; the external link sits
above it. If there is no portfolio link, the resume tile takes the large slot.

**Missing items.** For each of LinkedIn, GitHub and Portfolio with no stored link, a small tile reads
"Add your <name>" and links to `/my-profile#add-link`. With no current resume, the resume tile reads
"Upload your resume" and links to `/resumes`.

**Current resume.** The most recently created `isCurrent` version among active resume families.

**Preview dialog.** A native `<dialog>` opened with `showModal()`: centred, up to 1100 px × 82 dvh,
`backdrop:bg-scrim backdrop:backdrop-blur-sm`, scale-in animation. Header: icon, title, handle, close
button. Below: an address bar showing the URL (resume shows its filename) with an open-in-new-tab
button. Body by kind:

- Portfolio: interactive iframe, `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, `referrerpolicy="no-referrer"`.
- Resume: same-origin iframe of `/api/resumes/<id>/file#view=FitH`.
- GitHub: avatar, handle, contribution graph and **Open GitHub**.
- LinkedIn: the official badge (section 4.2), with an **Open LinkedIn** card if it fails.
- Medium and others: "<Site> blocks previews inside other sites. Open it to see your latest posts." and **Open <Site>**.

Escape, the close button and a click on the backdrop close the dialog; focus returns to the Preview
button that opened it.

### 1.3 Places to find openings (Job sites A)

Heading and the existing "Browse Bengaluru & Hyderabad companies" link. Five cards in a row at `lg`:
site favicon on a `bg-background` tile, name, what the site is best for, and a bottom line that
states what the click opens.

| Site      | Best for                                                    | Click opens                                                                                                |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| LinkedIn  | Openings, and referrals through people you know             | `https://www.linkedin.com/jobs/search/?keywords=<role>&location=<city>, India`; line: "“<role>” in <city>" |
| Naukri    | India's largest job board, where recruiters search profiles | `https://www.naukri.com/<role-slug>-jobs-in-<city-slug>`; line: "“<role>” in <city>"                       |
| Instahyre | Curated tech roles where companies contact you              | `https://www.instahyre.com/`; line: "Open Instahyre"                                                       |
| Cutshort  | Startup and product-company tech roles                      | `https://cutshort.io/`; line: "Open Cutshort"                                                              |
| Hirist    | Technology-only roles across Indian companies               | `https://www.hirist.tech/`; line: "Open Hirist"                                                            |

Search role = first `desiredRoles` entry, else `currentRole`. Search city = first
`preferredLocations` entry, else `currentCity`. With no role, LinkedIn and Naukri open
`https://www.linkedin.com/jobs/` and `https://www.naukri.com/` with "Open <Site>". With a role but no
city, LinkedIn uses location "India" and Naukri uses `https://www.naukri.com/<role-slug>-jobs`.
Slugs are lowercase, non-alphanumeric runs become `-`, and leading/trailing `-` are trimmed.

### 1.4 Unchanged sections

"Your search in numbers" (four counts, four-week activity graph, sources) and "First time? See the
steps" stay as they are.

## 2. Loading popup (Loader A), app-wide

### 2.1 Behaviour

| Rule               | Value                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Show delay         | Visible only if the task is still running after 200 ms. Faster tasks never show it.                                              |
| Minimum on screen  | Once visible, stays at least 450 ms, then completes to 100 % and fades out over 280 ms.                                          |
| Progress           | Starts at 8 %, moves 10 % of the remaining distance to 92 % every 180 ms, jumps to 100 % on completion. It is not a measurement. |
| Safety timeout     | Any task still running after 15 s is dismissed so the page can never stay blocked.                                               |
| One task at a time | A new task replaces the current one and keeps the popup visible; finishing a replaced task has no effect.                        |
| Blocking           | While visible, the app wrapper (header and `main`) is `inert`, which prevents double clicks and double submits.                  |

UI: full-viewport `bg-scrim backdrop-blur-md` layer above everything; centred `bg-popover`
`rounded-panel` card (360 px wide, capped at viewport width minus 32 px) with the "J" app mark, the
task label, and a 4 px rounded linear bar (`bg-selected` track, `bg-primary` fill). The card uses
`role="status"` with `aria-live="polite"`; the bar has `role="progressbar"` and an `aria-label`
with no value, since progress is simulated.

### 2.2 Triggers

| Trigger                       | Detected by                                                                                                                       | Label                                 | Finishes when                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------- |
| Link click inside the app     | Document click listener (capture phase)                                                                                           | "Opening <page>"                      | Pathname or search params change |
| Back / forward                | `popstate`                                                                                                                        | "Opening <page>" for the new location | Pathname or search params change |
| Save in `ActionForm`          | `useLoadingTask(pending, label)`; label prop `pendingLabel`, default "Saving"                                                     | "Saving" or the form's label          | `pending` becomes false          |
| Redirect after a save         | `ActionForm` starts a navigation task before `router.push(redirect)`                                                              | "Opening <page>"                      | Pathname or search params change |
| Jobs import check             | `useLoadingTask(pending, "Checking jobs")` in `features/jobs/import-form.tsx`                                                     | "Checking jobs"                       | `pending` becomes false          |
| Search and filter forms (GET) | Document `submit` listener (bubble phase) for forms whose submit was not prevented, `method` GET, same-origin action, no `target` | "Searching"                           | Page unload (full navigation)    |

A link click is tracked only when all of these hold: primary button, no modifier keys, the anchor
has no `download` attribute, `target` is empty or `_self`, no `data-no-loading` attribute, the URL is
same-origin, its pathname does not start with `/api/` (file downloads), and its pathname + search
differ from the current location (hash-only changes are ignored). Anything that handles a click
itself without navigating must carry `data-no-loading`; no such link exists today.

Labels come from the first path segment: `""` Home, `find` Find openings, `jobs` Jobs, `resumes`
Resumes, `resume-prompt` Resume review, `companies` Companies, `applications` Applications, `inbox`
and `mail` Inbox, `my-profile` My profile, `profile-prompt` Profile prompt, `contacts` Contacts,
`outreach` Outreach, `opportunities` Opportunities, `settings` Settings, `import` Import, `today`
Today, `profiles` Profiles, `gallery` Gallery. Unknown segments use "Loading".

`pageshow` with `persisted` (back-forward cache restore) resets the popup immediately.

### 2.3 Structure

- `src/components/loading/controller.ts`: framework-free state machine
  (`start(label) → token`, `finish(token)`, `reset()`, `subscribe`, `getSnapshot`) with injectable
  timers and clock, so it is unit-tested with fake timers.
- `src/components/loading/routes.ts`: pure `navigationTarget(click, anchor, location)` filter and
  `labelForPath(pathname)`.
- `src/components/loading/overlay.tsx`: `LoadingProvider` (context + `useSyncExternalStore`), the
  popup, the navigation tracker (click, popstate, submit, pageshow listeners; completion effect on
  `usePathname` + `useSearchParams`, wrapped in `Suspense`) and `useLoadingTask`.
- `AppShell` wraps its content in `LoadingProvider`. The popup renders as a sibling of the header and
  `main` wrapper, outside the element that becomes `inert`. Gallery routes that bypass the shell do
  not get the popup.
- No `loading.tsx` files are added; they would commit the URL immediately and end the task early.

## 3. Button feedback (Shape morph C)

A `morph` utility in `globals.css`: rest radius `1.5rem` (a full pill for controls up to 48 px tall),
pressed radius `0.75rem`, `transition: border-radius 260ms cubic-bezier(0.42, 1.67, 0.21, 0.9)`,
disabled buttons do not morph, and reduced motion removes the transition. The real control animates
between finite radii; the gallery demo animated from `rounded-full`, so its change appeared as a snap.

Applied to: `Button` (replacing `rounded-full` and `pressable` in `buttonVariants`; `size="sm"`
keeps the same utility), the header nav pills, and the Inbox, My profile and theme icon buttons in
`AppShell`. Cards and other `pressable` elements keep the existing 0.97 press scale. Existing hover
colours stay as they are.

## 4. Embeds, privacy and failure states

### 4.1 Requests

All embeds load in the browser. The server makes no new external requests and stores nothing new.
The app already sends `Referrer-Policy: same-origin`, so these requests carry no JobOps URL.

| Request                                                          | Reveals                          |
| ---------------------------------------------------------------- | -------------------------------- |
| `https://www.google.com/s2/favicons?domain=<host>&sz=64`         | Hostnames of links and job sites |
| `https://github.com/<handle>.png?size=160`                       | Public GitHub handle             |
| `https://ghchart.rshah.org/1a73e8/<handle>`                      | Public GitHub handle             |
| Portfolio URL (iframe)                                           | Nothing beyond a page view       |
| `https://platform.linkedin.com/badges/js/profile.js` (sandboxed) | Public LinkedIn vanity name      |

The chart colour is the light-theme `--primary`, passed in the URL because a third-party SVG cannot
read CSS tokens. In dark theme the image gets `invert` + `hue-rotate(180deg)` so empty cells become
dark while the blue scale stays blue.

### 4.2 LinkedIn badge isolation

The badge script never runs in the JobOps origin. It runs in an iframe with
`sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` (no `allow-same-origin`) whose
`srcdoc` contains the badge markup, the script tag and a short inline script. After 6 s the inline
script posts `{ type: "linkedin-badge", ok: boolean }` to the parent, where `ok` means the badge
produced its iframe. The parent accepts the message only when `event.source` is that iframe's
window, and shows the **Open LinkedIn** card when `ok` is false or no message arrives within 7 s.
The badge theme follows the app theme.

### 4.3 Failure states

- Favicon, avatar or chart fails to load: favicons fall back to a lucide `Globe`, the avatar to the
  initial, and the chart figure is replaced by "Contribution graph unavailable."
- The portfolio site cannot be reached: the iframe shows the browser's own error page. JobOps cannot
  read cross-origin frame state, so it does not try to detect this.
- The resume file is missing: the existing route returns its 404 JSON message inside the frame.

## 5. Code layout

| File                                                                          | Change                                                                                                                        |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/features/workspace/read.ts`                                              | Add `identity` (name, role, company, years, city, summary, searchRole, searchCity) and `currentResume`. Existing fields stay. |
| `src/features/workspace/profile-links.ts`                                     | `profileLinks()` (kind, handle, host, ordering), `favicon()`, `githubAvatar()`, `contributionChart()`.                        |
| `src/features/workspace/job-sites.ts`                                         | Job site data and `jobSiteAction(site, role, city)`.                                                                          |
| `src/features/workspace/embeds.tsx`                                           | `RemoteImage` with fallback, `ScaledFrame`, `AddressBar`, `PreviewBody`, `PreviewDialog`, `GitHubPreview`, `LinkedInBadge`.   |
| `src/features/workspace/identity-card.tsx`                                    | Hero A.                                                                                                                       |
| `src/features/workspace/profile-mosaic.tsx`                                   | Previews B, including the "Add your …" and "Upload your resume" tiles.                                                        |
| `src/features/workspace/sites.tsx`                                            | `JobSiteCards` becomes Job sites A; `SiteCards` is removed; `SiteIcon` stays for `/my-profile`.                               |
| `src/features/workspace/home.tsx`                                             | Composes the new sections; numbers and steps unchanged.                                                                       |
| `src/components/loading/*`                                                    | Section 2.3.                                                                                                                  |
| `src/components/app-shell.tsx`                                                | Mount `LoadingProvider`; `morph` on header controls.                                                                          |
| `src/components/action-form.tsx`                                              | `useLoadingTask`, optional `pendingLabel`, navigation task before redirect.                                                   |
| `src/features/jobs/import-form.tsx`                                           | `useLoadingTask(pending, "Checking jobs")`.                                                                                   |
| `src/components/ui/button.tsx`, `src/app/globals.css`, `src/styles/theme.css` | `morph` utility; motion tokens (`--ease-emphasized-decelerate`, `--ease-spring-fast`) and keyframes for enter, fade, pop.     |
| `src/features/workspace/home-gallery/*`                                       | Gallery imports the production helpers and embeds; unchosen options stay local to the gallery.                                |

All colours use existing theme tokens. No new dependencies.

## 6. Testing

Unit (Vitest):

- `profileLinks`: kind detection, handles for LinkedIn (`/in/<vanity>`), GitHub, Medium (`@user`)
  and portfolio (host + path), ordering, links without URLs dropped.
- `jobSiteAction`: LinkedIn and Naukri search URLs with encoding and slugs; no-role and no-city
  fallbacks; home pages for the other sites.
- Loading controller with fake timers: hidden under 200 ms; visible after; minimum 450 ms; trickle
  capped at 92 %; completion then hide; replacement keeps it visible and ignores the stale finish;
  15 s safety dismissal; `reset`.
- `navigationTarget`: each skip rule in section 2.2 and the tracked case; `labelForPath` mapping and
  fallback.
- Identity formatting: name preference, headline join, experience wording, first-sentence summary.

End-to-end (Playwright, isolated `jobops_e2e` database on port 3211). Third-party requests
(Google favicons, GitHub avatar, ghchart, LinkedIn script, portfolio host) are fulfilled with local
stubs, so tests never reach real sites. The test seed (`scripts/seed-test.ts`, isolated database
only) gains fictional GitHub, portfolio and Medium links on `example`-style handles where missing;
its existing fictional candidate ("Demo", Senior Backend Engineer, Bengaluru) and resume are reused.

- Home shows the seeded name as `h1`, headline, facts and profile chips with handles.
- The mosaic shows Portfolio, Resume and GitHub tiles; Preview opens the dialog, Escape closes it and
  focus returns to the Preview button.
- LinkedIn and Naukri cards link to the search URLs for the seeded role and city.
- Delaying the next page's RSC request by 1 s shows the popup with "Opening Companies", and it
  disappears once the page arrives; an undelayed navigation never shows it.
- A slow save (delayed server action response) shows "Saving", and the redirect continues the popup.
- `simple-home.spec.ts` is updated from "Your online presence" to "Your profiles", and its
  saved-link assertion targets the tile heading.
- No horizontal overflow at 390 px for `/` in either theme (the existing overflow sweep).

## 7. Out of scope

Fetching or caching profile data on the server, Medium post lists, LinkedIn data beyond the
official badge, real progress measurement, and migrating other pages' bespoke pill links to `morph`.
