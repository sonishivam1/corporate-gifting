import { randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import { nameFromEmail, type Recipient, type RecipientView, type UploadRow, uploadRowName } from "@gifting/domain";

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
  async function ensure(
    companyKey: string,
    email: string,
    fields: { name: string; source: Recipient["source"] },
  ): Promise<{ recipient: Recipient; added: boolean }> {
    const now = deps.now();
    const filter = { companyKey, emailLower: email };
    try {
      const res = await c().recipients.findOneAndUpdate(
        filter,
        {
          $setOnInsert: {
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
          },
        },
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
    async search(companyKey: string, q?: string): Promise<RecipientView[]> {
      const all = await c().recipients.find({ companyKey }).sort({ name: 1 }).limit(500).toArray();
      const needle = q?.trim().toLowerCase();
      const hits = needle ? all.filter((r) => `${r.name} ${r.email ?? ""}`.toLowerCase().includes(needle)) : all;
      return hits.map(toView);
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
     * by the route's schema first, so this writes all of them.
     */
    async importRows(companyKey: string, rows: readonly UploadRow[]): Promise<{ recipients: RecipientView[]; added: number; existing: number }> {
      const seen = new Set<string>();
      const recipients: RecipientView[] = [];
      let added = 0;
      for (const row of rows) {
        if (seen.has(row.email)) continue;
        seen.add(row.email);
        const result = await ensure(companyKey, row.email, { name: uploadRowName(row), source: "csv" });
        if (result.added) added += 1;
        recipients.push(toView(result.recipient));
      }
      return { recipients, added, existing: recipients.length - added };
    },
  };
}
