import { describe, expect, it } from "vitest";

import { CT_LOCALE as LOCALE } from "@gifting/ct";
import { demoCustomers } from "@gifting/seed/customers";
import { TAG_CATEGORIES, TAX_CATEGORY_KEY } from "@gifting/seed/import";

import {
  associateRoleDrafts,
  categoryDrafts,
  channelDrafts,
  cookieTinProductTypeDraft,
  DEMO_STATE_TAX_RATES,
  marketplaceAttributes,
  productTypeDraft,
  productTypeDrafts,
  shippingMethodDraft,
  storeDraft,
  taxCategoryDraft,
  typeDrafts,
  zoneDraft,
} from "./drafts";

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

  it("give every product type the marketplace and gifting attributes", () => {
    expect(productTypeDraft.attributes?.map((a) => a.name)).toEqual(["brand", "vendorKey", "tags", "perishable", "shipsTo", "leadTimeDays", "minimumAge"]);
    for (const draft of productTypeDrafts) {
      expect(draft.attributes?.slice(0, marketplaceAttributes.length), draft.key).toEqual(marketplaceAttributes);
    }
  });

  it("only require attributes every existing product already has", () => {
    const required = marketplaceAttributes.filter((a) => a.isRequired).map((a) => a.name);
    expect(required).toEqual(["brand", "vendorKey"]);
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

  it("give team settings the approvers and payments the ledger capture key", () => {
    expect(typeDrafts.find((t) => t.key === "team-settings")?.fieldDefinitions?.map((f) => f.name)).toContain("approverIds");
    const payment = typeDrafts.find((t) => t.key === "company-balance-payment");
    expect(payment?.resourceTypeIds).toEqual(["payment"]);
    expect(payment?.fieldDefinitions?.find((f) => f.name === "captureKey")?.required).toBe(true);
  });

  it("tax every seeded state, with a US fallback, as rates not percentages", () => {
    const states = taxCategoryDraft.rates?.filter((r) => r.state).map((r) => r.state);
    expect(states?.sort()).toEqual(Object.keys(DEMO_STATE_TAX_RATES).sort());
    expect(taxCategoryDraft.rates?.some((r) => r.country === "US" && !r.state)).toBe(true);
    for (const rate of taxCategoryDraft.rates ?? []) {
      expect(rate.amount, rate.name).toBeGreaterThan(0);
      expect(rate.amount, rate.name).toBeLessThan(0.15);
      expect(rate.includedInPrice, rate.name).toBe(false);
    }
  });

  it("ship within the US zone, taxed by the standard category, in cents", () => {
    expect(zoneDraft.locations).toEqual([{ country: "US" }]);
    expect(shippingMethodDraft.taxCategory).toEqual({ typeId: "tax-category", key: taxCategoryDraft.key });
    const rate = shippingMethodDraft.zoneRates[0]?.shippingRates[0]?.price;
    expect(rate?.currencyCode).toBe("USD");
    expect(Number.isInteger(rate?.centAmount)).toBe(true);
  });

  it("define the four member roles and put gift categories under one root", () => {
    expect(associateRoleDrafts.map((r) => r.key)).toEqual(["owner", "admin", "approver", "sender"]);
    const keys = new Set(categoryDrafts.map((c) => c.key));
    for (const category of categoryDrafts) if (category.parent) expect(keys.has(category.parent.key), category.key).toBe(true);
  });

  it("define every gift category and the tax category the seed refers to", () => {
    const keys = new Set(categoryDrafts.map((c) => c.key));
    for (const key of Object.values(TAG_CATEGORIES)) expect(keys.has(key), key).toBe(true);
    expect(taxCategoryDraft.key).toBe(TAX_CATEGORY_KEY);
  });

  it("have a demo tax rate for the state of every demo customer", () => {
    for (const customer of demoCustomers()) expect(DEMO_STATE_TAX_RATES[customer.address.state], customer.key).toBeDefined();
  });

  it("give members a profile with their sign-in identities and status, and companies their email domains", () => {
    const profile = typeDrafts.find((t) => t.key === "member-profile");
    expect(profile?.resourceTypeIds).toEqual(["customer"]);
    expect(profile?.fieldDefinitions?.map((f) => f.name)).toEqual(["identityIds", "status", "invitedAt", "invitedBy"]);
    expect(typeDrafts.find((t) => t.key === "company-settings")?.fieldDefinitions?.map((f) => f.name)).toContain("emailDomains");
  });
});
