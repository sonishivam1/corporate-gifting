import { findVariant } from "@gifting/domain";

import { getBalance, getCollections, getProducts, getRecipients, getWorkspace } from "@/lib/api";

import { SendFlow } from "./send-flow";

/** The send flow. Opened from Campaigns → New campaign, a collection on Home, or a gift in Browse. */
export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const me = await getWorkspace();
  const [balance, collections, products, recipients] = await Promise.all([
    getBalance(me.team.key),
    getCollections(),
    getProducts(),
    getRecipients(),
  ]);

  const sku = one(raw.sku);
  const collection = one(raw.collection);
  return (
    <SendFlow
      // A new flow (and a new idempotency key) whenever the team or the starting gift changes.
      key={`${me.team.key}:${sku ?? ""}:${collection ?? ""}`}
      me={me}
      balance={balance}
      collections={collections}
      products={products}
      recipients={recipients}
      start={{
        sku: sku && findVariant(products, sku) ? sku : undefined,
        collectionId: collections.some((c) => c.id === collection) ? collection : undefined,
      }}
    />
  );
}
