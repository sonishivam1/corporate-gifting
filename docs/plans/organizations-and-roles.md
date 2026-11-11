# Organizations and role-based access

**Status:** Built
**Agreed:** 11 Nov 2026 · **Built:** 11 Nov 2026

## Goal

A signed-in person sees their own organization's content across the site,
and can do only what their role allows. Today sign-in proves who someone is
([ADR 0015](../architecture/decisions/0015-commerce-customer-accounts.md)),
but every dashboard route takes its company, team and role from the
development session over the demo company, so production refuses them all.
This step reads real memberships from the commerce platform, adds a
permission check to every dashboard route, and makes the sender app follow
it ([ADR 0016](../architecture/decisions/0016-organizations-and-roles.md)).

## Scope

| # | Piece | Where |
| --- | --- | --- |
| 1 | The permission map: actions, the roles that grant them, `can()`, and the roles that apply on a team | `packages/domain` (`permissions.ts`, `members.ts`) |
| 2 | `organizations` in the connector contract: `membershipsOf`, `company`, `teams`, `members`; the conformance checks | `packages/commerce` |
| 3 | The memory connector's organizations (seedable), and the commercetools one from Business Units | `packages/commerce-memory`, `packages/commerce-commercetools` |
| 4 | The member session (`auth: "member"`): account, memberships, chosen company and team, roles; `403 no_membership`; a minute's cache | `services/api` (`http/session.ts`, `modules/accounts/org.ts`) |
| 5 | Every dashboard route declares its action; `403 forbidden` when the role lacks it | `services/api` (`http/route.ts`, every module's routes) |
| 6 | Approvals from the role: who can approve, who is shown as approver; `approverIds` no longer read | `services/api` campaigns |
| 7 | `GET /v1/workspace` adds the person's roles, allowed actions and companies | `services/api`, `packages/domain` views |
| 8 | Sender app: company and team switcher, menu and buttons by action, a "not allowed" notice, a page for people with no company | `apps/sender` |
| 9 | Demo data: an owner and an admin in the demo company | `infra/seed` |
| 10 | `pnpm member:add` adds only registered people (a record it made itself could never register) | `infra/seed` |

**Not in scope:** invitations and member management screens (next step),
the built-in MongoDB directory for platforms without B2B features (when a
client needs it), vendor access, top-ups and statements (the actions exist;
their routes come with M1's money work).

## Decisions

1. **Where memberships live:** the commerce platform, behind the connector
   (ADR 0016). commercetools already holds them as Business Units and
   associates.
2. **Roles and actions:**

   | Action | Owner | Admin | Approver | Sender | Routes today |
   | --- | --- | --- | --- | --- | --- |
   | `reports:view` | ✓ | ✓ | ✓ | ✓ | Home overview |
   | `budget:view` | ✓ | ✓ | ✓ | ✓ | Team balance |
   | `catalog:view` | ✓ | ✓ | ✓ | ✓ | Products, collections, collection items |
   | `campaign:view` | ✓ | ✓ | ✓ | ✓ | Campaign list, detail, gifts |
   | `campaign:create` | ✓ | ✓ | | ✓ | Estimate, create, submit |
   | `campaign:approve` | ✓ | | ✓ | | Approve, decline (never their own) |
   | `gift:manage` | ✓ | ✓ | | ✓ | Send again, cancel |
   | `collection:manage` | ✓ | ✓ | | ✓ | Create, edit, archive collections |
   | `recipients:view` | ✓ | ✓ | | ✓ | Directory search |
   | `recipients:add` | ✓ | ✓ | | ✓ | Upload a list, add by email while sending |
   | `recipients:manage` | ✓ | ✓ | | | (directory screens, later) |
   | `budget:topup`, `statement:view` | ✓ | ✓ | | | (M1 money) |
   | `members:manage`, `integrations:manage` | ✓ | ✓ | | | (invitations, integrations) |

   Senders keep adding recipients while sending (`recipients:add`);
   editing the directory itself (`recipients:manage`) is for owners and
   admins.
3. **Company roles reach every team; team roles stay on their team.** The
   product computes this from the memberships.
4. **Several companies per person:** yes. The sender app offers a company
   switcher when there's more than one.
5. **Refusals:** no membership is `403 no_membership`; another company's or
   team's data stays `404`; an action the role lacks is `403 forbidden`.
6. **Approvers** are the people with `campaign:approve` on the team: its
   approvers and the company's owners.
7. **Joining:** register, verify, then an operator runs `pnpm member:add`.
8. **Development:** `x-dev-user` still picks any member of the directory
   when `DEV_AUTH=1`; otherwise the signed-in person's own membership, else
   the demo company's first member.

## Tests

- Unit (`@gifting/domain`): every role's actions match the table; company
  roles apply on every team, team roles only on theirs; unknown roles grant
  nothing.
- Conformance (organizations): a member's companies, a company's teams and
  members; an unknown customer has none; another company's people never
  appear. Against memory in `pnpm test`, and against the sandbox in
  `pnpm test:conformance`.
- commercetools unit tests: Business Units and associates map to companies,
  teams and roles; unknown roles are ignored.
- API (`app.inject()`):
  - each role's allowed and refused routes (`403 forbidden`);
  - no membership is `403 no_membership`; a signed-in member gets their
    own company;
  - another company's or team's campaign is `404`, whatever the headers
    say;
  - an owner reaches every team; a sender only theirs;
  - an approver can't approve their own campaign; an admin can't approve.
- Break and restore: drop the permission check in `registerRoutes`, and the
  refusal tests fail.
- `pnpm lint`, `typecheck`, `test`, `test:integration` and `build` pass.

## Docs to update

ADR 0016 and the decision index; `CLAUDE.md` (scope and access, HTTP API);
`docs/architecture/security.md` (roles and actions);
`docs/architecture/commercetools.md` (Business Units read by the API,
scopes); `docs/technical/api.md` (auth, permissions, headers, errors);
`docs/engineering/writing-a-connector.md`; `docs/product/features.md`;
`docs/business/open-questions.md`; the README progress table; the roadmap;
the build log; the changelog; this plan's As built.

## As built

All ten pieces, as planned. Differences and details:

- **Where the check lives:** routes declare `permission` (an action, or
  `"member"` for anyone on the team: only `GET /v1/workspace`).
  `defineRoute()` refuses a member route without one, and any other route
  with one. The session hook (`http/session.ts`) builds the session and
  checks the action before the handler, so a refused request never reaches
  the database.
- **Order of refusals:** who is calling first (`503 auth_not_configured`,
  `401`), then organizations (`503 organizations_not_configured`), then
  membership (`403 no_membership`), then the action (`403 forbidden`).
- **Development:** `x-dev-user` first, then the signed-in person if they
  belong somewhere, then the demo company's default member (`user-maya`).
  An unknown `x-dev-user` falls back the same way instead of `401`.
- **Directory:** `orgDirectory()` wraps the connector with a minute's cache
  per call (failures aren't cached) and adds `team`, `member` and
  `approvers`. The demo company (`seedOrg`) is a small in-memory
  implementation in the API: lint keeps platform packages out of API code.
- **commercetools:** keys and ids go into predicates as query variables
  (`var.id`, `var.key`). Team names drop the company's prefix ("Lumen Labs ·
  People" shows as "People"). `team-settings.approverIds` is still written
  by `pnpm seed`, but no longer read.
- **Sender app:** the team cookie is now `gifting_team` (was
  `gifting_dev_team`) next to `gifting_company`; a team chosen before this
  change is forgotten once.
- **Tests:** `session.test.ts` (roles, switching, refusals, signed-in
  members, no membership, no organizations), campaigns and collections
  integration tests (owner approves with no team role, self-approval, approver
  can't send, admin can't approve, approver can't edit collections),
  `permissions.test.ts`, `organizations.test.ts`, and the organizations
  conformance section (memory in `pnpm test`; the commercetools sandbox in
  `pnpm test:conformance`, not run for this change).
