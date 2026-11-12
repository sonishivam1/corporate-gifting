import {
  accountView,
  companyMembersView,
  invitationPreview,
  invitationsView,
  invitationView,
  inviteInput,
  MEMBER_ROLES,
  nameInput,
  roleChangeInput,
  teamInput,
  teamView,
} from "@gifting/domain";
import { z } from "zod";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { MembersService } from "./members";

const customerId = z.string().min(1).max(100);
const key = z.string().min(1).max(256);
const invitationId = z.string().regex(/^inv-[0-9a-f-]{36}$/, "Not an invitation.");
const token = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "Not an invitation link.");
const ok = z.object({ status: z.literal("ok") });
const done = { status: "ok" as const };

/** The link carries a secret: limit how fast anyone can try links. */
const LINK_LIMIT = { max: 30, timeWindow: "1 minute" };
const ACCEPT_LIMIT = { max: 10, timeWindow: "1 minute" };

/**
 * Members, teams and invitations of the session's company (ADR 0017), the
 * invitation link, and the profile. Member routes work inside the session's
 * company; writes read the person's roles fresh (ADR 0016, "Hardening").
 */
export function membersRoutes(members: MembersService, deps: AppDeps) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/company/members",
      auth: "member",
      permission: "member",
      schema: { response: companyMembersView },
      handler: async ({ request }) => members.list(requireSession(request)),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/company/members/:customerId/roles",
      auth: "member",
      permission: "members:manage",
      schema: { params: z.object({ customerId }), body: roleChangeInput, response: companyMembersView },
      handler: async ({ request, params, body }) => {
        const session = requireSession(request);
        await members.addRole(session, params.customerId, body, request.log);
        return members.list(session);
      },
    }),
    defineRoute({
      method: "DELETE",
      url: "/v1/company/members/:customerId/roles",
      auth: "member",
      permission: "members:manage",
      schema: { params: z.object({ customerId }), query: z.object({ role: z.enum(MEMBER_ROLES), teamKey: key.optional() }), response: companyMembersView },
      handler: async ({ request, params, query }) => {
        const session = requireSession(request);
        await members.removeRole(session, params.customerId, { role: query.role, teamKey: query.teamKey ?? null }, request.log);
        return members.list(session);
      },
    }),
    defineRoute({
      method: "DELETE",
      url: "/v1/company/members/:customerId",
      auth: "member",
      permission: "members:manage",
      schema: { params: z.object({ customerId }), response: companyMembersView },
      handler: async ({ request, params }) => {
        const session = requireSession(request);
        await members.removeFromCompany(session, params.customerId, request.log);
        return members.list(session);
      },
    }),
    defineRoute({
      method: "POST",
      url: "/v1/company/teams",
      auth: "member",
      permission: "teams:manage",
      rateLimit: { max: 20, timeWindow: "1 minute" },
      schema: { body: teamInput, response: teamView },
      handler: async ({ request, body }) => members.createTeam(requireSession(request), body.name, request.log),
    }),
    defineRoute({
      method: "PATCH",
      url: "/v1/company/teams/:teamKey",
      auth: "member",
      permission: "teams:manage",
      schema: { params: z.object({ teamKey: key }), body: teamInput, response: teamView },
      handler: async ({ request, params, body }) => members.renameTeam(requireSession(request), params.teamKey, body.name, request.log),
    }),
    defineRoute({
      method: "GET",
      url: "/v1/company/invitations",
      auth: "member",
      permission: "members:manage",
      schema: { response: invitationsView },
      handler: async ({ request }) => ({ invitations: await members.invitations(requireSession(request)) }),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/company/invitations",
      auth: "member",
      permission: "members:manage",
      rateLimit: { max: 30, timeWindow: "1 minute" },
      schema: { body: inviteInput, response: invitationView },
      handler: async ({ request, body }) => members.invite(requireSession(request), body, request.log),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/company/invitations/:id/resend",
      auth: "member",
      permission: "members:manage",
      rateLimit: { max: 30, timeWindow: "1 minute" },
      schema: { params: z.object({ id: invitationId }), response: ok },
      handler: async ({ request, params }) => {
        await members.resend(requireSession(request), params.id, request.log);
        return done;
      },
    }),
    defineRoute({
      method: "DELETE",
      url: "/v1/company/invitations/:id",
      auth: "member",
      permission: "members:manage",
      schema: { params: z.object({ id: invitationId }), response: ok },
      handler: async ({ request, params }) => {
        await members.revoke(requireSession(request), params.id, request.log);
        return done;
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/invitations/:token",
      auth: "public",
      rateLimit: LINK_LIMIT,
      schema: { params: z.object({ token }), response: invitationPreview },
      handler: async ({ params }) => members.preview(params.token),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/invitations/:token/accept",
      rateLimit: ACCEPT_LIMIT,
      schema: { params: z.object({ token }), response: z.object({ companyKey: z.string(), teamKey: z.string().nullable(), role: z.enum(MEMBER_ROLES) }) },
      handler: async ({ account, request, params }) => members.accept(account, params.token, request.log),
    }),
    defineRoute({
      method: "PATCH",
      url: "/v1/me",
      rateLimit: { max: 20, timeWindow: "1 minute" },
      schema: { body: nameInput, response: accountView },
      handler: async ({ account, request, body }) => {
        const accounts = request.server.accounts;
        if (!accounts) throw new ApiError(503, "auth_not_configured", "Sign-in is not configured on this server.");
        const updated = await accounts.updateName(account.id, body);
        // The member lists show the new name at once, not after the directory's minute.
        if (deps.org) for (const m of await deps.org.membershipsOf(account.id)) deps.org.forget(m.companyKey);
        request.log.info({ event: "account.name_changed", actorId: account.id }, "account change");
        return { ...updated, canEditName: true };
      },
    }),
  ];
}
