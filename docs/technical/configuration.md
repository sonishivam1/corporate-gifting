# Configuration

Configuration is environment variables only. In development every service
reads the root `.env` (gitignored), copied from
[`.env.example`](../../.env.example). In deployed environments they are set
from AWS Secrets Manager. Each package validates the variables it needs with
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
| `SMTP_URL` | worker | no (`smtp://localhost:1025`) | `smtp://localhost:1025` | Mailpit locally |
| `DEV_AUTH` | api, apps | development only | `1` | Development sign-in switch; ignored when `NODE_ENV=production` |

Planned, as features land:

| Variable | For | Milestone |
| --- | --- | --- |
| `AUTH0_*` or `COGNITO_*` | Sign-in (ADR 0009) | M1 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Top-ups (test mode) | M1 |
| `SES_*` or `SENDGRID_API_KEY` | Email in the cloud | M3 |
| `TOKEN_PEPPER` | Extra secret mixed into gift token hashes | M3 |
| `SQS_CT_EVENTS_URL` | commercetools subscription queue | M4 |
| `TWILIO_*` | SMS | M5 |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Slack app | M5 |
| `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD` | Teams bot | M5 |
| `HRIS_API_KEY` | Unified HR API | M5 |
| `FLE_KEY_*` | Field-level encryption keys for recipient data | M5 |

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
