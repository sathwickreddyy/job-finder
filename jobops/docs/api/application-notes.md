# Application notes

Each application keeps one Markdown note. The company page shows it closed to a single line and
opens it as a readable note; Edit notes opens the side-by-side editor. Agents write the note
with one request that replaces it.

## Write notes

`PUT /api/v1/applications/{id}/notes`, a supported local agent route with the usual trusted-LAN
rules (no `Origin` header from a terminal; a foreign `Origin` is refused).

```sh
curl --fail-with-body --silent --show-error -X PUT -H 'Content-Type: application/json' \
  --data-binary @jobops/data/job-apply/notes.json \
  "$JOBOPS_URL/api/v1/applications/{id}/notes"
```

```json
{ "notes": "## Summary\n\nApplied on 3 Nov." }
```

| Status | Meaning |
| --- | --- |
| `200` | Saved. The body is `{ "notes": "<saved text>" }`. |
| `400` | `notes` is missing, not a string, or over 100 000 characters. The stored note is unchanged. |
| `404` | No application has that id. |
| `413` / `415` | The request is over 1 MiB or is not `application/json`. |

The write replaces the whole note, so read the current text first (it is shown on the application's page) and keep anything the user wrote. An empty string clears it.

## Template

Three level-2 headings make the page style the note. Use any or all; other Markdown renders as
written, and a note with none of them is shown as plain Markdown.

| Heading | Shown as |
| --- | --- |
| `## Summary` | One or two sentences in larger text. Bold marks key values such as the date, portal and requisition. |
| `## On the form` | A checklist: `- [x]` shows a ✓ and `- [ ]` shows a ✕. |
| `## Proof` | Evidence. Inline code that is a hash of 24 or more hex characters or a UUID shows its first and last 8 characters with a Copy button and the full value on hover. A local file path shows its last segment with Copy. |

The résumé scores sit between Summary and On the form. They come from the tool results stored for
the submitted résumé and the application's saved job, never from the note text, so do not write
scores into the note.

```md
## Summary

Applied to **ServiceNow** on **3 Nov 2026** through the careers portal, requisition **REQ-0001**.

## On the form

- [x] Signature
- [x] Notice period: 60 days
- [ ] Relocation at own expense

## Proof

- Résumé SHA-256: `546558fd0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7ebf21600`
- Confirmation screenshot: `/home/user/jobops/data/job-apply/example/submitted.jpg`
```
