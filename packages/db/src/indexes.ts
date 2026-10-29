import type { IndexDescription } from "mongodb";

import type { CollectionName } from "./collections";

/**
 * Every index, by collection. The unique ones are the exactly-once guards
 * (see docs/architecture/data-model.md#exactly-once-rules); a test checks
 * they stay unique.
 */
export const INDEXES: Record<CollectionName, IndexDescription[]> = {
  accounts: [{ key: { teamKey: 1 }, name: "teamKey_unique", unique: true }],
  ledgerEntries: [
    { key: { idempotencyKey: 1 }, name: "idempotencyKey_unique", unique: true },
    { key: { accountId: 1, createdAt: 1 }, name: "accountId_createdAt" },
    { key: { giftId: 1 }, name: "giftId" },
  ],
  collections: [{ key: { owner: 1, name: 1 }, name: "owner_name" }],
  recipients: [
    {
      key: { companyKey: 1, emailLower: 1 },
      name: "companyKey_emailLower_unique",
      unique: true,
      partialFilterExpression: { emailLower: { $type: "string" } },
    },
    { key: { companyKey: 1, birthdayMonthDay: 1 }, name: "companyKey_birthdayMonthDay" },
    { key: { companyKey: 1, startMonthDay: 1 }, name: "companyKey_startMonthDay" },
  ],
  campaigns: [
    { key: { teamKey: 1, status: 1 }, name: "teamKey_status" },
    // The Home overview: a team's gifts by when they went out.
    { key: { teamKey: 1, "statusAt.sent": 1 }, name: "teamKey_statusAt.sent" },
    { key: { type: 1, status: 1 }, name: "type_status" },
  ],
  gifts: [
    { key: { tokenHash: 1 }, name: "tokenHash_unique", unique: true },
    { key: { codeHash: 1 }, name: "codeHash_unique", unique: true },
    { key: { campaignId: 1, recipientId: 1, occurrence: 1 }, name: "campaign_recipient_occurrence_unique", unique: true },
    { key: { status: 1, expiresAt: 1 }, name: "status_expiresAt" },
    { key: { teamKey: 1, status: 1 }, name: "teamKey_status" },
  ],
  integrations: [{ key: { companyKey: 1, type: 1 }, name: "companyKey_type_unique", unique: true }],
  processedEvents: [{ key: { receivedAt: 1 }, name: "receivedAt_ttl", expireAfterSeconds: 30 * 24 * 60 * 60 }],
};
