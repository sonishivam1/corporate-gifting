import { randomUUID } from "node:crypto";

import { createLogger, type Logger } from "@gifting/logger";

import type { Channel, ChannelKind } from "../types";

/**
 * Development adapter: logs that a gift would have been sent (gift id and
 * channel only, never the recipient or the link) and reports success. Lets
 * the whole flow run locally with no provider accounts.
 */
export function logChannel(kind: ChannelKind, log: Logger = createLogger("channels", { channel: kind })): Channel {
  const deliver = async (giftId: string, reminderNo: number) => {
    const providerMessageId = `log-${randomUUID()}`;
    log.info({ giftId, reminderNo, providerMessageId }, reminderNo === 0 ? "gift sent (log channel)" : "reminder sent (log channel)");
    return { providerMessageId, status: "sent" as const };
  };
  return {
    kind,
    send: (message) => deliver(message.giftId, 0),
    remind: (message, reminderNo) => deliver(message.giftId, reminderNo),
  };
}
