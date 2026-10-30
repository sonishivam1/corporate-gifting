import { describe, expect, it } from "vitest";

import {
  addFunnels,
  campaignDisplayStatus,
  campaignFunnel,
  defaultCampaignName,
  deliveryChannel,
  estimateSend,
  hasShareableLinks,
} from "./campaign-rules";
import { categoryFromTags, defaultVariant, findVariant, occasionsFromTags, variantName, withVariants } from "./catalog";
import { collectionItems, matchesRules } from "./collections";
import type { ProductView } from "./views";

describe("estimateSend", () => {
  const base = { gifts: 10, holdCents: 5000, availableCents: 100_000, approvalThresholdCents: 100_000 };

  it("holds one budget per gift", () => {
    expect(estimateSend(base)).toMatchObject({ totalCents: 50_000, afterCents: 50_000, needsApproval: false, short: false });
  });

  it("needs approval only above the threshold, not at it", () => {
    expect(estimateSend({ ...base, gifts: 20 }).needsApproval).toBe(false);
    expect(estimateSend({ ...base, gifts: 20, holdCents: 5001 }).needsApproval).toBe(true);
  });

  it("is short by a single cent", () => {
    const estimate = estimateSend({ ...base, gifts: 1, holdCents: 5000, availableCents: 4999 });
    expect(estimate).toMatchObject({ short: true, shortByCents: 1, afterCents: -1 });
  });

  it("is not short when the send uses the whole balance", () => {
    expect(estimateSend({ ...base, gifts: 20 }).short).toBe(false);
  });

  it("refuses a fractional number of gifts", () => {
    expect(() => estimateSend({ ...base, gifts: 1.5 })).toThrow(RangeError);
  });
});

describe("delivery", () => {
  it("uses the first direct channel", () => {
    expect(deliveryChannel(["link", "slack", "email"])).toBe("slack");
  });

  it("falls back to a link or QR code", () => {
    expect(deliveryChannel(["qr", "link"])).toBe("qr");
    expect(hasShareableLinks(["email"])).toBe(false);
    expect(hasShareableLinks(["email", "qr"])).toBe(true);
  });

  it("refuses no channels", () => {
    expect(() => deliveryChannel([])).toThrow(RangeError);
  });
});

describe("campaignFunnel", () => {
  it("counts every gift that reached each stage", () => {
    expect(
      campaignFunnel(["sent", "opened", "redeemed", "shipped", "delivered", "expired", "cancelled", "pending_approval"]),
    ).toEqual({ total: 8, sent: 7, opened: 4, chose: 3, shipped: 2, delivered: 1, expired: 2 });
  });

  it("adds funnels stage by stage", () => {
    const one = campaignFunnel(["sent", "opened"]);
    expect(addFunnels([one, one])).toEqual({ total: 4, sent: 4, opened: 2, chose: 0, shipped: 0, delivered: 0, expired: 0 });
  });
});

describe("campaign display", () => {
  it("shows an approved campaign as scheduled", () => {
    expect(campaignDisplayStatus("approved")).toBe("scheduled");
    expect(campaignDisplayStatus("sending")).toBe("active");
    expect(campaignDisplayStatus("pending_approval")).toBe("pending_approval");
  });

  it("names an unnamed campaign after its occasion and date", () => {
    expect(defaultCampaignName("thanks", new Date("2026-10-28T12:00:00Z"))).toBe("Thank you · 28 Oct");
  });
});

describe("collections", () => {
  const none = { tags: [], brands: [], skus: [], pinnedSkus: [] };
  const items = [
    product({ sku: "A", brand: "North", tags: ["food"], priceCents: 2800 }),
    product({ sku: "B", brand: "Cedar", tags: ["home"], priceCents: 4800 }),
    product({ sku: "C", brand: "Cedar", tags: ["home"], priceCents: 3200, available: false }),
    product({ sku: "D", brand: "Trail", tags: ["outdoors"], priceCents: 7500 }),
  ];

  it("offers everything when there are no rules", () => {
    expect(matchesRules(none, items[0]!)).toBe(true);
  });

  it("matches on any tag, brand or SKU", () => {
    expect(matchesRules({ ...none, tags: ["home"] }, items[0]!)).toBe(false);
    expect(matchesRules({ ...none, brands: ["North"] }, items[0]!)).toBe(true);
    expect(matchesRules({ ...none, skus: ["A"] }, items[0]!)).toBe(true);
  });

  it("keeps only available items within the budget, pinned first", () => {
    expect(collectionItems(none, items, 5000).map((i) => i.sku)).toEqual(["A", "B"]);
    expect(collectionItems({ ...none, pinnedSkus: ["B"], tags: ["food"] }, items, 5000).map((i) => i.sku)).toEqual(["B", "A"]);
  });

  it("narrows a product to the variants that fit, and prices it from the cheapest", () => {
    const tin = product({ sku: "T-12", brand: "North", tags: ["food"], priceCents: 2800 }, [
      { sku: "T-24", label: "24", priceCents: 4500, available: true, imageUrl: null },
      { sku: "T-48", label: "48", priceCents: 7900, available: true, imageUrl: null },
    ]);
    const [fit] = collectionItems(none, [tin], 5000);
    expect(fit?.variants.map((v) => v.sku)).toEqual(["T-12", "T-24"]);
    expect(fit).toMatchObject({ sku: "T-12", priceCents: 2800 });
    // A SKU rule picks out one variant, not the whole product.
    expect(collectionItems({ ...none, skus: ["T-24"] }, [tin], 5000)[0]?.variants.map((v) => v.sku)).toEqual(["T-24"]);
  });
});

describe("tags", () => {
  it("picks the most specific category", () => {
    expect(categoryFromTags(["food", "drink", "wellness"])).toBe("drink");
    expect(categoryFromTags(["outdoors", "home"])).toBe("outdoors");
    expect(categoryFromTags(["sweet"])).toBe("food");
  });

  it("reads occasions from storefront tags, in the app's order", () => {
    expect(occasionsFromTags(["holiday-gifts-under-50", "thank-you", "under-50", "graduation"])).toEqual(["holiday", "thanks", "appreciation"]);
    expect(occasionsFromTags(["small"])).toEqual([]);
  });
});

describe("variants", () => {
  const tin = product({ sku: "T-12", brand: "North", tags: ["food"], priceCents: 2800, available: false }, [
    { sku: "T-24", label: "24 pieces", priceCents: 4500, available: true, imageUrl: "https://img.example/24.jpg" },
    { sku: "T-36", label: "36 pieces", priceCents: 6200, available: true, imageUrl: null },
  ]);

  it("defaults to the cheapest available variant", () => {
    expect(defaultVariant(tin.variants)?.sku).toBe("T-24");
    expect(defaultVariant([{ priceCents: 10, available: false }])?.priceCents).toBe(10);
  });

  it("works the default out again when variants are dropped", () => {
    expect(withVariants(tin)).toMatchObject({ sku: "T-24", priceCents: 4500, available: true, imageUrl: "https://img.example/24.jpg" });
    expect(withVariants(tin, (v) => v.sku === "T-12")).toMatchObject({ sku: "T-12", available: false });
    expect(withVariants(tin, () => false)).toBeNull();
  });

  it("finds a variant by SKU and names it", () => {
    const found = findVariant([tin], "T-36");
    expect(found?.product.key).toBe("T-12");
    expect(variantName(found!.product, found!.variant)).toBe("Tin T-12 (36 pieces)");
    expect(variantName({ name: "Mug" }, { label: "" })).toBe("Mug");
    expect(findVariant([tin], "nope")).toBeNull();
  });
});

function product(
  p: { sku: string; brand: string; tags: string[]; priceCents: number; available?: boolean },
  more: ProductView["variants"] = [],
): ProductView {
  const first = { sku: p.sku, label: more.length ? "12 pieces" : "", priceCents: p.priceCents, available: p.available ?? true, imageUrl: null };
  return {
    key: p.sku,
    sku: p.sku,
    name: `Tin ${p.sku}`,
    brand: p.brand,
    description: "",
    category: "food",
    occasions: [],
    tags: p.tags,
    vendorKey: "vendor-x",
    vendorName: "Vendor X",
    slaDays: 3,
    priceCents: p.priceCents,
    currency: "USD",
    available: first.available,
    imageUrl: null,
    variants: [first, ...more],
  };
}
