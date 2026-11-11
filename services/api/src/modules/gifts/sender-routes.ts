import { z } from "zod";

import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { ChannelsService } from "../channels/service";
import type { GiftActions } from "./actions";

const id = z.object({ id: z.string().min(1).max(100) });

/** What a sender does with one gift (docs/technical/api.md). */
export function senderGiftRoutes(channels: ChannelsService, actions: GiftActions) {
  return [
    defineRoute({
      method: "POST",
      auth: "member",
      permission: "gift:manage",
      url: "/v1/gifts/:id/resend",
      rateLimit: { max: 20, timeWindow: "1 minute" },
      schema: { params: id, response: z.object({ result: z.enum(["sent", "failed"]) }) },
      handler: async ({ params, request }) => ({ result: await channels.resend(requireSession(request), params.id) }),
    }),
    defineRoute({
      method: "POST",
      auth: "member",
      permission: "gift:manage",
      url: "/v1/gifts/:id/cancel",
      rateLimit: { max: 20, timeWindow: "1 minute" },
      schema: { params: id, response: z.object({ cancelled: z.literal(true) }) },
      handler: async ({ params, request }) => {
        await actions.cancel(requireSession(request), params.id);
        return { cancelled: true as const };
      },
    }),
  ];
}
