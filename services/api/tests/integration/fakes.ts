import type { Channel, GiftMessage } from "@gifting/channels";

export const address = { name: "Priya Nair", line1: "200 Sample Ave", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" };

/** An email channel that records what it is asked to send, instead of sending it. */
export function recordingChannel() {
  const sent: GiftMessage[] = [];
  let fail = false;
  const channel: Channel = {
    kind: "email",
    async send(message) {
      if (fail) {
        fail = false;
        throw new Error("provider down");
      }
      sent.push(message);
      return { providerMessageId: `msg-${sent.length}`, status: "sent" };
    },
    async remind(message) {
      sent.push(message);
      return { providerMessageId: `msg-${sent.length}`, status: "sent" };
    },
  };
  return { channel, sent, failNext: () => void (fail = true) };
}

export const tokenOf = (message: GiftMessage) => /\/r\/([A-Za-z0-9_-]+)/.exec(message.link)![1]!;
