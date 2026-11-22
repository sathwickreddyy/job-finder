---
name: amazon-excluded-claims
description: Amazon résumé claims the user rejected on 2026-11-19 — never add a RAG assistant or a Search/Detail-page shopping assistant (155/200 ms)
metadata:
  node_type: memory
  type: feedback
  originSessionId: beb6280b-fa94-4bbb-8264-be27cd22b6ac
  modified: 2026-11-19T06:20:50.085Z
---

On 2026-11-19 the user supplied a bullet list for Amazon that included two items they then rejected:
- AWS RAG assistant (Lex, Bedrock Titan, Glue, OpenSearch, KMS/VPC) — "remove that, no such RAG concept in 2022".
- Latency-sensitive shopping assistant for Amazon Search and Detail pages with 155 ms / 200 ms targets — "leave it out". The real latency claim is internal-system response cut from ~1 s to 200 ms (Transportation Financial Systems org).

Master revision 3a0a5ab2 (decision-only, same content as 759fdc91) records both exclusions in the JobOps ledger, superseding 759fdc91's "pending confirmation" note.

**Why:** both were in a pasted list but don't match the user's actual Amazon work.
**How to apply:** never put either in the master or a tailored résumé, even if a JD asks for GenAI/RAG or customer-facing latency. Related: [[confirmed-work-skills]], [[resume-rewrite-checks-rule]].
