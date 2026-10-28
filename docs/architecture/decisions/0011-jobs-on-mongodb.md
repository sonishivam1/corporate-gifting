# 0011 — Background jobs on MongoDB (Agenda) for the POC

**Status:** Proposed (27 Oct 2026). Decide in M0 (with spike 6).

## Context

The worker runs scheduled jobs (campaign sends, reminders, expiry,
statements, reconciliation, HR sync) and consumes commercetools events. POC
volumes are small: thousands of gifts, not millions. Adding Redis means
another service to run locally, in CI and in the cloud.

## Options

| Option | For | Against |
| --- | --- | --- |
| Agenda on MongoDB | No new infrastructure; jobs live next to the data | Lower throughput; fewer features than BullMQ |
| BullMQ on Redis | High throughput, rate limits, good tooling | Redis to run and secure |
| Cloud Scheduler + Pub/Sub | Managed | More cloud wiring for a POC |

## Proposed decision

Agenda on MongoDB for scheduled jobs; commercetools events read from Pub/Sub
by the worker. Every job is idempotent, so switching to BullMQ later is a
change of runner, not of job code. Switch if job volume or rate-limited
sending (SMS, Slack) needs it.

## Consequences

- Job definitions live in `services/worker/src/jobs` with a runner-neutral
  shape (`name`, `schedule`, `run(ctx)`).
- The scaffold ships the registry without a runner; Agenda is wired in M0 or
  M3 once this is accepted.
