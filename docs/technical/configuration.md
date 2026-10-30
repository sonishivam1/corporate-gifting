# Configuration

Configuration is environment variables only. In development every service
reads the root `.env` (gitignored), copied from
[`.env.example`](../../.env.example). In deployed environments they are set
from Google Secret Manager. Each package validates the variables it needs with
Zod at start-up and fails fast with the variable's name (never its value).

## Variables

| Variable | Used by | Required | Example | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | all | no | `development` | |
| `LOG_LEVEL` | servers, scripts | no (`info`; `silent` in tests) | `debug` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |
| `MONGODB_URI` | api, worker, db scripts | yes | `mongodb://localhost:27017/?directConnection=true` | Secret in the cloud. Atlas: `mongodb+srv://…` |
| `MONGODB_DB` | api, worker, db scripts | no (`gifting`) | `gifting` | Tests use `gifting_test_*` |
| `API_PORT` | api | no (`4000`) | `4000` | |
| `API_PUBLIC_URL` | apps (server side) | no (`http://localhost:4000`) | `http://localhost:4000` | Where apps call the API |
| `RECIPIENT_PUBLIC_URL` | api, worker | no (`http://localhost:3001`) | `https://gift.example` | Base of gift links |
| `CTP_PROJECT_KEY` | api, worker, infra | from spikes | `corporate-gifting` | `ct:apply` and `seed` refuse a key without `sandbox` or `dev`, unless `CTP_SETUP_PROJECT_KEY` names it |
| `CTP_CLIENT_ID` | api, worker, infra | from spikes | — | Secret |
| `CTP_CLIENT_SECRET` | api, worker, infra | from spikes | — | Secret, never logged |
| `CTP_SCOPES` | api, worker, infra | from spikes | `manage_orders:gifting-sandbox …` | Space-separated |
| `CTP_AUTH_URL` | api, worker, infra | from spikes | `https://auth.europe-west1.gcp.commercetools.com` | Region-specific |
| `CTP_API_URL` | api, worker, infra | from spikes | `https://api.europe-west1.gcp.commercetools.com` | Region-specific |
| `CTP_STORE_KEY` | api | no (`gifting`) | `gifting` | |
| `CTP_IMPORT_URL` | infra (seed) | no (from `CTP_API_URL`, `api.` → `import.`) | `https://import.us-central1.gcp.commercetools.com` | Import API host |
| `CTP_SETUP_PROJECT_KEY` | infra | no | `corporate-gifting` | Lets `ct:apply` and `seed` write to this exact project although its key has no `sandbox` or `dev`. Only for the POC project; never a client's live project |
| `SMTP_URL` | api, worker | no | `smtp://apikey:<key>@smtp.sendgrid.net:587` | The SMTP provider as one URL (SendGrid on GCP, from Secret Manager). Account and gift emails share it, so changing provider means changing this setting. With no SMTP set, or none answering, outside production emails go to `.data/outbox`; in production the API refuses to start without one. Secret |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | api | no (port `587`) | `smtp.sendgrid.net`, `587` | The same provider as separate settings, used instead of `SMTP_URL` when `SMTP_HOST` is set. Port 465 is TLS; 587 upgrades with STARTTLS. `SMTP_PASS` is secret |
| `COMMERCE_CONNECTOR` | api | yes, for sign-in | `commercetools` | The commerce platform: `@gifting/commerce-<name>` must be installed in the API. `memory` keeps customers in memory for local work (refused in production). Unset: register and sign-in answer 503 |
| `DEV_AUTH` | api | no | `1` | The dashboard's development workspace: "workspace" routes take the demo company's member and team from the `x-dev-user` and `x-dev-team` headers. Never on in production; it never stands in for real sign-in |
| `MEMORY_SIGN_IN` | api | no (`password`) | `hosted` | With the memory connector: play a platform with its own sign-in page |
| `API_SESSION_SECRET` | api | with a connector | 64 hex characters | Encrypts the API's own sessions, verification links and sign-in state (`openssl rand -hex 32`). Changing it signs everyone out. Secret |
| `CTP_SIGNIN_CLIENT_ID`, `CTP_SIGNIN_CLIENT_SECRET` | api | with the commercetools connector | — | The commercetools API client that checks passwords and issues the customer tokens the connector keeps (password flow). **Only `manage_my_profile`**; the API refuses to start with admin scopes, or without it. Secret |
| `SENDER_PUBLIC_URL` | api | no (`http://localhost:3000`) | `https://app.gifting.example` | Links in account emails |
| `MAIL_FROM` | api | no (`Gifting <no-reply@gifting.example>`) | `Gifting <you@yourcompany.com>` | Sender of every email; with a real provider it must be a verified sender. Its domain must be authenticated with that provider (SPF, DKIM), or a domain with a strict DMARC policy gets the email quarantined. Until then, use a personal sender verified in the provider |
| `OPS_EMAILS` | api | no | `priya@ops.example` | Comma-separated verified emails allowed on `ops` routes |

Planned, as features land:

| Variable | For | Milestone |
| --- | --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Top-ups (test mode) | M1 |
| `SENDGRID_API_KEY` | Email in the cloud | M3 |
| `TOKEN_PEPPER` | Extra secret mixed into gift token hashes | M3 |
| `GCP_PROJECT_ID`, `PUBSUB_CT_EVENTS_SUBSCRIPTION` | The Pub/Sub subscription the worker reads commercetools events from | M4 |
| `TWILIO_*` | SMS | M5 |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Slack app | M5 |
| `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD` | Teams bot | M5 |
| `HRIS_API_KEY` | Unified HR API | M5 |
| `FLE_KEY_*` | Field-level encryption keys for recipient data | M5 |

## Each app's own settings

The Next.js apps don't read the root `.env`: it holds commercetools and
database secrets they must never have. Each app has its own gitignored
`.env.local`, copied from its `.env.example`
([sender](../../apps/sender/.env.example)):

| Variable | Notes |
| --- | --- |
| `API_PUBLIC_URL` | Where the Gifting API runs |
| `SESSION_SECRET` | 32 random bytes in hex (`openssl rand -hex 32`) that encrypt the session cookie. Secret |

Setting up sign-in: [getting started](../engineering/getting-started.md#register-and-sign-in).

## Per-company settings

Settings that differ per company (brand colour, logo, retention period,
overage allowed, reminder cadence) live on the company's Business Unit
custom fields (`company-settings`), not in env. Team approval thresholds live
on the team's unit (`team-settings`).

## Rules

- A secret never appears in git, logs, screenshots or chat. If one does,
  rotate it.
- Each environment has its own MongoDB user and its own commercetools API
  clients; production clients get only the scopes their job needs.
