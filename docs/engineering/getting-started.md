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

## commercetools sandbox

From the spikes on, add the sandbox credentials to `.env` (see
[configuration](../technical/configuration.md)), then:

```bash
pnpm ct:plan    # prints the store, channels and types it would create; no calls
pnpm ct:apply   # creates the missing ones in the sandbox project
pnpm seed       # imports fictional vendors and products (M0 package 0.3, not built yet)
```

`ct:apply` refuses a project key without `sandbox` or `dev` in it. It has not
yet been run against a real project; the first run is part of spike 4.

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
