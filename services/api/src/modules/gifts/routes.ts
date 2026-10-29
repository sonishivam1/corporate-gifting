import { giftRowView } from "@gifting/domain";
import { z } from "zod";

import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { CampaignsService } from "../campaigns/service";
import type { GiftsService } from "./service";

export function giftsRoutes(gifts: GiftsService, campaigns: CampaignsService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/campaigns/:id/gifts",
      schema: { params: z.object({ id: z.string().min(1) }), response: z.object({ gifts: z.array(giftRowView) }) },
      handler: async ({ params, request }) => {
        const session = requireSession(request);
        const campaign = await campaigns.find(session, params.id);
        return { gifts: await gifts.rowsForCampaign(session.companyKey, session.teamKey, campaign) };
      },
    }),
  ];
}
