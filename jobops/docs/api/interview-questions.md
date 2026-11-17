# Interview questions

Each interview round can hold the questions that were asked in it. A question keeps the
problem as asked, the user's own answer, how it went, time and space complexity, what the
interviewer said, and an optional review written later by an agent. The text fields are
Markdown. The round cards on the application's company page and the question library at
`/applications/questions` show the same records. The library's "Open in context" link goes to
`/companies/<slug>?open=<applicationId>#round-<roundId>`.

## Find the round

Read `GET /api/v1/applications/{id}/questions`. The response lists the application's rounds
in order, each with its questions:

```json
{
  "rounds": [
    {
      "id": "6f3c…",
      "position": 1,
      "kind": "DSA",
      "name": "",
      "label": "Round 1 · DSA",
      "scheduledAt": "2026-11-16T06:30:00.000Z",
      "outcome": "SCHEDULED",
      "questions": []
    }
  ]
}
```

Record the round first with the [transition API](application-transitions.md) if it is missing.
Questions can only be added to an existing round.

## Add questions

`POST /api/v1/applications/{id}/rounds/{roundId}/questions` appends 1 to 20 questions after the
round's last one and returns `201 { "ids": [...] }` in the order sent.

```json
{
  "questions": [
    {
      "title": "Longest substring without repeating characters",
      "patterns": ["Sliding window", "Hash map"],
      "prompt": "Given a string `s`, find the length of the longest substring without repeating characters.",
      "answer": "```python\ndef length_of_longest_substring(s):\n    ...\n```",
      "outcome": "solved_code",
      "time": "O(n)",
      "space": "O(min(n, k))",
      "interviewer": "Happy with the approach."
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `title` | Required, 1 to 200 characters after trimming. |
| `patterns` | Up to 8 tags such as `Sliding window`. Trimmed; duplicates that differ only in case are dropped. |
| `prompt`, `answer`, `interviewer` | Markdown, up to 100 000 characters each. Keep the user's own working as written. |
| `outcome` | `solved_code`, `solved_aloud`, `partial`, `stuck`, or `null` when not recorded. |
| `time`, `space` | Free text such as `O(n)`. |
| `review`, `reviewSource` | A review needs its source, such as `"Claude Code"` or `"Codex"`. |

Unknown fields are rejected. The request body is limited to 1 MiB.

## Update a question or add a review

`PATCH /api/v1/questions/{id}` changes only the fields it names and returns
`200 { "question": { … } }`. Writing a non-empty `review` stamps `reviewedAt`; clearing it
clears `reviewedAt`.

```json
{ "review": "`set.pop(x)` should be `set.remove(x)`…", "reviewSource": "Claude Code" }
```

A review is a diagnostic written for revisiting the question later. It never replaces the
user's `answer`, and it is shown read-only in the UI with its source. Deleting a question is
available only in the UI.

## Read the library

`GET /api/v1/questions` returns `{ "rows": [...], "nextCursor": "…" | null }`, newest round
first. Each row is a question plus `applicationId`, `company`, `role`, `roundLabel` and `date`
(the round's booked time, or when the question was recorded for an unbooked round).

| Parameter | Use |
| --- | --- |
| `q` | Matches the title, company, round name, round kind and patterns. |
| `company` | Case-insensitive part of the company name. |
| `pattern` | One exact pattern, ignoring case. |
| `outcome` | One of the lowercase outcome values. |
| `limit` | 1 to 200, default 100. |
| `cursor` | The previous response's `nextCursor`. |

## Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid body or query. `issues` lists each field and message. |
| `404` | Unknown application, round or question. |
| `409` | The round belongs to a different application. Read the application's rounds again. |
