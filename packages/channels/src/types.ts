import type { CHANNEL_KINDS } from "@gifting/domain";

export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** What every channel needs to deliver one gift. The token only ever travels inside `link`. */
export type GiftMessage = {
  giftId: string;
  companyKey: string;
  /** The recipient's address on this channel: an email, a phone number, a Slack or Teams user id. */
  to: string;
  link: string;
  greeting: string;
  senderName: string;
  branding: { brandColor: string | null; logoUrl: string | null };
};

export type SendResult = { providerMessageId: string | null; status: "queued" | "sent" };

export type StatusUpdate = {
  providerMessageId: string;
  status: "delivered" | "failed" | "opened";
  at: Date;
};

/** One delivery channel (ADR 0008). Campaigns and gifts never import a provider SDK. */
export interface Channel {
  readonly kind: ChannelKind;
  send(message: GiftMessage): Promise<SendResult>;
  remind(message: GiftMessage, reminderNo: number): Promise<SendResult>;
  parseStatusWebhook?(body: unknown): StatusUpdate[];
}
