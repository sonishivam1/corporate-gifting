import { type Action, can, companiesOf, type MemberRole, type Membership, reachableTeams, rolesOnTeam } from "@gifting/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AppDeps } from "../deps";
import type { OrgDirectory } from "../modules/accounts/org";
import { ApiError } from "./errors";
import { bearerToken } from "./route";

/**
 * Who is calling, inside which company and team, and the roles they hold
 * there (ADR 0016). Every query is scoped by this, never by anything in the
 * request body (CLAUDE.md, "Scope and access").
 */
export type Session = {
  userId: string;
  userName: string;
  companyKey: string;
  teamKey: string;
  /** The roles that apply on this team: the person's company roles and their roles on the team, highest first. */
  roles: MemberRole[];
  /** Every role the person holds in every company (for the company switcher). */
  memberships: Membership[];
};

declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
  }
}

/** Development's default "Viewing as" person: a sender in the demo company. */
export const DEV_DEFAULT_USER = "user-maya";

export const COMPANY_HEADER = "x-gifting-company";
export const TEAM_HEADER = "x-gifting-team";
export const DEV_USER_HEADER = "x-dev-user";

const header = (request: FastifyRequest, name: string) => {
  const value = request.headers[name];
  return typeof value === "string" && value ? value : null;
};

type Person = { id: string; name: string; memberships: Membership[] };

async function devPerson(org: OrgDirectory, id: string): Promise<Person | null> {
  const memberships = await org.membershipsOf(id);
  const [companyKey] = companiesOf(memberships);
  if (!companyKey) return null;
  const member = await org.member(companyKey, id);
  return { id, name: member?.name ?? id, memberships };
}

/**
 * The person behind a member route:
 * - the signed-in account (the API's access token), with their memberships;
 * - in development (DEV_AUTH=1), the "Viewing as" person in `x-dev-user`
 *   first, then the signed-in account if they belong somewhere, then the
 *   demo company's default member.
 */
async function person(request: FastifyRequest, deps: AppDeps): Promise<Person> {
  const accounts = request.server.accounts;
  const token = bearerToken(request.headers.authorization);
  const directory = (): OrgDirectory => {
    if (!deps.org) throw new ApiError(503, "organizations_not_configured", "Companies and roles are not configured on this server.");
    return deps.org;
  };

  if (deps.devAuth) {
    const org = directory();
    const asked = header(request, DEV_USER_HEADER);
    const viewingAs = asked ? await devPerson(org, asked) : null;
    if (viewingAs) return viewingAs;
    if (token && accounts) {
      const account = await accounts.authenticate(token).catch(() => null);
      if (account) {
        const memberships = await org.membershipsOf(account.id);
        if (memberships.length > 0) return { id: account.id, name: accountName(account), memberships };
      }
    }
    const fallback = await devPerson(org, DEV_DEFAULT_USER);
    if (fallback) return fallback;
    throw new ApiError(403, "no_membership", "No member to view the dashboard as.");
  }

  if (!accounts) throw new ApiError(503, "auth_not_configured", "Sign-in is not configured on this server.");
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  // Who is calling comes first, so a stranger learns nothing about how the server is set up.
  const account = await accounts.authenticate(token);
  return { id: account.id, name: accountName(account), memberships: await directory().membershipsOf(account.id) };
}

function accountName(account: { email: string; firstName: string | null; lastName: string | null }): string {
  return [account.firstName, account.lastName].filter(Boolean).join(" ").trim() || account.email;
}

/** The company and team the person works in: the ones the headers ask for when they hold them, else their first. */
export async function resolveSession(request: FastifyRequest, deps: AppDeps): Promise<Session> {
  const who = await person(request, deps);
  const org = deps.org!;

  const companies = companiesOf(who.memberships);
  if (companies.length === 0) throw new ApiError(403, "no_membership", "You're not a member of a company yet. Ask your company's owner or admin to add you.");
  const askedCompany = header(request, COMPANY_HEADER);
  const companyKey = askedCompany && companies.includes(askedCompany) ? askedCompany : companies[0]!;

  const teams = reachableTeams(who.memberships, companyKey, (await org.teams(companyKey)).map((t) => t.key));
  if (teams.length === 0) throw new ApiError(403, "no_membership", "Your company has no team you can work in yet.");
  const askedTeam = header(request, TEAM_HEADER);
  const teamKey = askedTeam && teams.includes(askedTeam) ? askedTeam : teams[0]!;

  return { userId: who.id, userName: who.name, companyKey, teamKey, roles: rolesOnTeam(who.memberships, companyKey, teamKey), memberships: who.memberships };
}

/** Refuses an action the session's roles don't grant on its team. */
export function assertAllowed(session: Session, action: Action): void {
  if (!can(session.roles, action)) throw new ApiError(403, "forbidden", "Your role on this team doesn't allow that.");
}

/**
 * Member routes (http/route.ts) get their session here, before the
 * handler runs, and are refused when the route's action isn't granted.
 */
export function registerSession(app: FastifyInstance, deps: AppDeps): void {
  app.decorateRequest("session", null);
  app.addHook("onRequest", async (request) => {
    const config = request.routeOptions.config;
    if (config?.member !== true) return;
    const session = await resolveSession(request, deps);
    if (!config.permission) throw new ApiError(500, "internal_error", "This route declares no permission.");
    if (config.permission !== "member") assertAllowed(session, config.permission);
    request.session = session;
  });
}

export function requireSession(request: FastifyRequest): Session {
  if (!request.session) throw new ApiError(401, "unauthenticated", "Sign in first.");
  return request.session;
}
