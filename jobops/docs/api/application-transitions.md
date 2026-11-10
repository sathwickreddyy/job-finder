# Application and outreach transitions

Use `GET /api/v1/applications?company=<name>` or `?url=<opening-url>` to find the record.
Then call `GET /api/v1/applications/{id}/transitions` for its status, phase, whether it
was sent, and its available actions and outcomes. The portal and API use the same
workflow rules. The outcome list includes any required round or timing details.

Send one action to `POST /api/v1/applications/{id}/transitions` as JSON. Generate a
UUID for each new action. For example, record a scheduled technical interview with:

```json
{
  "action": "recordOutcome",
  "requestId": "79b7e2fc-d2d0-4b81-beb5-286893d4c2c8",
  "outcome": "scheduled",
  "details": {
    "kind": "HLD",
    "at": "2026-11-18T14:30:00+05:30"
  }
}
```

| Action          | Fields in addition to `action` and `requestId`                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `recordSent`    | `sentDate` (`YYYY-MM-DD` in India time), `humanConfirmed: true`                                        |
| `notApplying`   | None. Closes an unsent record.                                                                         |
| `reopen`        | None. Reopens a record closed as Not applying.                                                         |
| `recordOutcome` | `outcome` from the current list, plus optional `details` (`at`, `kind`, `name`, `note`, `happenedAt`). |

The available outcomes cover replies, follow-ups, assessments, interview scheduling,
rescheduling and results, offers, rejections, withdrawal, closure after no reply, and
referral results. `details.at` is an ISO 8601 timestamp with a time zone for an OA
deadline or round. Scheduling a round also requires its `kind` (`ONLINE_ASSESSMENT`,
`DSA`, `LLD`, `HLD`, `BEHAVIORAL`, `HIRING_MANAGER`, `DOMAIN`, or `OTHER`). `details.happenedAt`
defaults to the time the record was updated. Use it to record when an earlier outcome
actually happened.

The response contains the updated `application` and `replayed`. If a request times
out, retry the same body and request ID. The server applies it once and returns the
current state on replay. Using the same ID for a different action or payload on the
same record returns `409`. An action unavailable in the current state also returns
`409`. Read the record again before choosing what to do next.

These actions record what already happened. For a confirmed submission without an
existing record, use `POST /api/v1/applications`. For an outcome backed by a specific
email, use `recordOutcome` in the [mail API](mail-search.md#handle-mail).
