# Members, teams, invitations and profile

**Status:** Built
**Agreed:** 12 Nov 2026 · **Built:** 12 Nov 2026

## Goal

Owners and admins run their own company from the dashboard: invite people
by email, give and take away roles, and create and rename teams. Everyone
gets a profile page with their name, email, companies and roles, and can
change their name. Today an operator adds people with `pnpm member:add`,
and nothing about a person or a company can be changed from the product
([ADR 0016](../architecture/decisions/0016-organizations-and-roles.md),
point 8). Memberships stay in the commerce platform; invitations waiting
for an answer live in MongoDB
([ADR 0017](../architecture/decisions/0017-invitations.md)).

Everything here works the same on every commerce platform (ADR 0013): the
rules, invitations, emails, screens and logs are the product's own, and the
platform is reached only through optional parts of the connector contract,
which the product reads as capabilities (decision 6). commercetools is the
first connector to implement them.

## Scope

| # | Piece | Where |
| --- | --- | --- |
| 1 | Actions: `members:manage` (exists) and a new `teams:manage`, both for owners and admins; who may grant which role | `packages/domain` (`permissions.ts`) |
| 2 | Contract, each part optional: `organizations.memberWrites` (`addRole`, `removeRole`), `organizations.teamWrites` (`createTeam`, `renameTeam`), `accounts.updateName`, `OrgMember.email`; the capabilities the API derives from them; conformance checks for each | `packages/commerce` |
| 3 | Memory connector: all of it, and a way to leave each part out (so tests run the product on a platform that lacks it). commercetools: Business Unit update actions (`addAssociate`, `changeAssociate`, `removeAssociate`, `changeName`) and new Divisions | `packages/commerce-memory`, `packages/commerce-commercetools` |
| 4 | `invitations` collection: model, indexes (exactly-once guards) | `packages/domain`, `packages/db` |
| 5 | Member routes: list members, add and remove a role, remove from the company | `services/api` (`modules/accounts`) |
| 6 | Team routes: create, rename | `services/api` (`modules/accounts`) |
| 7 | Invitation routes: invite, list pending, resend, revoke; read and accept by link | `services/api` (`modules/accounts`), the mailer |
| 8 | Profile: `PATCH /v1/me` (first and last name) | `services/api` (`modules/accounts`) |
| 9 | The directory forgets what a change touched (members, teams, the person's memberships); `GET /v1/workspace` and `GET /v1/me` say which capabilities the deployment has | `services/api` (`modules/accounts`) |
| 10 | Sender app: "My profile" and "Organizations & teams" in the account menu; `/settings/profile`; `/settings/organization` (Members, Teams, Invitations); `/invitations/[token]` | `apps/sender`, `packages/ui` (`user-menu`) |

**Not in scope:** projects (no such thing yet; decided later); changing
email or password (the platform's own flows); deleting teams or
companies; editing approval thresholds; custom roles; a stored audit trail
(this step logs every change and keeps who invited and who accepted on the
invitation); the built-in MongoDB directory for platforms without B2B
features (it will implement the same contract, so these screens work on it
unchanged).

## Decisions

1. **Who may change whom.**
   - Owners and admins manage members (`members:manage`) and teams
     (`teams:manage`).
   - A person grants or takes away only roles no higher than their own:
     owners manage every role; admins manage admins, approvers and
     senders, never owners.
   - Nobody changes their own roles (no self-promotion, no locking
     yourself out by mistake).
   - The company always keeps an owner: removing or demoting the last one
     is refused (`409 last_owner`).
   - Owner and admin are given on the company; approver and sender on one
     team of it (ADR 0016). A team role needs a team of the session's
     company; a company role takes none.
2. **Invitations** ([ADR 0017](../architecture/decisions/0017-invitations.md)).
   - An owner or admin invites an email address with one role (and a team
     for approver and sender). The rules in decision 1 apply to the role.
   - The API emails a link, `SENDER_PUBLIC_URL/invitations/<token>`,
     through the one mailer. The token is 32 random bytes, stored only as
     a SHA-256 hash. It expires after 7 days.
   - Inviting says nothing about whether the address has an account, and
     the API never looks it up.
   - The link page (public, rate-limited like short codes) shows the
     company, the role and the team, and asks the person to sign in or
     register first.
   - Accepting needs a signed-in account (`auth: "account"`, no company
     needed) whose verified email is the invited one, ignoring case.
     Otherwise `403 invitation_wrong_account`.
   - Exactly once: one `findOneAndUpdate` moves the invitation from
     `pending` (and not expired) to `accepting`; a `null` result is
     `409 invitation_used`. Then the connector adds the role (adding a role
     already held changes nothing), and the invitation becomes `accepted`.
     If the platform write fails, it goes back to `pending`.
   - Owners and admins see pending invitations, resend one (a new token
     and 7 more days; the old link stops working) and revoke one.
   - One pending invitation per company, email, team and role (a unique
     index). Inviting again is `409 already_invited`; resend instead.
3. **Members.**
   - Everyone in a company sees its members and their roles (names only).
     Owners and admins also see emails, where the platform gives them
     (`OrgMember.email` is optional).
   - Adding and removing a role, and removing someone from the company
     (every role they hold there), are member routes with
     `members:manage`. Each write reads memberships fresh (ADR 0016,
     "Hardening"), and then the directory forgets the target's
     memberships and the company's member list.
   - A removed person keeps their account and their other companies.
     Their campaigns and gifts stay with the team.
4. **Teams.**
   - Owners and admins create and rename teams (`teams:manage`).
   - The product makes a new team's key from the company and the name
     (`team-<company>-<name>`) and never changes it; renaming changes only
     the name. Keys are the product's, never platform ids (ADR 0016), so the
     connector stores the key it is given (commercetools: the Business
     Unit key). A key the platform already has comes back as
     `{ conflict: true }`, and the product tries again with a number added.
   - A new team has no approval threshold, so every send needs approval
     (fails closed), and no budget account, so its balance reads as $0
     until M1 funds it.
   - Teams aren't deleted in this step: their campaigns, gifts and ledger
     would stay behind with nowhere to show them.
5. **Profile.**
   - `/settings/profile` shows name, email, and every company with the
     person's roles there.
   - `PATCH /v1/me` changes the first and last name (each 1–100
     characters, trimmed), through the accounts connector's new
     `updateName`. Email and password stay with the platform.
6. **The same on every platform; differences are capabilities.**
   - The product (rules, invitations, tokens, emails, screens, logs) never
     names a platform. It calls three optional parts of the contract, each
     on its own, because a platform may manage people but not teams, or
     neither:

     | Part | Methods | Capability (in `GET /v1/workspace` and `GET /v1/me`) |
     | --- | --- | --- |
     | `organizations.memberWrites` | `addRole(customerId, membership)`, `removeRole(customerId, membership)` | `manageMembers` (accepting an invitation needs it, so it gates inviting too) |
     | `organizations.teamWrites` | `createTeam(companyKey, { key, name })`, `renameTeam(companyKey, teamKey, name)` | `manageTeams` |
     | `accounts.updateName` | `updateName(customerId, { firstName, lastName })` | `editName` |

   - A missing part makes its routes answer `501 not_supported`, and the
     sender app hides its controls by capability as well as by action, with
     a note that this is managed in the platform. Nothing checks a
     platform's name (CLAUDE.md).
   - What every connector must do, whatever the platform: writes are
     idempotent (adding a role already held, or removing one not held,
     changes nothing; the connector reads before it writes where the
     platform doesn't do this itself); concurrent changes are the
     connector's to handle (commercetools: versions); an unknown company,
     team or customer is refused, never created on the way.
   - Invitations are the product's on every platform: our tokens, our
     emails through our mailer, our accept page. The platform only receives
     the final `addRole`, so a platform's own invitation emails are never
     used and people get the same experience everywhere.
   - The conformance suite checks each part a connector offers, so a new
     connector proves it before its capability is switched on.
   - Platforms whose B2B features can't hold our four roles on two levels
     (Shopify's two fixed contact roles) offer no `organizations` today.
     The built-in MongoDB directory (ADR 0016, point 2) is the answer for
     them: it implements the same read and write contract, so these routes
     and screens need no change. It is built when the first such client
     arrives.
   - Tests run the product on the memory connector (every part, and each
     part left out), so nothing here depends on commercetools.
   - commercetools:
     - A role is an associate role on the Company unit (owner, admin) or
       on the team's Division (approver, sender), as `member:add` writes
       it today: `addAssociate` when the person isn't an associate of the
       unit yet, `changeAssociate` to add or drop one role, and
       `removeAssociate` when no role is left.
     - New teams are Divisions under the company (`storeMode:
       FromParent`, `associateMode: Explicit`).
     - Writes use the unit's version and retry up to 3 times on a
       concurrent change (`409 ConcurrentModification`).
     - A Business Unit key that exists answers `{ conflict: true }`.
     - The API client gains `manage_business_units` (planned for this step
       in [commercetools design](../architecture/commercetools.md)). The
       customer write for `updateName` uses the client the accounts
       connector already writes customers with; if that client lacks the
       scope, the build adds `manage_customers` to it and records it.
7. **Audit.** Every change is logged with `@gifting/logger`: the event
   (`org.role_added`, `org.role_removed`, `org.team_created`,
   `org.team_renamed`, `org.invitation_sent`, `org.invitation_accepted`,
   `org.invitation_revoked`), the actor id, the target id, the company,
   team and role. Ids only, never emails or names. A stored audit trail is
   a later decision.
8. **Sender app.**
   - The account menu gets "My profile" and "Organizations & teams" above
     "Sign out". `UserMenu` in `@gifting/ui` takes a list of links.
   - `/settings/organization` works on the company chosen in the switcher,
     with three tabs: Members (roles per team, and for managers: add role,
     remove role, remove from company), Teams (list; create and rename for
     managers), Invitations (managers only: invite, resend, revoke).
   - Controls are shown by action (`members:manage`, `teams:manage`), as
     today; the API is what refuses.

## Tests

- Unit (`@gifting/domain`): who may grant which role (owner, admin, an
  approver and a sender refused); nobody on themselves.
- Conformance (`memberWrites`, `teamWrites`, `updateName`, each when
  offered): add a role, add it again (no change), remove it, remove it
  again (no change); create and rename a team; a taken key is a conflict;
  an unknown company, team or customer refused.
- Capabilities: with the memory connector missing each part in turn, its
  routes answer `501 not_supported`, the capability is false, and the
  other parts still work. Against memory in
  `pnpm test`, against the sandbox in `pnpm test:conformance`.
- commercetools unit tests: the update actions built for add, change and
  remove; a retry on a version conflict.
- API (`app.inject()`, integration):
  - members: an owner adds and removes roles; an admin can't touch an
    owner; nobody changes their own roles; the last owner can't be removed;
    a sender and an approver are refused (`403 forbidden`); another
    company's member is `404`;
  - a removed role stops the person's next write at once;
  - teams: create (key made from the name, a clash numbered), rename, a
    sender refused;
  - invitations: invite, the email in `.data/outbox` without the token in
    any log, accept as the invited account, accept twice (`409
    invitation_used`), accept as another account (`403
    invitation_wrong_account`), an expired link, a revoked link, a resent
    link (the old one dead), inviting the same person twice (`409
    already_invited`), a team from another company refused;
  - profile: change the name; empty and too long refused; the new name
    shows in the workspace.
- Break and restore: drop the "no higher than your own" check, and the
  admin-touches-owner test fails; drop `status: "pending"` from the accept
  filter, and the accept-twice test fails.
- `pnpm lint`, `typecheck`, `test`, `test:integration` and `build` pass.

## Docs to update

ADR 0017 (new) and the decision index; ADR 0016 (point 8, joining);
`CLAUDE.md` (nine collections, the commands table for `member:add`);
`docs/architecture/data-model.md` (`invitations`);
`docs/architecture/security.md` (who may change whom, invitation tokens);
`docs/architecture/commercetools.md` (Business Unit writes, scopes);
`docs/technical/api.md` (the new routes and errors);
`docs/engineering/writing-a-connector.md` (`memberWrites`, `teamWrites`,
`updateName`, what each must guarantee, the capabilities they switch on); `docs/product/features.md`; the README progress table; the
roadmap; the build log; the changelog; this plan's As built.

## As built

Built 12 Nov 2026 on `feature/members-and-invitations`, as planned, with
these differences:

- **Accepting claims first.** The accept route's first step is the
  `findOneAndUpdate` claim (pending, not expired, the signed-in address);
  only a `null` result reads the invitation, to say why. An earlier draft
  read it first, and that read, not the claim, refused a second accept: a
  break-and-restore test showed the claim's filter could be dropped with no
  test failing. Now the claim is the lock, as CLAUDE.md asks.
- **The last owner.** Reachable through the API only by an owner on
  another owner (admins never touch owners, nobody changes their own
  roles), so the test is "a second owner may take the first's role"; the
  `409 last_owner` check stays as a guard.
- **Profile.** The integration tests use a stand-in accounts service; the
  real one's name change (and `501` without `updateName`) is tested in
  `accounts.test.ts` on the memory connector. That the new name shows in
  the member list straight away is not tested (the directory's cache is
  forgotten on a change).
- **Sender app.** The account menu (`UserMenu` in `packages/ui`, which now
  takes `links` and the router's `linkAs`) opens `/settings/profile` and
  `/settings/organization` (People, Teams, Invitations tabs). The
  invitation link page, `/invitations/<token>`, is open to signed-out
  visitors (`proxy.ts`): it shows the offer and links to sign in with
  `returnTo`. After registering, the person opens the link again.

Verified: domain 109, db 9, memory connector 57, commercetools connector 38
and API 89 unit tests; `pnpm test:integration` 120 passed (25 new in
`members.test.ts`); break and restore: dropping the grantable check fails 2
tests, dropping `status: "pending"` from the claim fails 3; `pnpm lint`,
`typecheck` and `build` pass. The signed-out invitation page was checked in
the browser; the signed-in pages were not (no test account was signed in).
Not run: `pnpm test:conformance` against the sandbox (it writes to the
commercetools project; run it by hand, with `manage_business_units` added to the API
client's scopes; it already holds `manage_customers` for registration).
