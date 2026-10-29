import { OVERVIEW_RANGES, overviewView } from "@gifting/domain";
import { z } from "zod";

import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { ReportingService } from "./service";

export function reportingRoutes(reporting: ReportingService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/teams/:teamKey/overview",
      auth: "workspace",
      schema: {
        params: z.object({ teamKey: z.string().min(1) }),
        query: z.object({ range: z.enum(OVERVIEW_RANGES).default("30d") }),
        response: overviewView,
      },
      handler: async ({ params, query, request }) => {
        const session = requireSession(request);
        // Another team's overview is "not found", never "forbidden".
        if (params.teamKey !== session.teamKey) throw new ApiError(404, "not_found", "Not found.");
        return reporting.overview(session, query.range);
      },
    }),
  ];
}
