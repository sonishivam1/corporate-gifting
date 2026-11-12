# 0017 — Invitations, and managing members from the product

**Status:** Accepted (12 Nov 2026, Shivam). Builds on
[0016](0016-organizations-and-roles.md), point 8 ("How people join").

## Context

Memberships live in the commerce platform (ADR 0016), and today only an
operator changes them, with `pnpm member:add`. Owners and admins need to
bring their own people in and set their roles. An invitation is sent to an
email address that may not have an account yet, so it has to wait
somewhere until the person registers, signs in and accepts. The platform
has no place for that: commercetools holds associates, not offers to
become one. ADR 0002 lists MongoDB's collections, and a new one needs a
decision.

## Decision

1. **A ninth MongoDB collection, `invitations`.** One document per
   invitation:

   | Field | Meaning |
   | --- | --- |
   | `_id` | `inv-<uuid>` |
   | `companyKey`, `teamKey` | Where the role is given (`teamKey` null for owner and admin) |
   | `role` | `owner`, `admin`, `approver` or `sender` |
   | `emailLower` | The invited address, lower case (personal data: never logged) |
   | `tokenHash` | SHA-256 of the link's 32 random bytes; the token itself is never stored |
   | `status` | `pending`, `accepting`, `accepted`, `revoked` |
   | `invitedBy`, `acceptedBy`, `revokedBy` | Customer ids |
   | `createdAt`, `expiresAt`, `acceptedAt`, `revokedAt` | Dates (`expiresAt` 7 days after sending or resending) |

   Indexes: unique `tokenHash`; unique on `companyKey`, `emailLower`,
   `teamKey` and `role` where `status` is `pending` (one pending invitation
   for the same role); `companyKey` with `status` and `createdAt` for the
   list.

2. **The membership itself still lives only in the platform.** Accepting
   writes the role through the connector's `organizations.memberWrites`; the
   invitation only records that it happened. An invitation never grants
   anything by itself.

3. **Exactly once.** Accepting claims the invitation with one
   `findOneAndUpdate` from `pending` (and not expired) to `accepting`,
   writes the role (idempotent), then marks it `accepted`. A failed
   platform write puts it back to `pending`.

4. **Only the invited person accepts.** The signed-in account's verified
   email must be the invited address. Inviting never reveals whether that
   address has an account.

5. **Managing members and teams goes through the connector, the same on
   every platform.** The contract gains three optional parts, each on its
   own: `organizations.memberWrites` (`addRole`, `removeRole`),
   `organizations.teamWrites` (`createTeam`, `renameTeam`) and
   `accounts.updateName`. The API reads them as capabilities
   (`manageMembers`, `manageTeams`, `editName`), never as a platform's
   name; a missing part answers `501 not_supported` and the app hides it.
   The product's own rules decide who may change whom (see the
   [plan](../../plans/members-and-invitations.md)).

6. **Invitations are the product's on every platform.** Our tokens, our
   emails, our accept page; the platform only receives the final
   `addRole`. A platform's own invitation emails are never used.

7. **Platforms that can't hold our roles** (Shopify's two fixed contact
   roles) get the built-in MongoDB directory that ADR 0016 plans; it
   implements the same read and write parts, so this feature works there
   unchanged. It is built, with its own record, when the first such client
   arrives.

## Consequences

- MongoDB holds nine collections. The new one keeps an email address for
  up to 7 days per pending invitation, and after that for the record of
  who was invited.
- Each connector that offers a part must pass its conformance checks.
- The commercetools API client needs `manage_business_units`.
- `pnpm member:add` stays for operators and set-up, next to invitations.
- Invitation links are bearer secrets, like gift links: hashed at rest,
  never logged, and the link page is rate-limited.
- A stored audit trail of membership changes is still to decide; until
  then, changes are logged, and invitations keep who invited and who
  accepted.
