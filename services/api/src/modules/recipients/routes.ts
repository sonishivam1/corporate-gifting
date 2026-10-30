import { recipientImportInput, recipientImportView, recipientView } from "@gifting/domain";
import { z } from "zod";

import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { RecipientsService } from "./service";

export function recipientsRoutes(recipients: RecipientsService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/recipients",
      auth: "workspace",
      schema: {
        query: z.object({ q: z.string().trim().max(80).optional() }),
        response: z.object({ recipients: z.array(recipientView) }),
      },
      handler: async ({ query, request }) => {
        const session = requireSession(request);
        return { recipients: await recipients.search(session.companyKey, query.q) };
      },
    }),
    defineRoute({
      method: "POST",
      url: "/v1/recipients/import",
      auth: "workspace",
      schema: { body: recipientImportInput, response: recipientImportView },
      handler: async ({ body, request }) => {
        const session = requireSession(request);
        const result = await recipients.importRows(session.companyKey, body.rows);
        // Counts only: names and emails are never logged.
        request.log.info({ rows: body.rows.length, added: result.added, existing: result.existing }, "recipient list imported");
        return result;
      },
    }),
  ];
}
