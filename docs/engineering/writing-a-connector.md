# Writing a commerce connector

How to take the product to another commerce platform, such as Shopify or
BigCommerce, without changing the product. Background:
[ADR 0013](../architecture/decisions/0013-commerce-adapters.md) and the
[connectors plan](../plans/commerce-connectors.md).

## What a connector is

A package, `packages/commerce-<platform>`, named `@gifting/commerce-<platform>`.
Its default export is a `ConnectorFactory` from `@gifting/commerce`:

```ts
import { CONTRACT_VERSION, defineConnector } from "@gifting/commerce";

export default defineConnector(({ env, log, production }) => ({
  id: "shopify",
  contractVersion: CONTRACT_VERSION,
  capabilities: { signIn: "hosted" },
  accounts: { /* findByEmail, get, markEmailVerified, hostedSignIn, … */ },
  async check() { /* refuse bad settings before the API takes requests */ },
}));
```

- It reads its own settings from `env`. Name them after the platform
  (`SHOPIFY_*`), and never print a value in an error.
- It is the only code that imports the platform's SDK. The lint rule
  enforces that.
- It returns neutral types (`Customer`) and keeps anything else it needs,
  such as the platform's tokens, in the opaque `platformSession` string.

## Accounts: what to implement

| Capability | Methods |
| --- | --- |
| Always | `findByEmail`, `get` (null for a customer outside this deployment's store or market), `markEmailVerified` |
| `signIn: "password"` | `register` (report a taken email as `{ duplicate: true }`), `signInWithPassword` (null for a wrong email or password) |
| `signIn: "hosted"` | `hostedSignIn.start` (the platform's sign-in URL, with `state`, `redirectUri` and an optional `loginHint`) and `hostedSignIn.finish` (exchange the code; null when refused). Customers come back verified |
| The platform keeps its own customer session | `renewPlatformSession` and `endPlatformSession`, both or neither |
| The platform lets the product change a customer's name (optional; capability `editName`) | `updateName(id, { firstName, lastName })`: the updated customer, or null for one outside the deployment |

The product does the rest the same on every platform: sessions, links,
rate limits, emails and the rules (for example, no sign-in before the email
is verified).

## Catalog: what to implement (optional)

`catalog` is optional. Without it the API serves its demo catalog.

| Method | Returns |
| --- | --- |
| `listItems()` | Every item on sale in the market, as `CatalogItem`s: a stable `key`, name, brand, description, `tags`, the vendor (`vendorKey`, `vendorName`, `slaDays`), `currency`, and `variants` with `sku`, a `label` that tells them apart, `priceCents`, `available` (in stock at that vendor) and `imageUrl` |
| `searchItems({ tags, brands, skus, budgetCents })` | `{ key, skus }` for the items that match any tag, brand or SKU (everything when all are empty), cost no more than the budget and are in stock; `skus: null` when every variant matched |
| `getItem(sku)` | The item with that SKU, read live (null when unknown) |

The product turns items into cards (category and occasions from tags),
caches lists and searches, and checks every variant again, so a search may
return too much but must not miss anything. The conformance suite checks
that a search returns exactly the variants that fit.

## Organizations: what to implement (optional)

`organizations` says which companies and teams a customer belongs to, and
with which role ([ADR 0016](../architecture/decisions/0016-organizations-and-roles.md)).
Without it, production refuses the dashboard (`503
organizations_not_configured`) until the built-in directory exists.

| Method | Returns |
| --- | --- |
| `membershipsOf(customerId)` | `OrgMembership[]`: `{ companyKey, teamKey?, role }`, one per role held. A role on the company has no `teamKey`; a role on a team has one. Empty for an unknown customer |
| `company(companyKey)` | `{ key, name }`, or null |
| `teams(companyKey)` | `OrgTeam[]`: `key`, `name`, `approvalThresholdCents` (null when unset) |
| `members(companyKey)` | `OrgMember[]`: each customer's `id`, `name` and their memberships in that company only |

- Keys are the product's stable company and team keys, never the
  platform's ids. Every record stores them, so they must never change.
- Leave out companies and teams the platform has disabled, and every team
  of a disabled company: they grant nothing (commercetools: Business Units
  with `status: Inactive`).
- Return every result, however many: page through the platform's lists.
- Roles are `owner` and `admin` (held on the company) and `approver` and
  `sender` (held on a team). Map the platform's roles to these and drop any
  other; the product decides what each may do.
- Leave `organizations` out when the platform can't hold four roles on two
  levels (Shopify's B2B has two fixed roles).
- The conformance suite checks it when you pass `organizations` fixture
  data: a customer's memberships, an unknown customer with none, and nobody
  from another company in `members()`.
- `members()` gives each member's `email` too (lowercased), or null when
  the platform has none: owners and admins see it.

**Changing organizations (optional, [ADR 0017](../architecture/decisions/0017-invitations.md)).**
Two independent parts; offer each one the platform can do. A part left out
makes its routes answer `501 not_supported`, and the app hides it.

| Part | Methods | Capability |
| --- | --- | --- |
| `organizations.memberWrites` | `addRole(customerId, membership)`, `removeRole(customerId, membership)`: true when done (also when nothing had to change), false for an unknown or disabled company or team, or a membership of the wrong shape | `manageMembers` |
| `organizations.teamWrites` | `createTeam(companyKey, { key, name })`: the team, `{ conflict: true }` when the key is taken, null for an unknown company; `renameTeam(companyKey, teamKey, name)`: the team, or null when it isn't the company's | `manageTeams` |

- Both are idempotent: giving a role held, or taking away one not held,
  changes nothing and answers true.
- Keep roles the product doesn't know as they are.
- The product checks who may change whom; the connector only stores it.
- The conformance suite checks them when you pass `organizationWrites`
  fixtures (a company, a team, a customer to change, fresh team keys).

## Steps

1. **Spike.** Check the platform can do what the contract needs. For
   accounts: find a customer by email, store a "verified" flag, and either
   check a password or run a hosted sign-in. Later, for orders: a paid,
   idempotent order with no shopper payment (ADR 0013 section 4).
2. **Create the package** like `packages/commerce-commercetools`:
   `package.json`, `tsconfig.json`, `src/index.ts`.
3. **Pass the conformance suite.** Add a test that calls
   `describeConnectorConformance()` from `@gifting/commerce/conformance`
   against a sandbox of the platform. Pass `cleanup` to delete the
   customers it creates. For hosted sign-in, pass `completeHostedSignIn` if
   the page can be automated. Keep it out of `pnpm test` and CI, as
   `vitest.config.ts` does for commercetools.
4. **Install it in the API.** Add `"@gifting/commerce-<platform>": "workspace:*"`
   to `services/api/package.json`, plus the platform SDK it uses (the
   service bundler names any that are missing). The list of installed
   connectors (`src/commerce/installed.ts`) is regenerated before dev,
   build, typecheck and test.
5. **Configure the deployment.** Set `COMMERCE_CONNECTOR=<platform>` and the
   connector's own settings. Nothing else changes: the apps ask
   `GET /v1/auth/options` how to sign people in.
6. **Write the "Connecting <platform>" notes:** credentials and scopes, setup
   steps, and what the platform can't do.

## Trying the hosted flow locally

`COMMERCE_CONNECTOR=memory` with `MEMORY_SIGN_IN=hosted` plays a platform
with its own sign-in page. Its page approves at once, for the email typed on
our sign-in page. Customers last until the API restarts.
