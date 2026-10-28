# Getting started

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24 (`.node-version`) | With fnm: `fnm install 24` then `fnm use` in the repo. On Windows you can also run one-off commands with `fnm exec --using=24 -- pnpm.cmd …` |
| pnpm | 10 | `npm install -g pnpm` (the exact version is in `package.json` `packageManager`) |
| Docker | Any recent | For local MongoDB (Atlas Local, a replica set) and Mailpit |
| commercetools | A sandbox project | Only from the spikes on; the scaffold runs without one |

## First run

```bash
cd C:\work\corporate-gifting-marketplace
pnpm install
cp .env.example .env
```

Every service reads the root `.env` (gitignored). The defaults point at local
Docker and need no accounts.

```bash
pnpm db:up        # MongoDB (27017) and Mailpit (8025)
pnpm db:indexes   # create the indexes
pnpm dev          # all apps and the API
```

| Open | What |
| --- | --- |
| http://localhost:3000 | Sender dashboard |
| http://localhost:3001 | Recipient experience |
| http://localhost:3002 | Vendor portal-lite |
| http://localhost:3003 | Ops admin |
| http://localhost:4000/health | API health |
| http://localhost:4000/v1/meta | API version and modules |
| http://localhost:8025 | Mailpit (emails sent locally) |

Run one app: `pnpm --filter @gifting/sender dev`. Run the API only:
`pnpm --filter @gifting/api dev`.

## commercetools

The POC project is `corporate-gifting` (region us-central1, GCP). Ask Shivam
for credentials, and add them to `.env` (see
[configuration](../technical/configuration.md)), then:

```bash
pnpm ct:plan    # prints the store, channels and types it would create; no calls
pnpm ct:apply   # creates the missing ones in the project, skipping any that exist
pnpm seed       # imports the fictional vendors' products and stock, and 250 demo customers (Import API)
pnpm catalog:extract  # reads the Christie Cookie storefront into .data/ (gitignored); about 30 minutes
pnpm catalog:import   # imports that snapshot: vendor channel, categories, products with images, stock
```

The Christie Cookie snapshot isn't in git. Ask Shivam for
`.data/catalogs/christie-cookie.json`, or run `catalog:extract`; its
`--retry-skipped` flag re-reads only the pages the last run skipped.
`pnpm catalog:remove` deletes everything the import created.

`ct:apply` and `seed` refuse a project key without `sandbox` or `dev` in it.
The POC project's key has neither, so `.env` names it in
`CTP_SETUP_PROJECT_KEY`. Both scripts are safe to re-run: `ct:apply` skips
what exists, and `seed` updates the same products (keys are SKUs).

## The worker

```bash
pnpm worker     # lists the registered jobs; the runner arrives with ADR 0011
```

## Checks before a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Troubleshooting

See the gotchas table in [CLAUDE.md](../../CLAUDE.md#gotchas).
