/**
 * Writes the demo company's platform data to a database: team budget
 * accounts, opening top-ups, platform collections and the recipient
 * directory. Idempotent: a second run writes nothing new (top-ups use
 * ledgerKeys, everything else upserts). Used by `pnpm seed:demo` and by the
 * API's integration tests on their throwaway databases.
 *
 * Products, vendors, companies and teams are not written here. They belong
 * to commercetools (ADR 0001); the API reads them from ./index until then.
 */
import { randomUUID } from "node:crypto";

import { ensureIndexes, getCollections } from "@gifting/db";
import { topUpEntry } from "@gifting/ledger";
import type { Db } from "mongodb";

import { demoCollections, demoCompany, demoDirectory, demoTopUps } from "./index";

const isDuplicate = (err: unknown) => (err as { code?: unknown }).code === 11000;

export async function writeDemoData(db: Db, now = new Date()) {
  await ensureIndexes(db);
  const c = getCollections(db);
  const counts = { accounts: 0, topUps: 0, collections: 0, recipients: 0, skipped: 0 };

  for (const team of demoCompany.teams) {
    const res = await c.accounts.updateOne(
      { teamKey: team.key },
      {
        $setOnInsert: {
          _id: `acct-${team.key}`,
          companyKey: demoCompany.key,
          teamKey: team.key,
          currency: "USD",
          billingMethod: "prepaid",
          creditLimitCents: 0,
          stripeCustomerId: null,
          holdsUpdatedAt: null,
          createdAt: now,
        },
      },
      { upsert: true },
    );
    counts.accounts += res.upsertedCount;
  }

  for (const topUp of demoTopUps) {
    const account = await c.accounts.findOne({ teamKey: topUp.teamKey }, { projection: { _id: 1 } });
    if (!account) throw new Error(`No account for ${topUp.teamKey}.`);
    const entry = topUpEntry({
      accountId: account._id,
      currency: "USD",
      now,
      createdBy: "seed:demo",
      amountCents: topUp.amountCents,
      paymentRef: topUp.paymentRef,
    });
    try {
      await c.ledgerEntries.insertOne({ _id: randomUUID(), ...entry });
      counts.topUps += 1;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      counts.skipped += 1;
    }
  }

  for (const collection of demoCollections) {
    const res = await c.collections.updateOne(
      { _id: collection.id },
      {
        $set: {
          owner: "platform",
          name: collection.name,
          rules: collection.rules,
          countries: ["US"],
          budgetBandCents: collection.budgetBandCents,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    counts.collections += res.upsertedCount;
  }

  for (const person of demoDirectory) {
    try {
      const res = await c.recipients.updateOne(
        { _id: person.id },
        {
          $setOnInsert: {
            companyKey: demoCompany.key,
            teamKey: null,
            name: person.name,
            email: person.email,
            emailLower: person.email.toLowerCase(),
            phone: null,
            slackId: null,
            teamsId: null,
            birthdayMonthDay: null,
            startDate: null,
            startMonthDay: null,
            source: "csv",
            externalId: null,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
      counts.recipients += res.upsertedCount;
    } catch (err) {
      // Someone already added this address by hand; keep theirs.
      if (!isDuplicate(err)) throw err;
      counts.skipped += 1;
    }
  }

  return counts;
}
