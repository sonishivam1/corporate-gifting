import { balanceView } from "@gifting/domain";
import { z } from "zod";

import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { LedgerService } from "./service";

export function ledgerRoutes(ledger: LedgerService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/teams/:teamKey/balance",
      schema: { params: z.object({ teamKey: z.string().min(1) }), response: balanceView },
      handler: async ({ params, request }) => {
        const session = requireSession(request);
        // Another team's balance is "not found", never "forbidden".
        if (params.teamKey !== session.teamKey) throw new ApiError(404, "not_found", "Not found.");
        const b = await ledger.balance(session.teamKey);
        return {
          teamKey: session.teamKey,
          currency: b.currency,
          availableCents: b.availableCents,
          heldCents: b.heldCents,
          spentCents: b.spentCents,
        };
      },
    }),
  ];
}
