---
name: pane-file-attach-workaround
description: Historical browser pane attachment behavior in JobOps and Greenhouse (2026-11-03)
metadata:
  type: reference
---

On 2026-11-03 the browser pane had no native file picker. A temporary loopback file server and a synthetic file input worked in the JobOps upload drawer, but Greenhouse blocked the fetch. This is a historical observation. Follow the current [job-apply upload instructions](../skills/job-apply/references/jobops-api.md): use the supported attachment flow, or ask the user to attach the exact approved file when browser attachment is unavailable.

Greenhouse react-select dropdowns: `scroll_to` ref, click ref, then ArrowDown + Return (Gender is multi-select — Return on the first item without ArrowDown adds nothing, and retries add extra chips).

Related: [[backlog-job-apply-skill]], [[fill-forms-without-asking]].
