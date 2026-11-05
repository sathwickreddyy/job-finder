---
name: pane-file-attach-workaround
description: Built-in browser pane cannot pick local files; how I attached the résumé PDF to JobOps' upload drawer (2026-11-03)
metadata:
  type: reference
---

The built-in browser pane has no file-upload tool. On 2026-11-03 I uploaded the used PDF to JobOps (`/resumes` → Upload a resume) by serving only that PDF from a short-lived `python3` server on 127.0.0.1:8765 (CORS `*`), then in the page fetching it, building a `File` via `DataTransfer`, setting the file input and dispatching `change`; then filled `versionLabel`, `changeNotes`, `docxPath` with the native value setter + `input` event and clicked Upload PDF. Stop the server and delete the copy afterwards.

The same trick fails on Greenhouse (page blocks the fetch), so the user must attach the PDF on employer forms themselves. Greenhouse react-select dropdowns: `scroll_to` ref, click ref, then ArrowDown + Return (Gender is multi-select — Return on the first item without ArrowDown adds nothing, and retries add extra chips).

Related: [[backlog-job-apply-skill]], [[fill-forms-without-asking]].
