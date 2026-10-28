/**
 * The commercetools resources the platform needs, as drafts
 * (docs/architecture/commercetools.md). `pnpm ct:plan` prints them;
 * `pnpm ct:apply` creates the missing ones in the sandbox project.
 * The subscription (to SQS) is added in M4, when the queue exists.
 */
import type {
  ChannelDraft,
  FieldDefinition,
  ProductTypeDraft,
  StoreDraft,
  TypeDraft,
} from "@commercetools/platform-sdk";
import { vendors, type SeedVendor } from "@gifting/seed";

const en = (text: string) => ({ en: text });

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
  languages: ["en-US"],
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

export const productTypeDraft: ProductTypeDraft = {
  key: "gift-item",
  name: "Gift item",
  description: "A product a recipient can choose in a collection",
  attributes: [
    { name: "brand", label: en("Brand"), isRequired: true, isSearchable: true, type: { name: "text" }, attributeConstraint: "None", inputHint: "SingleLine" },
    { name: "vendorKey", label: en("Vendor key"), isRequired: true, isSearchable: true, type: { name: "text" }, attributeConstraint: "None", inputHint: "SingleLine" },
    {
      name: "tags",
      label: en("Tags"),
      isRequired: false,
      isSearchable: true,
      type: { name: "set", elementType: { name: "text" } },
      attributeConstraint: "None",
      inputHint: "SingleLine",
    },
  ],
};

export function vendorChannelDraft(vendor: SeedVendor): ChannelDraft {
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
