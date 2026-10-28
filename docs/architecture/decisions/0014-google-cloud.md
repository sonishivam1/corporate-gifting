# 0014 — The cloud environment runs on Google Cloud

**Status:** Accepted (28 Oct 2026, Shivam)

## Context

The planned POC cloud (M7) named AWS services: App Runner or ECS Fargate,
CloudFront, SQS for commercetools events, Secrets Manager, and SES for
email. Cognito was one identity option in
[ADR 0009](0009-identity-provider.md).

We have paid Google Cloud capacity, so the environment should run there.
The commercetools project is already hosted on GCP (`us-central1`), and
MongoDB Atlas runs on GCP too. No code depends on AWS; only the documents
did.

## Decision

The QA and demo environments run on Google Cloud, in `us-central1`, the
same region as the commercetools project:

| Need | Was (AWS) | Now (GCP) |
| --- | --- | --- |
| Apps and API | App Runner | Cloud Run services |
| Worker | ECS Fargate | Cloud Run service, one instance, CPU always allocated |
| Entry, HTTPS, caching | CloudFront | External Application Load Balancer, Cloud CDN, Cloud Armor |
| commercetools events | SQS with a dead-letter queue | Pub/Sub, a native commercetools Subscription destination, with a dead-letter topic |
| Secrets | Secrets Manager | Secret Manager |
| Email | SES or SendGrid | SendGrid (GCP has no transactional email service) |
| Images | — | Artifact Registry |
| CI access | — | Workload Identity Federation (no key files) |
| Database | MongoDB Atlas | MongoDB Atlas on GCP, `us-central1` |
| Identity option | Cognito | Google Cloud Identity Platform (Auth0 stays the default, ADR 0009) |

The details are in [deployment](../../technical/deployment.md).

## Consequences

- Nothing in the application changes. The worker's event reader is built in
  M4 against Pub/Sub instead of SQS, behind the same `ct-events` job.
- The commercetools Subscription uses its `GoogleCloudPubSub` destination
  (project id and topic). commercetools publishes with its own service
  account, which needs the Pub/Sub Publisher role on that topic only.
- Pub/Sub delivers at least once, like SQS, so the `processedEvents`
  deduplication rule is unchanged.
- Cloud Run, Pub/Sub and Atlas in one region keep latency low and avoid
  cross-cloud egress charges.
- The environment variables for the queue, email and identity change
  ([configuration](../../technical/configuration.md)).
