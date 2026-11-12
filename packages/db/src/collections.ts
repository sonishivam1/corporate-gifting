import type {
  BudgetAccount,
  Campaign,
  Gift,
  GiftCollection,
  Integration,
  Invitation,
  LedgerEntry,
  ProcessedEvent,
  Recipient,
} from "@gifting/domain";
import type { Collection, Db } from "mongodb";

/** The nine collections (ADR 0002, ADR 0017). A new one needs a decision record. */
export const COLLECTIONS = {
  accounts: "accounts",
  ledgerEntries: "ledgerEntries",
  collections: "collections",
  recipients: "recipients",
  campaigns: "campaigns",
  gifts: "gifts",
  integrations: "integrations",
  processedEvents: "processedEvents",
  invitations: "invitations",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export type Collections = {
  accounts: Collection<BudgetAccount>;
  ledgerEntries: Collection<LedgerEntry>;
  collections: Collection<GiftCollection>;
  recipients: Collection<Recipient>;
  campaigns: Collection<Campaign>;
  gifts: Collection<Gift>;
  integrations: Collection<Integration>;
  processedEvents: Collection<ProcessedEvent>;
  invitations: Collection<Invitation>;
};

/** Typed handles for every collection. Modules use only their own. */
export function collections(db: Db): Collections {
  return {
    accounts: db.collection<BudgetAccount>(COLLECTIONS.accounts),
    ledgerEntries: db.collection<LedgerEntry>(COLLECTIONS.ledgerEntries),
    collections: db.collection<GiftCollection>(COLLECTIONS.collections),
    recipients: db.collection<Recipient>(COLLECTIONS.recipients),
    campaigns: db.collection<Campaign>(COLLECTIONS.campaigns),
    gifts: db.collection<Gift>(COLLECTIONS.gifts),
    integrations: db.collection<Integration>(COLLECTIONS.integrations),
    processedEvents: db.collection<ProcessedEvent>(COLLECTIONS.processedEvents),
    invitations: db.collection<Invitation>(COLLECTIONS.invitations),
  };
}
