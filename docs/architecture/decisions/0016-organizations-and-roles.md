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
     minute for reads; writes read them fresh (see "Hardening");
   - the company and team come from the `x-gifting-company` and
     `x-gifting-team` headers the sender app sends, checked against those
     memberships. A header that names one the person doesn't hold is
     refused, never replaced. With no header, their first company and its
     first team they can reach;
   - the session holds the company, the team and the roles that apply on
     that team.

6. **Refusals.**
   - No membership: `403 no_membership`, and the app explains who can add
     them.
   - Another company's or team's data: `404`, as before (CLAUDE.md "Scope
     and access").
   - A company or team header the person doesn't hold:
     `404 company_not_found` or `404 team_not_found`. The sender app then
     forgets its remembered choice.
   - An action the role doesn't grant, inside their own team:
     `403 forbidden`.

7. **Approvers are people with `campaign:approve` on the team.** That is
   approvers of the team and the company's owners. The `approverIds` field
   of `team-settings` is no longer read. A sender still can't approve their
   own campaign.

8. **How people join.** A person registers and verifies their email
   (ADR 0015). An operator adds a company's first owner with
   `pnpm member:add`; since 12 Nov 2026 owners and admins invite everyone
   else by email, and change roles and teams in the dashboard
   ([ADR 0017](0017-invitations.md)).

9. **Development.** With `DEV_AUTH=1`, the `x-dev-user` header still lets
   the dashboard act as any member of the organization directory. Without
   the header, the signed-in person's own membership is used, else the demo
   company's first member. Without a connector that has organizations, the
   directory is the demo company from `infra/seed`. Production never reads
   the header. Since 12 Nov 2026 only the API tests send it: the sender
   app's "Viewing as" picker is removed, so the browser always shows the
   signed-in person (one account per role, added with `pnpm member:add`).

## Consequences

- One person can belong to several companies, and switch between them.
- Role changes stop writes at once, and reads within a minute (the
  membership cache).
- Production needs the commerce platform to have organizations, or the
  dashboard answers `503 organizations_not_configured`.
- The API client needs `view_business_units` and `view_customers`.
- The connector conformance suite gains an organizations section; a
  connector with `organizations` must pass it.
- Ops stays as it is: operators are the verified emails in `OPS_EMAILS`.
- Vendor access (orders routed to the vendor's channel) is a separate step.

## Hardening (11 Nov 2026)

A review of this decision asked for a stricter session and clearer rules.
These amend the decisions above; nothing in them is replaced.

1. **No silent switch.** A company or team header the person doesn't hold
   is refused (`404 company_not_found`, `404 team_not_found`), so a stale
   choice can't send a write to another company or team. With no header,
   the API picks the person's first company and its first reachable team,
   in the platform's stable order (commercetools: Company units, then by
   name); the app remembers the choice in a cookie and the person changes
   it with the switcher. With one company that is the only one.
2. **Roles add up.** On a team, a person holds the union of their company
   roles and their roles on that team, and may do whatever any of them
   grants. Rules that aren't about roles stay separate checks that no role
   bypasses: a sender never approves their own campaign; a recipient
   reaches only their own gift (by link); a vendor reaches only orders
   routed to their channel; company roles never grant ops.
3. **Two checks on every member route.** The action (the route's
   `permission`, before the handler) and the resource (every query filters
   by the session's company or team; anything outside is `404`).
4. **Revocation.** Reads may use memberships cached for up to a minute.
   Every write (any method but GET, HEAD or OPTIONS) reads them from the
   platform first, and that answer refreshes the cache. Removing a role in
   commercetools therefore stops that person's sends, approvals, top-ups
   and edits at once. Clearing the cache from commercetools Subscriptions
   (associate and unit messages) is a later step.
5. **What belongs to the company and what to a team.**

   | Belongs to the company | Belongs to a team |
   | --- | --- |
   | Members and roles (in the platform) | Budget account, ledger entries, balance |
   | Recipients (the directory) | Campaigns and their approvals |
   | Collections built by the company | Gifts (through their campaign) |
   | Integrations | Approval threshold |

   A company role reaches every team, so owners and admins see each
   team's money by switching team. A company-wide view (all teams' balances
   together) would be its own route on the company, not a team route that
   ignores the team.
6. **Connector lifecycle.**
   - An inactive company grants nothing, and neither do its teams; an
     inactive team grants nothing (commercetools: a Business Unit with
     `status: Inactive`).
   - A deleted team disappears from `teams`, so nobody can choose it. Its
     campaigns, gifts and ledger stay in MongoDB, unreachable from the
     dashboard, for statements and audit.
   - A person removed from the platform authenticates no more (ADR 0015),
     and a person removed from a unit loses its roles.
   - Keys are the identity: every record stores `companyKey` and
     `teamKey`, so a connector must give keys that never change.
   - Reads page through every unit, however many.
   - Roles the product doesn't know are dropped, never mapped to a higher
     role.
7. **Not yet.** Role and membership audit events belong with invitations,
   where the product starts changing memberships itself. Finance-only roles,
   custom roles and permission editing need their own decision; the four
   roles stay until then.
