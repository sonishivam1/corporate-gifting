import { describe, expect, it } from "vitest";

import { CT_LOCALE as LOCALE } from "@gifting/ct";

import { channelDrafts, cookieTinProductTypeDraft, productTypeDraft, productTypeDrafts, storeDraft, typeDrafts } from "./drafts";

describe("commercetools drafts", () => {
  it("create the gifting store", () => {
    expect(storeDraft.key).toBe("gifting");
  });

  it("write text in the project's locale (en-US), not bare en", () => {
    expect(storeDraft.languages).toEqual([LOCALE]);
    for (const draft of [storeDraft, ...typeDrafts, ...channelDrafts]) expect(Object.keys(draft.name ?? {}), draft.key).toEqual([LOCALE]);
  });

  it("make every vendor a supply channel with the vendor type", () => {
    expect(channelDrafts.length).toBeGreaterThanOrEqual(3);
    for (const channel of channelDrafts) {
      expect(channel.roles, channel.key).toEqual(["InventorySupply"]);
      expect(channel.custom?.type.key, channel.key).toBe("vendor");
    }
  });

  it("give gift orders the fields the platform routes by", () => {
    const giftOrder = typeDrafts.find((t) => t.key === "gift-order");
    expect(giftOrder?.resourceTypeIds).toEqual(["order"]);
    expect(giftOrder?.fieldDefinitions?.map((f) => f.name)).toEqual(["giftId", "campaignId", "companyKey", "teamKey", "vendorKey"]);
  });

  it("only set vendor fields that the vendor type defines", () => {
    const vendorFields = new Set(typeDrafts.find((t) => t.key === "vendor")?.fieldDefinitions?.map((f) => f.name));
    for (const channel of channelDrafts) {
      for (const field of Object.keys(channel.custom?.fields ?? {})) expect(vendorFields.has(field), field).toBe(true);
    }
  });

  it("tag every product with brand, vendorKey and tags", () => {
    expect(productTypeDraft.attributes?.map((a) => a.name)).toEqual(["brand", "vendorKey", "tags"]);
    for (const draft of productTypeDrafts) {
      expect(draft.attributes?.slice(0, 3), draft.key).toEqual(productTypeDraft.attributes);
    }
  });

  it("give an attribute name the same type in every product type", () => {
    const types = new Map<string, string>();
    for (const draft of productTypeDrafts) {
      for (const a of draft.attributes ?? []) {
        const type = JSON.stringify(a.type);
        expect(types.get(a.name) ?? type, `${draft.key}.${a.name}`).toBe(type);
        types.set(a.name, type);
      }
    }
    expect(cookieTinProductTypeDraft.attributes?.map((a) => a.name)).toContain("cookieCount");
  });
});
