# Master résumé source

Approved 3 November 2026: master-only gallery A, with the master pinned above the
file timeline rather than placed inside its dated lineage.

Keep the existing `/resumes` workspace, navigation, file rail, application PDF
preview and application score inspector. Only selecting the explicitly marked
master changes the content area: complete text extracted from its editable DOCX
on the left, its dated ledger on the right. Keep one master per résumé family.
Search may filter a master; the Sent filter applies only to application files.

The master is a content source, without application page limits. A master update
stores a new immutable DOCX snapshot and its extracted paragraphs in a separate
revision ledger. It does not create another PDF timeline row or overwrite a
submitted version, baseline PDF, fit result or application reference. Keep added
and removed paragraphs, the date and the author's reason. Reordering paragraphs
does not count as content removal. Earlier wording remains readable/copyable;
removals marked as factual corrections are explicitly excluded from reuse.

Download the current or a historical DOCX from private upload storage. Accept
DOCX updates and an optional PDF export through a focused master update drawer
and LAN-trusted agent API. Never read arbitrary host paths from `docx_path`.
The first import explicitly marks an existing unsubmitted, untailored version as
the master anchor. Historical imports may carry a source date, labelled as such
separately from the actual recording date. Require the latest revision id for
subsequent writes, refusing stale edits. New DOCX-only revisions have no PDF
preview until an export for that revision is supplied.

For the existing family, import the preserved 1 November and 2 November DOCXs
as historical source revisions, retaining their original bytes and source dates.
The latter remains current; the earlier Projects wording is visible in the
ledger, not silently restored to an application. Keep the existing baseline id
and every submitted-file reference. All private imports remain under ignored
`jobops/data/` and upload storage.

Use a bounded ZIP/XML reader for DOCX text, render text through React (never
unsanitized HTML), reject encrypted/damaged/oversized documents and external
entity declarations. No LLM calls, scoring code, or Office runtime in Next.js.
Agents or Word export PDFs; JobOps stores supplied exports. Clearly label a
missing export. Existing application views and scoring stay unchanged.
