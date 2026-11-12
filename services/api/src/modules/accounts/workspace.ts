import { actionsFor, companiesOf, meView, rolesOnTeam } from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { MembersService } from "./members";

/**
 * The workspace the dashboard works in (ADR 0016): the person, their roles
 * and allowed actions on the current team, the company, the team and its
 * approvers, and the company and team switchers. Any member may read it.
 * The signed-in account itself is `GET /v1/me` (routes.ts).
 */
export function workspaceRoutes(deps: AppDeps, members: MembersService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/workspace",
      auth: "member",
      permission: "member",
      schema: { response: meView },
      handler: async ({ request }) => {
        const session = requireSession(request);
        const org = deps.org;
        if (!org) throw new ApiError(503, "organizations_not_configured", "Companies and roles are not configured on this server.");
        const [company, team, teams, approvers, companies] = await Promise.all([
          org.company(session.companyKey),
          org.team(session.companyKey, session.teamKey),
          org.teams(session.companyKey),
          org.approvers(session.companyKey, session.teamKey),
          Promise.all(companiesOf(session.memberships).map((key) => org.company(key))),
        ]);
        if (!company || !team) throw new ApiError(404, "not_found", "Not found.");
        const reachable = teams.filter((t) => rolesOnTeam(session.memberships, session.companyKey, t.key).length > 0);
        const highest = (roles: readonly ("owner" | "admin" | "approver" | "sender")[]) => roles[0] ?? "sender";
        return {
          user: { id: session.userId, name: session.userName, role: highest(session.roles), roles: session.roles },
          company,
          companies: companies.flatMap((c) => (c ? [c] : [])),
          actions: actionsFor(session.roles),
          team: {
            key: team.key,
            name: team.name,
            approvalThresholdCents: team.approvalThresholdCents,
            approverNames: approvers.map((m) => m.name),
          },
          teams: reachable.map((t) => ({ key: t.key, name: t.name })),
          capabilities: { ...members.capabilities(), editName: request.server.accounts?.canEditName ?? false },
          // The sender app's "Viewing as" picker is gone; kept, always null, because v1 only adds (ADR 0010).
          devUsers: null,
        };
      },
    }),
  ];
}
