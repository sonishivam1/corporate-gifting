# 0016 — Organizations and role-based access

**Status:** Accepted (11 Nov 2026, Shivam). Amends
[0015](0015-commerce-customer-accounts.md): its B2B parts (Business Units,
associate roles, `pnpm member:add`) stay and are used, instead of being
removed in a B2C clean-up.

## Context

Since [0015](0015-commerce-customer-accounts.md) anyone can register, and
sign-in proves who a person is. It says nothing about which company they
work for, or what they may do there. Every dashboard route still ran on the
development session (`DEV_AUTH=1`): "Viewing as" headers over the fictional
demo company in `infra/seed`. In production every dashboard route was
refused.

The product owner asked for organization-level access on 11 Nov 2026:
- a signed-in person sees only their organization's content, across the
  whole site;
- what they can see and do depends on their role.

Facts that shape the decision:
- The data is already scoped: every MongoDB document carries `companyKey`
  and `teamKey`, and every query filters on the session's. What was missing
  is where the session's company, team and role come from.
- The commercetools project already models the organizations: a Company
  Business Unit per company, a Division per team, associate roles `owner`,
  `admin`, `approver` and `sender`, and 250 demo associates (`pnpm seed`).
- commercetools' associate role permissions are a fixed list about carts,
  orders, quotes and Business Units. They can't say "create a campaign" or
  "top up a budget".
- Other platforms differ ([ADR 0013](0013-commerce-adapters.md)): Shopify's
  B2B has companies but only two fixed contact roles; BigCommerce's B2B
  Edition, a paid add-on, has companies and custom roles.

## Decision

1. **Three separate questions, three owners.**

   | Question | Answered by |
   | --- | --- |
   | Who is this person? | The connector's `accounts` (ADR 0015) |
   | Which companies and teams are they in, with which roles? | The connector's `organizations`, a new optional part of the contract |
   | What may each role do? | Our permission map in `@gifting/domain`, the same on every platform |

2. **Memberships live in the commerce platform, behind the connector.** The
   contract gains `organizations` (contract version 1, additive):
   `membershipsOf(customerId)`, `company(key)`, `teams(companyKey)` and
   `members(companyKey)`. Keys are our stable company and team keys, never
   platform ids, so MongoDB data doesn't depend on the platform.
   - commercetools: Company and Division Business Units, associates and
     associate roles, read with the API client (`view_business_units`,
     `view_customers`).
   - A platform whose B2B features can't hold our roles (Shopify's two
     fixed roles), or that has none, leaves `organizations` out. A built-in
     directory in MongoDB then takes its place; it is built when the first
     such client arrives, with its own decision record for the new
     collections.

3. **Four roles, two levels.** `owner` and `admin` are held on the company
   and apply to every team. `approver` and `sender` are held on one team.
   The product computes this itself, so it doesn't wait on commercetools'
   eventually consistent role inheritance. A connector maps its platform's
   roles to these four and ignores any others.

4. **Roles grant actions, and routes declare actions.** The map in
   `@gifting/domain` (`permissions.ts`) lists the actions, such as
   `campaign:create`, `campaign:approve` and `collection:manage`, and the
   roles that grant each. Every dashboard route declares the action it
   needs, and the API checks it before the handler runs. The apps read the
   same map to hide what a person can't use. Hiding is only a convenience;
   the API is what refuses.

5. **A real member session.** Dashboard routes use `auth: "member"`:
   - the access token gives the account (ADR 0015);
   - `membershipsOf(account)` gives their companies and roles, cached for a
     minute;
   - the company and team come from the `x-gifting-company` and
     `x-gifting-team` headers the sender app sends, checked against those
     memberships, else the first ones;
   - the session holds the company, the team and the roles that apply on
     that team.

6. **Refusals.**
   - No membership: `403 no_membership`, and the app explains who can add
     them.
   - Another company's or team's data: `404`, as before (CLAUDE.md "Scope
     and access").
   - An action the role doesn't grant, inside their own team:
     `403 forbidden`.

7. **Approvers are people with `campaign:approve` on the team.** That is
   approvers of the team and the company's owners. The `approverIds` field
   of `team-settings` is no longer read. A sender still can't approve their
   own campaign.

8. **How people join, for now.** A person registers and verifies their
   email (ADR 0015), then an operator adds them to a company with
   `pnpm member:add`. Invitations by owners and admins come next, in their
   own plan.

9. **Development.** With `DEV_AUTH=1`, the `x-dev-user` header still lets
   the dashboard act as any member of the organization directory. Without
   the header, the signed-in person's own membership is used, else the demo
   company's first member. Without a connector that has organizations, the
   directory is the demo company from `infra/seed`. Production never reads
   the header.

## Consequences

- One person can belong to several companies, and switch between them.
- Role changes take up to a minute to apply (the membership cache).
- Production needs the commerce platform to have organizations, or the
  dashboard answers `503 organizations_not_configured`.
- The API client needs `view_business_units` and `view_customers`.
- The connector conformance suite gains an organizations section; a
  connector with `organizations` must pass it.
- Ops stays as it is: operators are the verified emails in `OPS_EMAILS`.
- Vendor access (orders routed to the vendor's channel) is a separate step.
