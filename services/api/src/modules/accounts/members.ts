/**
 * Members, teams and invitations (ADR 0017, plan: members-and-invitations.md).
 *
 * The same on every commerce platform: the rules (who may change whom, the
 * last owner, nobody on themselves), the invitation links and emails are the
 * product's; the platform is reached only through the directory's
 * `memberWrites` and `teamWrites`, and a platform without them answers
 * `501 not_supported`. Every change is logged with ids only.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import {
  type AccountView,
  type CompanyMembersView,
  companyRolesOf,
  grantableRoles,
  INVITATION_DAYS,
  type Invitation,
  type InvitationPreview,
  type InvitationView,
  type InviteInput,
  isCompanyRole,
  type MemberRole,
  type Membership,
  type RoleChangeInput,
  type TeamView,
} from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import type { Session } from "../../http/session";
import { invitationEmail } from "./emails";
import type { OrgDirectory, OrgMember } from "./org";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a change is logged: the request's logger (ids only, never emails or names). */
type Logger = { info: (fields: Record<string, unknown>, message: string) => void };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const isDuplicate = (err: unknown) => (err as { code?: unknown }).code === 11000;

const notSupported = (what: string) => new ApiError(501, "not_supported", `${what} are managed in your commerce platform, not here.`);
const notFound = () => new ApiError(404, "not_found", "Not found.");
const invitationGone = () => new ApiError(404, "invitation_not_found", "This invitation has expired, was withdrawn, or was already used.");

/** A team's key from the company's and the team's name: `team-<company>-<name>`, as the demo keys read. */
export function teamKeyFor(companyKey: string, name: string, n = 1): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "team";
  const base = `team-${slug(companyKey.replace(/^company-/, ""))}-${slug(name)}`;
  return n > 1 ? `${base}-${n}` : base;
}

export type MembersService = ReturnType<typeof createMembersService>;

export function createMembersService(deps: AppDeps) {
  const c = () => getCollections(deps.db);
  const org = (): OrgDirectory => {
    if (!deps.org) throw new ApiError(503, "organizations_not_configured", "Companies and roles are not configured on this server.");
    return deps.org;
  };
  const memberWrites = () => org().memberWrites ?? (() => { throw notSupported("People and roles"); })();
  const teamWrites = () => org().teamWrites ?? (() => { throw notSupported("Teams"); })();
  const audit = (log: Logger | undefined, event: string, fields: Record<string, unknown>) => (log ?? deps.log)?.info({ event, ...fields }, "organization change");

  /** The roles the caller may give or take away in their company (none unless they hold owner or admin there). */
  const grantable = (session: Session) => grantableRoles(companyRolesOf(session.memberships, session.companyKey));

  /** Checks a role change's shape and team, and that the caller may give or take that role. */
  async function checkRole(session: Session, input: RoleChangeInput): Promise<Membership> {
    if (isCompanyRole(input.role) === Boolean(input.teamKey)) {
      throw new ApiError(400, "invalid_role", isCompanyRole(input.role) ? "Owners and admins hold their role on the company, not on a team." : "Choose the team for this role.");
    }
    if (!grantable(session).includes(input.role)) throw new ApiError(403, "role_not_allowed", "Your role doesn't let you give or take away that role.");
    if (input.teamKey && !(await org().team(session.companyKey, input.teamKey))) throw notFound();
    return { companyKey: session.companyKey, ...(input.teamKey ? { teamKey: input.teamKey } : {}), role: input.role };
  }

  /** A member of the caller's company other than the caller. Someone outside it is "not found". */
  async function target(session: Session, customerId: string): Promise<OrgMember> {
    if (customerId === session.userId) throw new ApiError(403, "own_roles", "You can't change your own roles. Ask another owner or admin.");
    const member = await org().member(session.companyKey, customerId);
    if (!member) throw notFound();
    return member;
  }

  /** Refuses taking away the company's last owner. */
  async function keepAnOwner(session: Session, member: OrgMember, losing: readonly Membership[]) {
    if (!losing.some((m) => m.role === "owner" && !m.teamKey)) return;
    const owners = (await org().members(session.companyKey)).filter((m) => m.memberships.some((x) => x.role === "owner" && !x.teamKey));
    if (owners.every((o) => o.id === member.id)) throw new ApiError(409, "last_owner", "A company always needs an owner. Make someone else an owner first.");
  }

  function invitationView(inv: Invitation, teamNames: Map<string, string>, people: Map<string, string>): InvitationView {
    return {
      id: inv._id,
      email: inv.emailLower,
      role: inv.role,
      teamKey: inv.teamKey,
      teamName: inv.teamKey ? (teamNames.get(inv.teamKey) ?? inv.teamKey) : null,
      invitedByName: people.get(inv.invitedBy) ?? "A former member",
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async function sendInvitation(session: Session, inv: Invitation, token: string) {
    if (!deps.mailer) throw new ApiError(503, "mail_not_configured", "Email isn't configured on this server, so invitations can't be sent.");
    const [company, team] = await Promise.all([org().company(session.companyKey), inv.teamKey ? org().team(session.companyKey, inv.teamKey) : null]);
    const link = `${deps.senderBaseUrl ?? "http://localhost:3000"}/invitations/${token}`;
    await deps.mailer.send(
      invitationEmail(inv.emailLower, { inviterName: session.userName, companyName: company?.name ?? session.companyKey, role: inv.role, teamName: team?.name ?? null, link, days: INVITATION_DAYS }),
    );
  }

  const newToken = () => {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: sha256(token) };
  };

  return {
    capabilities: () => ({ manageMembers: Boolean(deps.org?.memberWrites), manageTeams: Boolean(deps.org?.teamWrites) }),

    /** Everyone with a role in the caller's company. Emails only for people who manage members. */
    async list(session: Session): Promise<CompanyMembersView> {
      const [members, teams] = await Promise.all([org().members(session.companyKey), org().teams(session.companyKey)]);
      const mayGrant = grantable(session);
      const showEmails = mayGrant.length > 0;
      return {
        members: members
          .map((m) => ({ id: m.id, name: m.name, email: showEmails ? m.email : null, memberships: m.memberships.map((x) => ({ role: x.role, teamKey: x.teamKey ?? null })) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        teams: teams.map((t) => ({ key: t.key, name: t.name })),
        grantable: mayGrant,
      };
    },

    async addRole(session: Session, customerId: string, input: RoleChangeInput, log?: Logger): Promise<void> {
      const writes = memberWrites();
      const member = await target(session, customerId);
      const membership = await checkRole(session, input);
      if (!(await writes.addRole(member.id, membership))) throw notFound();
      org().forget(session.companyKey, member.id);
      audit(log, "org.role_added", { actorId: session.userId, targetId: member.id, companyKey: session.companyKey, teamKey: input.teamKey, role: input.role });
    },

    async removeRole(session: Session, customerId: string, input: RoleChangeInput, log?: Logger): Promise<void> {
      const writes = memberWrites();
      const member = await target(session, customerId);
      const membership = await checkRole(session, input);
      await keepAnOwner(session, member, [membership]);
      if (!(await writes.removeRole(member.id, membership))) throw notFound();
      org().forget(session.companyKey, member.id);
      audit(log, "org.role_removed", { actorId: session.userId, targetId: member.id, companyKey: session.companyKey, teamKey: input.teamKey, role: input.role });
    },

    /** Takes away every role the member holds in the company. Each must be one the caller may take away. */
    async removeFromCompany(session: Session, customerId: string, log?: Logger): Promise<void> {
      const writes = memberWrites();
      const member = await target(session, customerId);
      const mayGrant = grantable(session);
      if (member.memberships.some((m) => !mayGrant.includes(m.role))) throw new ApiError(403, "role_not_allowed", "Your role doesn't let you remove this person.");
      await keepAnOwner(session, member, member.memberships);
      for (const m of member.memberships) await writes.removeRole(member.id, m);
      org().forget(session.companyKey, member.id);
      audit(log, "org.member_removed", { actorId: session.userId, targetId: member.id, companyKey: session.companyKey, roles: member.memberships.length });
    },

    /** A new team with a key from the company and the name; a key the platform has gets a number. */
    async createTeam(session: Session, name: string, log?: Logger): Promise<TeamView> {
      const writes = teamWrites();
      for (let n = 1; n <= 20; n++) {
        const created = await writes.createTeam(session.companyKey, { key: teamKeyFor(session.companyKey, name, n), name });
        if (!created) throw notFound();
        if ("conflict" in created) continue;
        org().forget(session.companyKey);
        audit(log, "org.team_created", { actorId: session.userId, companyKey: session.companyKey, teamKey: created.key });
        return { key: created.key, name: created.name };
      }
      throw new ApiError(409, "team_key_taken", "Too many teams have a similar name. Choose another name.");
    },

    async renameTeam(session: Session, teamKey: string, name: string, log?: Logger): Promise<TeamView> {
      const writes = teamWrites();
      if (!(await org().team(session.companyKey, teamKey))) throw notFound();
      const renamed = await writes.renameTeam(session.companyKey, teamKey, name);
      if (!renamed) throw notFound();
      org().forget(session.companyKey);
      audit(log, "org.team_renamed", { actorId: session.userId, companyKey: session.companyKey, teamKey });
      return { key: renamed.key, name: renamed.name };
    },

    /** Pending invitations of the caller's company, newest first. */
    async invitations(session: Session): Promise<InvitationView[]> {
      memberWrites();
      const [list, teams, members] = await Promise.all([
        c().invitations.find({ companyKey: session.companyKey, status: "pending" }).sort({ createdAt: -1 }).limit(200).toArray(),
        org().teams(session.companyKey),
        org().members(session.companyKey),
      ]);
      const teamNames = new Map(teams.map((t) => [t.key, t.name]));
      const people = new Map(members.map((m) => [m.id, m.name]));
      return list.map((inv) => invitationView(inv, teamNames, people));
    },

    /** Invites an email address to one role. Never looks the address up: inviting says nothing about who has an account. */
    async invite(session: Session, input: InviteInput, log?: Logger): Promise<InvitationView> {
      memberWrites();
      await checkRole(session, input);
      const now = deps.now();
      const { token, tokenHash } = newToken();
      const inv: Invitation = {
        _id: `inv-${randomUUID()}`,
        companyKey: session.companyKey,
        teamKey: input.teamKey,
        role: input.role,
        emailLower: input.email,
        tokenHash,
        status: "pending",
        invitedBy: session.userId,
        acceptedBy: null,
        revokedBy: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY_MS),
        acceptedAt: null,
        revokedAt: null,
        updatedAt: now,
      };
      try {
        await c().invitations.insertOne(inv);
      } catch (err) {
        if (isDuplicate(err)) throw new ApiError(409, "already_invited", "This person already has a pending invitation for that role. Resend it instead.");
        throw err;
      }
      try {
        await sendInvitation(session, inv, token);
      } catch (err) {
        // Nobody can use an invitation whose email never left: take it back, so it can be sent again.
        await c().invitations.deleteOne({ _id: inv._id, status: "pending" });
        throw err;
      }
      audit(log, "org.invitation_sent", { actorId: session.userId, invitationId: inv._id, companyKey: session.companyKey, teamKey: inv.teamKey, role: inv.role });
      const team = inv.teamKey ? await org().team(session.companyKey, inv.teamKey) : null;
      return invitationView(inv, new Map(team ? [[team.key, team.name]] : []), new Map([[session.userId, session.userName]]));
    },

    /** A new link and 7 more days; the old link stops working. */
    async resend(session: Session, id: string, log?: Logger): Promise<void> {
      memberWrites();
      const found = await c().invitations.findOne({ _id: id, companyKey: session.companyKey, status: "pending" });
      if (!found) throw notFound();
      if (!grantable(session).includes(found.role)) throw new ApiError(403, "role_not_allowed", "Your role doesn't let you give that role.");
      const now = deps.now();
      const { token, tokenHash } = newToken();
      const updated = await c().invitations.findOneAndUpdate(
        { _id: id, companyKey: session.companyKey, status: "pending" },
        { $set: { tokenHash, expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY_MS), updatedAt: now } },
        { returnDocument: "after" },
      );
      if (!updated) throw notFound();
      await sendInvitation(session, updated, token);
      audit(log, "org.invitation_resent", { actorId: session.userId, invitationId: id, companyKey: session.companyKey });
    },

    async revoke(session: Session, id: string, log?: Logger): Promise<void> {
      memberWrites();
      const found = await c().invitations.findOne({ _id: id, companyKey: session.companyKey, status: "pending" });
      if (!found) throw notFound();
      if (!grantable(session).includes(found.role)) throw new ApiError(403, "role_not_allowed", "Your role doesn't let you withdraw that invitation.");
      const now = deps.now();
      const done = await c().invitations.updateOne(
        { _id: id, status: "pending" },
        { $set: { status: "revoked", revokedBy: session.userId, revokedAt: now, updatedAt: now } },
      );
      if (done.modifiedCount === 0) throw notFound();
      audit(log, "org.invitation_revoked", { actorId: session.userId, invitationId: id, companyKey: session.companyKey });
    },

    /** What the link page shows: the company, role and team. No email: links get forwarded. */
    async preview(token: string): Promise<InvitationPreview> {
      const inv = await c().invitations.findOne({ tokenHash: sha256(token), status: "pending", expiresAt: { $gt: deps.now() } });
      if (!inv) throw invitationGone();
      const [company, team] = await Promise.all([org().company(inv.companyKey), inv.teamKey ? org().team(inv.companyKey, inv.teamKey) : null]);
      if (!company) throw invitationGone();
      return { companyName: company.name, role: inv.role, teamName: team?.name ?? null, expiresAt: inv.expiresAt.toISOString() };
    },

    /**
     * Accepts as the signed-in account, exactly once: the claim moves the
     * invitation from pending (and not expired) to accepting, the platform
     * gets the role, then it is accepted. A failed platform write puts it
     * back to pending.
     */
    async accept(account: AccountView, token: string, log?: Logger): Promise<{ companyKey: string; teamKey: string | null; role: MemberRole }> {
      const writes = memberWrites();
      const tokenHash = sha256(token);
      const now = deps.now();
      // The claim is the lock: one update moves it from pending to accepting, for the invited address only.
      const claimed = await c().invitations.findOneAndUpdate(
        { tokenHash, status: "pending", expiresAt: { $gt: now }, emailLower: account.email.toLowerCase() },
        { $set: { status: "accepting", updatedAt: now } },
        { returnDocument: "after" },
      );
      if (!claimed) {
        // Someone got there first, or it can't be accepted: read it only to say why.
        const found = await c().invitations.findOne({ tokenHash });
        if (!found || found.status === "revoked" || (found.status === "pending" && found.expiresAt <= now)) throw invitationGone();
        if (found.status === "pending") {
          throw new ApiError(403, "invitation_wrong_account", "This invitation was sent to another email address. Sign in with that address to accept it.");
        }
        throw new ApiError(409, "invitation_used", "This invitation was already accepted.");
      }
      const membership: Membership = { companyKey: claimed.companyKey, ...(claimed.teamKey ? { teamKey: claimed.teamKey } : {}), role: claimed.role };
      let added: boolean;
      try {
        added = await writes.addRole(account.id, membership);
      } catch (err) {
        await c().invitations.updateOne({ _id: claimed._id, status: "accepting" }, { $set: { status: "pending", updatedAt: deps.now() } });
        throw err;
      }
      if (!added) {
        // The company or team is gone: the invitation can never work.
        await c().invitations.updateOne({ _id: claimed._id, status: "accepting" }, { $set: { status: "revoked", revokedAt: deps.now(), updatedAt: deps.now() } });
        throw invitationGone();
      }
      await c().invitations.updateOne({ _id: claimed._id, status: "accepting" }, { $set: { status: "accepted", acceptedBy: account.id, acceptedAt: deps.now(), updatedAt: deps.now() } });
      org().forget(claimed.companyKey, account.id);
      audit(log, "org.invitation_accepted", { actorId: account.id, invitationId: claimed._id, companyKey: claimed.companyKey, teamKey: claimed.teamKey, role: claimed.role });
      return { companyKey: claimed.companyKey, teamKey: claimed.teamKey, role: claimed.role };
    },
  };
}
