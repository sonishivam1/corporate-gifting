import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AppDeps } from "../deps";
import type { MemberRole } from "../modules/accounts/org";
import { ApiError } from "./errors";

/**
 * Who is calling, and inside which company and team. Every query is scoped
 * by this, never by anything in the request body (CLAUDE.md, "Scope and
 * access").
 */
export type Session = {
  userId: string;
  userName: string;
  companyKey: string;
  teamKey: string;
  role: MemberRole;
};

declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
  }
}

export const DEV_DEFAULT_USER = "user-maya";

const header = (request: FastifyRequest, name: string) => {
  const value = request.headers[name];
  return typeof value === "string" && value ? value : null;
};

/**
 * The dashboard's development session, until the B2C workspace model is
 * decided: the sender app forwards the "Viewing as" user and the chosen team
 * as headers, and they pick a member of the demo company. It applies only to
 * "workspace" routes (http/route.ts); the account routes use real sign-in
 * (ADR 0015). Off unless DEV_AUTH=1 outside production; then every workspace
 * route is refused.
 */
export function registerSession(app: FastifyInstance, deps: AppDeps): void {
  app.decorateRequest("session", null);
  app.addHook("onRequest", async (request) => {
    if (request.routeOptions.config?.workspace !== true) return;
    if (!deps.devAuth) throw new ApiError(401, "unauthenticated", "Sign-in is not set up yet.");

    const member = await deps.org.member(header(request, "x-dev-user") ?? DEV_DEFAULT_USER);
    if (!member) throw new ApiError(401, "unauthenticated", "Unknown user.");
    const wanted = header(request, "x-dev-team");
    const membership = member.teams.find((t) => t.teamKey === wanted) ?? member.teams[0];
    if (!membership) throw new ApiError(401, "unauthenticated", "This user belongs to no team.");

    request.session = {
      userId: member.id,
      userName: member.name,
      companyKey: member.companyKey,
      teamKey: membership.teamKey,
      role: membership.role,
    };
  });
}

export function requireSession(request: FastifyRequest): Session {
  if (!request.session) throw new ApiError(401, "unauthenticated", "Sign in first.");
  return request.session;
}
