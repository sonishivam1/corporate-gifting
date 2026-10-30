import { meView } from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";

/**
 * The workspace the dashboard works in: company, team, approvers and the
 * team switcher. Until the B2C workspace model is decided it comes from the
 * development session (http/session.ts) and the demo company, so it is a
 * "workspace" route: refused unless DEV_AUTH=1 outside production. The
 * signed-in person is `GET /v1/me` (routes.ts).
 */
export function workspaceRoutes(deps: AppDeps) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/workspace",
      auth: "workspace",
      schema: { response: meView },
      handler: async ({ request }) => {
        const session = requireSession(request);
        const [company, team, user, members] = await Promise.all([
          deps.org.company(session.companyKey),
          deps.org.team(session.companyKey, session.teamKey),
          deps.org.member(session.userId),
          deps.org.members(session.companyKey),
        ]);
        if (!company || !team || !user) throw new ApiError(404, "not_found", "Not found.");
        const names = (ids: readonly string[]) => members.filter((m) => ids.includes(m.id)).map((m) => m.name);
        const teams = await Promise.all(user.teams.map((t) => deps.org.team(session.companyKey, t.teamKey)));
        return {
          user: { id: user.id, name: user.name, role: session.role },
          company,
          team: {
            key: team.key,
            name: team.name,
            approvalThresholdCents: team.approvalThresholdCents,
            approverNames: names(team.approverIds),
          },
          teams: teams.flatMap((t) => (t ? [{ key: t.key, name: t.name }] : [])),
          devUsers: deps.devAuth
            ? members.map((m) => ({ id: m.id, name: m.name, role: m.teams[0]?.role ?? "sender" }))
            : null,
        };
      },
    }),
  ];
}
