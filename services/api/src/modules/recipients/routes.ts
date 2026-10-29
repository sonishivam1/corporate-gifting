import { recipientView } from "@gifting/domain";
import { z } from "zod";

import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { RecipientsService } from "./service";

export function recipientsRoutes(recipients: RecipientsService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/recipients",
      schema: {
        query: z.object({ q: z.string().trim().max(80).optional() }),
        response: z.object({ recipients: z.array(recipientView) }),
      },
      handler: async ({ query, request }) => {
        const session = requireSession(request);
        return { recipients: await recipients.search(session.companyKey, query.q) };
      },
    }),
  ];
}
