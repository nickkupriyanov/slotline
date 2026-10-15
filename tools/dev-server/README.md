# The teaching server

A small HTTP server that shows the semantics Slotline expects, so the examples can be
run against something that behaves like a backend without becoming one:

```bash
node tools/dev-server/server.mjs --port 8787
```

| Route                                    | What it does                                    |
| ---------------------------------------- | ----------------------------------------------- |
| `GET /api/availability?from&to&duration` | weekdays with how many offers they have         |
| `GET /api/slots?date&duration`           | the offers of one day, taken ones removed       |
| `POST /api/bookings`                     | creates a record; `Idempotency-Key` is required |
| `GET /api/bookings?key=<idempotencyKey>` | looks a record up by the key of its attempt     |
| `GET /api/health`                        | whether the example server is running           |

Everything is in memory: no database, no OAuth, no calendar. The playgrounds work
without it, and use it when it is running:

- React — `?data=server&drop=1`
- Angular — `?data=server&drop=1`

## The two promises

**An idempotent create.** A repeat of the same `Idempotency-Key` returns the same
record instead of creating a second one, and it keeps the key for as long as the
adapter advertises (`idempotencyRetentionMs`, 24 hours here). That is what makes the
retry the widget offers a safe retry.

**A lost answer.** Sending `X-Example-Drop: 1` commits the record and then drops the
connection. The client cannot tell whether the booking exists — the state the widget
calls an unknown outcome — and nothing is configured to be flaky: this is a real
failure mode, reproduced on demand. `GET /api/bookings?key=` is how an application
establishes the outcome, and then resolves the attempt.

`tools/dev-server/adapter.ts` is the client half, shared by both playgrounds. It is
also where the rules are visible: a classified refusal becomes a `BookingError` with
its code and field errors, a network failure is left alone (an unclassified error at
creation is an unknown outcome), and `findBooking` is the way out of that state.
