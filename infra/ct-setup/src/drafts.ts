/**
 * The commercetools resources the platform needs, as drafts
 * (docs/architecture/commercetools.md). `pnpm ct:plan` prints them;
 * `pnpm ct:apply` creates the missing ones in the project from `.env`, and
 * adds fields and attributes that existing types are missing. The
 * subscription (to a queue) is added in M4, when the queue exists.
 */
import type {
  AssociateRoleDraft,
  AttributeDefinitionDraft,
  CategoryDraft,
  ChannelDraft,
  FieldDefinition,
  ProductTypeDraft,
  ShippingMethodDraft,
  StoreDraft,
  TaxCategoryDraft,
  TypeDraft,
  ZoneDraft,
} from "@commercetools/platform-sdk";
import { CT_LOCALE } from "@gifting/ct";
import { MEMBER_STATUSES } from "@gifting/domain";
import { vendors, type SeedVendor } from "@gifting/seed";

const en = (text: string) => ({ [CT_LOCALE]: text });

const stringField = (name: string, label: string, required = false): FieldDefinition => ({
  name,
  label: en(label),
  required,
  type: { name: "String" },
  inputHint: "SingleLine",
});

const numberField = (name: string, label: string): FieldDefinition => ({
  name,
  label: en(label),
  required: false,
  type: { name: "Number" },
});

const booleanField = (name: string, label: string): FieldDefinition => ({
  name,
  label: en(label),
  required: false,
  type: { name: "Boolean" },
});

const stringSetField = (name: string, label: string): FieldDefinition => ({
  name,
  label: en(label),
  required: false,
  type: { name: "Set", elementType: { name: "String" } },
});

export const storeDraft: StoreDraft = {
  key: "gifting",
  name: en("Gifting Marketplace"),
  languages: [CT_LOCALE],
  countries: [{ code: "US" }],
};

export const typeDrafts: TypeDraft[] = [
  {
    key: "vendor",
    name: en("Vendor"),
    resourceTypeIds: ["channel"],
    fieldDefinitions: [
      stringField("contactEmail", "Contact email", true),
      stringField("fulfilmentMethod", "Fulfilment method (portal, email, api)", true),
      numberField("slaDays", "SLA in days"),
    ],
  },
  {
    key: "gift-order",
    name: en("Gift order"),
    resourceTypeIds: ["order"],
    fieldDefinitions: [
      stringField("giftId", "Gift id", true),
      stringField("campaignId", "Campaign id", true),
      stringField("companyKey", "Company key", true),
      stringField("teamKey", "Team key", true),
      stringField("vendorKey", "Vendor key", true),
    ],
  },
  {
    key: "company-settings",
    name: en("Company settings"),
    resourceTypeIds: ["business-unit"],
    fieldDefinitions: [
      stringField("brandColor", "Brand colour"),
      stringField("logoUrl", "Logo URL"),
      numberField("retentionDays", "Recipient data retention (days)"),
      booleanField("allowOverage", "Charge overage to the team"),
      stringSetField("emailDomains", "Email domains members may use"),
    ],
  },
  {
    key: "team-settings",
    name: en("Team settings"),
    resourceTypeIds: ["business-unit"],
    fieldDefinitions: [numberField("approvalThresholdCents", "Approval threshold (cents)"), stringSetField("approverIds", "Approvers")],
  },
  {
    // A company member's access status (B2B demo data; sign-in itself is
    // commercetools customer accounts, ADR 0015).
    key: "member-profile",
    name: en("Member profile"),
    resourceTypeIds: ["customer"],
    fieldDefinitions: [
      {
        name: "status",
        label: en("Access status"),
        required: true,
        type: { name: "Enum", values: MEMBER_STATUSES.map((key) => ({ key, label: key })) },
      },
      { name: "invitedAt", label: en("Invited at"), required: false, type: { name: "DateTime" } },
      stringField("invitedBy", "Invited by (customer key)"),
    ],
  },
  {
    // ADR 0005: the Payment that records a redemption paid from the company balance.
    key: "company-balance-payment",
    name: en("Company balance payment"),
    resourceTypeIds: ["payment"],
    fieldDefinitions: [
      stringField("captureKey", "Ledger capture key", true),
      stringField("giftId", "Gift id", true),
      stringField("companyKey", "Company key"),
      stringField("teamKey", "Team key"),
    ],
  },
];

const attribute = (name: string, label: string, type: AttributeDefinitionDraft["type"], isRequired = false): AttributeDefinitionDraft => ({
  name,
  label: en(label),
  isRequired,
  isSearchable: true,
  type,
  attributeConstraint: "None",
  inputHint: "SingleLine",
});

/**
 * Every product type carries these, so collections select across all of
 * them. An attribute name must have the same type in every product type.
 * The gifting attributes are optional, so they can be added to product types
 * that already have products.
 */
export const marketplaceAttributes: AttributeDefinitionDraft[] = [
  attribute("brand", "Brand", { name: "text" }, true),
  attribute("vendorKey", "Vendor key", { name: "text" }, true),
  attribute("tags", "Tags", { name: "set", elementType: { name: "text" } }),
  attribute("perishable", "Perishable (food that must ship fast)", { name: "boolean" }),
  attribute("shipsTo", "Ships to (country codes)", { name: "set", elementType: { name: "text" } }),
  attribute("leadTimeDays", "Days from order to dispatch", { name: "number" }),
  attribute("minimumAge", "Minimum recipient age (for example 21 for alcohol)", { name: "number" }),
];

export const productTypeDraft: ProductTypeDraft = {
  key: "gift-item",
  name: "Gift item",
  description: "A product a recipient can choose in a collection",
  attributes: marketplaceAttributes,
};

/** Cookie and treat tins: the marketplace attributes plus what describes a tin. */
export const cookieTinProductTypeDraft: ProductTypeDraft = {
  key: "cookie-tin",
  name: "Cookie tin",
  description: "A tin of cookies or treats, in a size, flavour assortment and tin colour",
  attributes: [
    ...marketplaceAttributes,
    attribute("cookieFlavor", "Flavour or assortment", { name: "text" }),
    attribute("cookieCount", "Number of pieces", { name: "number" }),
    attribute("tinColor", "Tin colour", { name: "text" }),
    attribute("itemType", "Vendor item type", { name: "text" }),
    attribute("corporateTin", "Corporate tin", { name: "boolean" }),
  ],
};

export const productTypeDrafts: ProductTypeDraft[] = [productTypeDraft, cookieTinProductTypeDraft];

/** A vendor's supply channel. Takes any vendor with these fields, seeded or imported. */
export function vendorChannelDraft(vendor: Pick<SeedVendor, "key" | "name" | "contactEmail" | "fulfilmentMethod" | "slaDays">): ChannelDraft {
  return {
    key: vendor.key,
    name: en(vendor.name),
    roles: ["InventorySupply"],
    custom: {
      type: { typeId: "type", key: "vendor" },
      fields: {
        contactEmail: vendor.contactEmail,
        fulfilmentMethod: vendor.fulfilmentMethod,
        slaDays: vendor.slaDays,
      },
    },
  };
}

export const channelDrafts: ChannelDraft[] = vendors.map(vendorChannelDraft);

/**
 * Platform tax for the POC: each seeded state's base sales-tax rate, and a
 * US-wide rate for any other state. These are demo rates, not tax advice:
 * local and product-specific rates are ignored. Spike 3 chooses an external
 * tax service for production.
 */
export const DEMO_STATE_TAX_RATES: Record<string, number> = {
  AZ: 0.056,
  CA: 0.0725,
  CO: 0.029,
  GA: 0.04,
  IL: 0.0625,
  MA: 0.0625,
  NY: 0.04,
  TN: 0.07,
  TX: 0.0625,
  WA: 0.065,
};

export const DEMO_US_FALLBACK_TAX_RATE = 0.06;

export const taxCategoryDraft: TaxCategoryDraft = {
  key: "standard",
  name: "Standard (demo US rates)",
  description: "POC demo rates: state base rates for the seeded states and a US-wide fallback. Replace with an external tax service (spike 3).",
  rates: [
    ...Object.entries(DEMO_STATE_TAX_RATES).map(([state, amount]) => ({
      key: `us-${state.toLowerCase()}`,
      name: `${state} state rate (demo)`,
      amount,
      includedInPrice: false,
      country: "US",
      state,
    })),
    { key: "us-default", name: "US fallback (demo)", amount: DEMO_US_FALLBACK_TAX_RATE, includedInPrice: false, country: "US" },
  ],
};

export const zoneDraft: ZoneDraft = {
  key: "us",
  name: "United States",
  locations: [{ country: "US" }],
};

/** Vendors ship directly; one flat rate, part of the gift budget (open question 3). */
export const SHIPPING_RATE_CENTS = 800;

export const shippingMethodDraft: ShippingMethodDraft = {
  key: "vendor-standard",
  name: "Standard delivery from the vendor",
  localizedName: en("Standard delivery"),
  taxCategory: { typeId: "tax-category", key: "standard" },
  zoneRates: [{ zone: { typeId: "zone", key: "us" }, shippingRates: [{ price: { currencyCode: "USD", centAmount: SHIPPING_RATE_CENTS } }] }],
  isDefault: true,
  active: true,
};

/**
 * Roles for company members (spike 4). The Gifting API enforces what each
 * role may do; these permissions only cover what members could do directly
 * in commercetools.
 */
export const associateRoleDrafts: AssociateRoleDraft[] = [
  {
    key: "owner",
    name: "Owner",
    buyerAssignable: false,
    permissions: ["UpdateBusinessUnitDetails", "UpdateAssociates", "AddChildUnits", "UpdateParentUnit", "ViewMyOrders", "ViewOthersOrders", "CreateApprovalRules", "UpdateApprovalRules", "UpdateApprovalFlows"],
  },
  {
    key: "admin",
    name: "Admin",
    buyerAssignable: false,
    permissions: ["UpdateBusinessUnitDetails", "UpdateAssociates", "AddChildUnits", "ViewMyOrders", "ViewOthersOrders"],
  },
  { key: "approver", name: "Approver", buyerAssignable: false, permissions: ["ViewMyOrders", "ViewOthersOrders", "UpdateApprovalFlows"] },
  { key: "sender", name: "Sender", buyerAssignable: false, permissions: ["ViewMyOrders"] },
];

/** Marketplace-wide categories for browsing across vendors, under one root. */
export const GIFT_CATEGORIES = [
  { key: "gifts-food-treats", name: "Food & treats" },
  { key: "gifts-drinks", name: "Drinks" },
  { key: "gifts-home", name: "Home" },
  { key: "gifts-outdoors", name: "Outdoors" },
  { key: "gifts-wellness", name: "Wellness" },
] as const;

export const categoryDrafts: CategoryDraft[] = [
  { key: "gifts", name: en("Gifts"), slug: en("gifts") },
  ...GIFT_CATEGORIES.map(({ key, name }) => ({ key, name: en(name), slug: en(key), parent: { typeId: "category" as const, key: "gifts" } })),
];
