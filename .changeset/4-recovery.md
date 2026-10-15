---
'@nickkupriyanov/slotline-core': minor
'@nickkupriyanov/slotline-react': minor
'@nickkupriyanov/slotline-angular': minor
---

The confirmation says what actually happened.

- The confirmation renders the record the backend returned: the place and its heading,
  the instructions, and one action per link that exists — join, add to calendar,
  reschedule, cancel. `Add to calendar` uses the provided URL; no ICS is generated, and
  reschedule and cancel are the application's own links, never adapter methods.
- Data that is absent renders nothing, so a booking without a place shows no empty
  block.
- The invitation line follows an explicit status: `sent`, `pending` and `failed` have
  their own texts, and a record with no invitation shows no line.
- A core fix: an attempt generated its own idempotency key separately from the request
  it sent, so `resolveAttempt` — called with the key the application was told about —
  refused the very attempt it was meant to resolve. The attempt now takes the key of
  the request it carries.
