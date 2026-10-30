import type { CardCover, ChannelKind, CollectionView, Occasion, ProductView, SendInput } from "@gifting/domain";
import { collectionItems, findVariant } from "@gifting/domain";

import { LET_THEM_CHOOSE } from "@/lib/features";

/** Everything the sender has chosen so far. Only `toSendInput` turns it into a request. */
export type Draft = {
  mode: "collection" | "single";
  collectionId: string;
  budgetCents: number;
  sku: string | null;
  occasion: Occasion;
  cover: CardCover;
  headline: string;
  fromName: string;
  message: string;
  recipientIds: string[];
  newEmails: string[];
  channels: ChannelKind[];
  when: "now" | "later";
  sendAt: string;
  expiresInDays: 30 | 60 | 90;
  reminders: boolean;
  name: string;
};

export const HEADLINES: Record<Occasion, string> = {
  holiday: "Happy holidays",
  anniversary: "Happy work anniversary",
  birthday: "Happy birthday!",
  thanks: "Thank you!",
  newhire: "Welcome to the team",
  appreciation: "You're appreciated",
};

export const STEPS = ["Gift", "Greeting", "Recipients & delivery", "Review"] as const;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const tomorrow = (now = new Date()) => isoDay(new Date(now.getTime() + 86_400_000));

export function initialDraft(input: {
  fromName: string;
  collections: readonly CollectionView[];
  start: { sku?: string; collectionId?: string };
}): Draft {
  const startCollection = input.collections.find((c) => c.id === input.start.collectionId);
  const collection = startCollection ?? input.collections[0];
  return {
    mode: input.start.sku || !LET_THEM_CHOOSE ? "single" : "collection",
    collectionId: collection?.id ?? "",
    budgetCents: startCollection?.budgetBandCents ?? 5000,
    sku: input.start.sku ?? null,
    occasion: "thanks",
    cover: "confetti",
    headline: HEADLINES.thanks,
    fromName: input.fromName,
    message: "Thanks for everything you put into this quarter. Pick something you'll enjoy. It's on us.",
    recipientIds: [],
    newEmails: [],
    channels: ["email"],
    when: "now",
    sendAt: tomorrow(),
    expiresInDays: 60,
    reminders: true,
    name: "",
  };
}

export function itemsFor(draft: Draft, collections: readonly CollectionView[], products: readonly ProductView[], budgetCents = draft.budgetCents) {
  const collection = collections.find((c) => c.id === draft.collectionId);
  return collection ? collectionItems(collection.rules, products, budgetCents) : [];
}

export const recipientCount = (d: Draft) => d.recipientIds.length + d.newEmails.length;

/** Per-gift budget for the preview; the API re-reads it from the catalog. */
export function perGiftCents(d: Draft, products: readonly ProductView[]): number {
  if (d.mode === "single") return (d.sku && findVariant(products, d.sku)?.variant.priceCents) || 0;
  return d.budgetCents;
}

/** Why a step can't continue yet, or null when it can. */
export function stepProblem(step: number, d: Draft, collections: readonly CollectionView[], products: readonly ProductView[]): string | null {
  if (step === 0) {
    if (d.mode === "single") return d.sku ? null : "Pick a gift to continue.";
    return itemsFor(d, collections, products).length ? null : "Pick a collection with gifts at this budget.";
  }
  if (step === 1) {
    return d.headline.trim() && d.fromName.trim() && d.message.trim() ? null : "Add a headline, a sender and a message.";
  }
  if (step === 2) {
    if (recipientCount(d) === 0) return "Add at least one recipient.";
    if (d.channels.length === 0) return "Pick at least one channel.";
    if (d.when === "later" && !(d.sendAt >= tomorrow())) return "Pick a send date after today.";
  }
  return null;
}

export function toSendInput(d: Draft): SendInput {
  return {
    name: d.name.trim(),
    gift:
      d.mode === "single"
        ? { kind: "single", sku: d.sku ?? "" }
        : { kind: "collection", collectionId: d.collectionId, budgetCents: d.budgetCents },
    greeting: { occasion: d.occasion, cover: d.cover, headline: d.headline, fromName: d.fromName },
    message: d.message,
    recipientIds: d.recipientIds,
    newEmails: d.newEmails,
    channels: d.channels,
    sendAt: d.when === "later" ? d.sendAt : null,
    expiresInDays: d.expiresInDays,
    reminders: d.reminders,
  };
}
