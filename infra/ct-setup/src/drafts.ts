/**
 * The commercetools resources the platform needs, as drafts
 * (docs/architecture/commercetools.md). `pnpm ct:plan` prints them;
 * `pnpm ct:apply` creates the missing ones in the project from `.env`.
 * The subscription (to SQS) is added in M4, when the queue exists.
 */
import type {
  AttributeDefinitionDraft,
  ChannelDraft,
  FieldDefinition,
  ProductTypeDraft,
  StoreDraft,
  TypeDraft,
} from "@commercetools/platform-sdk";
import { CT_LOCALE } from "@gifting/ct";
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
    ],
  },
  {
    key: "team-settings",
    name: en("Team settings"),
    resourceTypeIds: ["business-unit"],
    fieldDefinitions: [numberField("approvalThresholdCents", "Approval threshold (cents)")],
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
 */
const marketplaceAttributes: AttributeDefinitionDraft[] = [
  attribute("brand", "Brand", { name: "text" }, true),
  attribute("vendorKey", "Vendor key", { name: "text" }, true),
  attribute("tags", "Tags", { name: "set", elementType: { name: "text" } }),
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
