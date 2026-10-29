import { randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import type { Recipient, RecipientView } from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";

export type RecipientsService = ReturnType<typeof createRecipientsService>;

const toView = (r: Recipient): RecipientView => ({ id: r._id, name: r.name, email: r.email });

/** "jordan.rivera@…" → "Jordan Rivera": a readable name until the directory has the real one. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The company's recipient directory. M5 adds CSV import, HR sync and
 * encryption of personal fields; for now it holds the demo directory and
 * anyone a sender adds by email.
 */
export function createRecipientsService(deps: AppDeps) {
  const c = () => getCollections(deps.db);

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
      const now = deps.now();
      for (const email of new Set(input.newEmails.map((e) => e.toLowerCase()))) {
        const existing = await c().recipients.findOne({ companyKey, emailLower: email });
        if (existing) {
          people.set(existing._id, toView(existing));
        } else if (options.create) {
          const created = await c().recipients.findOneAndUpdate(
            { companyKey, emailLower: email },
            {
              $setOnInsert: {
                _id: randomUUID(),
                companyKey,
                teamKey: null,
                name: nameFromEmail(email),
                email,
                phone: null,
                slackId: null,
                teamsId: null,
                birthdayMonthDay: null,
                startDate: null,
                startMonthDay: null,
                source: "manual",
                externalId: null,
                createdAt: now,
                updatedAt: now,
              },
            },
            { upsert: true, returnDocument: "after" },
          );
          if (created) people.set(created._id, toView(created));
        } else {
          people.set(`new:${email}`, { id: `new:${email}`, name: nameFromEmail(email), email });
        }
      }
      return [...people.values()];
    },
  };
}
