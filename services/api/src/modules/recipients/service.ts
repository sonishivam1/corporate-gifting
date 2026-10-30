import { randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import { DIRECTORY_PAGE, nameFromEmail, type Recipient, type RecipientView, type UploadRow, uploadRowName } from "@gifting/domain";
import { MongoBulkWriteError } from "mongodb";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";

export type RecipientsService = ReturnType<typeof createRecipientsService>;

const toView = (r: Recipient): RecipientView => ({ id: r._id, name: r.name, email: r.email });

const isDuplicate = (err: unknown) => (err as { code?: unknown }).code === 11000;

/**
 * The company's recipient directory. M5 adds HR sync and encryption of
 * personal fields; for now it holds the demo directory, anyone a sender adds
 * by email, and lists uploaded in the send flow (plan: recipient-upload.md).
 */
export function createRecipientsService(deps: AppDeps) {
  const c = () => getCollections(deps.db);

  /**
   * The person with this email in the company's directory, added if new.
   * One email is one person (unique {companyKey, emailLower}); an existing
   * person keeps their record, name included.
   */
  function newRecipient(companyKey: string, email: string, fields: { name: string; source: Recipient["source"] }, now: Date) {
    return {
      _id: randomUUID(),
      companyKey,
      teamKey: null,
      name: fields.name,
      email,
      phone: null,
      slackId: null,
      teamsId: null,
      birthdayMonthDay: null,
      startDate: null,
      startMonthDay: null,
      source: fields.source,
      externalId: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function ensure(
    companyKey: string,
    email: string,
    fields: { name: string; source: Recipient["source"] },
  ): Promise<{ recipient: Recipient; added: boolean }> {
    const filter = { companyKey, emailLower: email };
    try {
      const res = await c().recipients.findOneAndUpdate(
        filter,
        { $setOnInsert: newRecipient(companyKey, email, fields, deps.now()) },
        { upsert: true, returnDocument: "after", includeResultMetadata: true },
      );
      return { recipient: res.value!, added: !res.lastErrorObject?.updatedExisting };
    } catch (err) {
      // Two requests added the same email at once: the unique index let one in; use it.
      if (!isDuplicate(err)) throw err;
      const existing = await c().recipients.findOne(filter);
      if (!existing) throw err;
      return { recipient: existing, added: false };
    }
  }

  async function byIds(companyKey: string, ids: readonly string[]): Promise<Map<string, RecipientView>> {
    const found = await c().recipients.find({ companyKey, _id: { $in: [...ids] } }).toArray();
    return new Map(found.map((r) => [r._id, toView(r)]));
  }

  return {
    /**
     * Up to `DIRECTORY_PAGE` people by name. The search runs in the database,
     * so it finds anyone in a directory of any size, not only the first page.
     */
    async search(companyKey: string, q?: string): Promise<{ recipients: RecipientView[]; more: boolean }> {
      const needle = q?.trim().toLowerCase();
      const pattern = needle ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
      const filter = pattern ? { companyKey, $or: [{ name: pattern }, { emailLower: pattern }] } : { companyKey };
      const found = await c().recipients.find(filter).sort({ name: 1 }).limit(DIRECTORY_PAGE + 1).toArray();
      return { recipients: found.slice(0, DIRECTORY_PAGE).map(toView), more: found.length > DIRECTORY_PAGE };
    },

    byIds,

    /**
     * The distinct people a send goes to: the directory ids picked, plus
     * addresses typed in (an address already in the directory counts once).
     * With `create`, new addresses are added to the directory.
     */
    async resolve(
      companyKey: string,
      input: { recipientIds: readonly string[]; newEmails: readonly string[] },
      options: { create: boolean },
    ): Promise<RecipientView[]> {
      const ids = [...new Set(input.recipientIds)];
      const picked = await byIds(companyKey, ids);
      if (picked.size !== ids.length) throw new ApiError(422, "unknown_recipient", "Someone in the list isn't in your directory.");

      const people = new Map(picked);
      for (const email of new Set(input.newEmails.map((e) => e.toLowerCase()))) {
        const existing = await c().recipients.findOne({ companyKey, emailLower: email });
        if (existing) {
          people.set(existing._id, toView(existing));
        } else if (options.create) {
          const { recipient } = await ensure(companyKey, email, { name: nameFromEmail(email), source: "manual" });
          people.set(recipient._id, toView(recipient));
        } else {
          people.set(`new:${email}`, { id: `new:${email}`, name: nameFromEmail(email), email });
        }
      }
      return [...people.values()];
    },

    /**
     * A list uploaded in the send flow: everyone joins the company's
     * directory (matched by email), returned in file order. Rows are checked
     * by the route's schema first, so this writes all of them: one bulk
     * write and one read, so 500 rows take one round trip, not 500. Each
     * write is an add-if-missing, so a retry finishes a list a lost
     * connection left half saved, and adds nobody twice.
     */
    async importRows(companyKey: string, rows: readonly UploadRow[]): Promise<{ recipients: RecipientView[]; added: number; existing: number }> {
      const unique = [...new Map(rows.map((r) => [r.email, r])).values()];
      const now = deps.now();
      let added: number;
      try {
        const res = await c().recipients.bulkWrite(
          unique.map((row) => ({
            updateOne: {
              filter: { companyKey, emailLower: row.email },
              update: { $setOnInsert: newRecipient(companyKey, row.email, { name: uploadRowName(row), source: "csv" }, now) },
              upsert: true,
            },
          })),
          { ordered: false },
        );
        added = res.upsertedCount;
      } catch (err) {
        // Another upload added some of the same emails at once: the unique index let theirs in; use them.
        if (!(err instanceof MongoBulkWriteError) || !err.writeErrors || ![err.writeErrors].flat().every(isDuplicate)) throw err;
        added = err.result.upsertedCount;
      }
      const found = await c()
        .recipients.find({ companyKey, emailLower: { $in: unique.map((r) => r.email) } })
        .toArray();
      const byEmail = new Map(found.map((r) => [r.emailLower, r]));
      const recipients = unique.flatMap((r) => {
        const recipient = byEmail.get(r.email);
        return recipient ? [toView(recipient)] : [];
      });
      return { recipients, added, existing: recipients.length - added };
    },
  };
}
