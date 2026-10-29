import { meView } from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";

export function accountsRoutes(deps: AppDeps) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/me",
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
