import type { ProductView } from "@gifting/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memoryCatalog, seedProducts } from "../../src/modules/catalog/source";
import { createAndSubmit, type Harness, MAYA, send, startHarness } from "./harness";

// A fictional tin in three sizes; the biggest is out of stock.
const tin: ProductView = {
  key: "nb-tin-sizes",
  sku: "NB-SIZE-12",
  name: "Butter Cookie Tin",
  brand: "North Bakery",
  description: "Butter cookies in three sizes.",
  category: "food",
  occasions: ["thanks"],
  tags: ["food", "sweet"],
  vendorKey: "vendor-north-bakery",
  vendorName: "North Bakery Co.",
  slaDays: 3,
  priceCents: 2800,
  currency: "USD",
  available: true,
  imageUrl: null,
  variants: [
    { sku: "NB-SIZE-12", label: "12 pieces", priceCents: 2800, available: true, imageUrl: null },
    { sku: "NB-SIZE-24", label: "24 pieces", priceCents: 4500, available: true, imageUrl: null },
    { sku: "NB-SIZE-48", label: "48 pieces", priceCents: 4900, available: false, imageUrl: null },
  ],
};

let h: Harness;

beforeAll(async () => {
  h = await startHarness({ catalog: memoryCatalog([...seedProducts, tin]) });
});

afterAll(async () => {
  await h?.close();
});

const listed = async (url: string) => {
  const res = await h.app.inject({ method: "GET", url, headers: MAYA });
  expect(res.statusCode).toBe(200);
  return res.json() as { products?: ProductView[]; items?: ProductView[] };
};

const skusOf = (products: ProductView[] | undefined, key: string) => products?.find((p) => p.key === key)?.variants.map((v) => v.sku);

describe("variants", () => {
  it("lists only the variants in stock and within the budget, priced from the cheapest", async () => {
    expect(skusOf((await listed("/v1/catalog/products")).products, tin.key)).toEqual(["NB-SIZE-12", "NB-SIZE-24"]);
    const under30 = (await listed("/v1/catalog/products?budget=3000")).products;
    expect(skusOf(under30, tin.key)).toEqual(["NB-SIZE-12"]);
    expect(under30?.find((p) => p.key === tin.key)).toMatchObject({ sku: "NB-SIZE-12", priceCents: 2800 });
  });

  it("offers a collection only the variants that fit", async () => {
    const { items } = await listed("/v1/collections/col-treats/items?budget=3000");
    expect(skusOf(items, tin.key)).toEqual(["NB-SIZE-12"]);
  });

  it("holds the chosen variant's price and names the variant", async () => {
    const { submitted, id } = await createAndSubmit(h.app, MAYA, send({ gift: { kind: "single", sku: "NB-SIZE-24" } }));
    expect(submitted?.statusCode).toBe(200);
    expect(submitted?.json().totalCents).toBe(3 * 4500);
    const detail = await h.app.inject({ method: "GET", url: `/v1/campaigns/${id}`, headers: MAYA });
    expect(detail.json().gift).toMatchObject({ kind: "single", sku: "NB-SIZE-24", label: "Butter Cookie Tin (24 pieces)" });
  });

  it("refuses a variant that is out of stock, and saves nothing", async () => {
    const before = await h.c.campaigns.countDocuments();
    const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: send({ gift: { kind: "single", sku: "NB-SIZE-48" } }) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("item_not_eligible");
    expect(await h.c.campaigns.countDocuments()).toBe(before);
  });
});
