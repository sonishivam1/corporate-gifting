/**
 * Fictional demo data: vendors, brands and products for the commercetools
 * project, and the demo companies with their teams. No real companies,
 * people or brands; domains use `.example`. The client's own catalog comes in
 * separately (infra/catalog) and never lives here.
 */
import type { Cents, Occasion, ProductCategory } from "@gifting/domain";

export type SeedVendor = {
  key: string;
  name: string;
  contactEmail: string;
  fulfilmentMethod: "portal" | "email";
  slaDays: number;
};

export type SeedProduct = {
  sku: string;
  name: string;
  description: string;
  brand: string;
  vendorKey: string;
  tags: string[];
  category: ProductCategory;
  occasions: Occasion[];
  priceCents: Cents;
  stock: number;
  /** Food that must ship fast; collections can leave it out for long transit. */
  perishable?: boolean;
};

export const vendors: SeedVendor[] = [
  { key: "vendor-north-bakery", name: "North Bakery Co.", contactEmail: "orders@northbakery.example", fulfilmentMethod: "portal", slaDays: 3 },
  { key: "vendor-cedar-pine", name: "Cedar & Pine Candles", contactEmail: "ship@cedarpine.example", fulfilmentMethod: "portal", slaDays: 4 },
  { key: "vendor-brightleaf", name: "Brightleaf Tea House", contactEmail: "hello@brightleaf.example", fulfilmentMethod: "email", slaDays: 2 },
  { key: "vendor-trailhead", name: "Trailhead Goods", contactEmail: "fulfil@trailhead.example", fulfilmentMethod: "portal", slaDays: 5 },
];

export const products: SeedProduct[] = [
  { sku: "NB-TIN-CLASSIC-12", name: "Classic Cookie Tin (12)", description: "Twelve butter cookies in three classic flavours, baked the day they ship.", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "celebration"], category: "food", occasions: ["birthday", "thanks", "appreciation"], priceCents: 2800, stock: 200, perishable: true },
  { sku: "NB-TIN-ASSORTED-24", name: "Assorted Cookie Tin (24)", description: "Two dozen cookies in six flavours, made for sharing with a team.", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "team"], category: "food", occasions: ["thanks", "appreciation", "newhire"], priceCents: 4500, stock: 120, perishable: true },
  { sku: "NB-TIN-HOLIDAY-18", name: "Holiday Cookie Tin (18)", description: "Eighteen spiced and iced cookies in a festive tin.", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "holiday"], category: "food", occasions: ["holiday"], priceCents: 3900, stock: 80, perishable: true },
  { sku: "CP-CANDLE-CEDAR", name: "Cedarwood Candle", description: "A soy candle with cedar and amber notes; about 45 hours of burn time.", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], category: "home", occasions: ["birthday", "anniversary", "thanks"], priceCents: 3200, stock: 150 },
  { sku: "CP-CANDLE-TRIO", name: "Seasonal Candle Trio", description: "Three small candles for autumn, winter and spring.", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax", "holiday"], category: "home", occasions: ["holiday", "appreciation"], priceCents: 4800, stock: 60 },
  { sku: "CP-DIFFUSER-LAV", name: "Lavender Reed Diffuser", description: "A glass diffuser with lavender oil and eight rattan reeds.", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], category: "home", occasions: ["thanks", "birthday"], priceCents: 2600, stock: 90 },
  { sku: "BL-TEA-SAMPLER", name: "Loose Leaf Tea Sampler", description: "Six loose-leaf teas, from green to rooibos, with a steeping guide.", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["food", "drink", "wellness"], category: "drink", occasions: ["thanks", "newhire", "birthday"], priceCents: 2400, stock: 300 },
  { sku: "BL-TEA-CEREMONY", name: "Tea Ceremony Set", description: "A cast-iron pot, two cups and a tin of ceremonial green tea.", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], category: "drink", occasions: ["anniversary", "holiday"], priceCents: 6500, stock: 40 },
  { sku: "BL-MUG-PAIR", name: "Stoneware Mug Pair", description: "Two hand-glazed stoneware mugs, dishwasher safe.", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], category: "drink", occasions: ["newhire", "anniversary", "thanks"], priceCents: 3000, stock: 110 },
  { sku: "TH-BOTTLE-750", name: "Insulated Bottle 750 ml", description: "A steel bottle that keeps drinks cold for a day or hot for twelve hours.", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "wellness"], category: "outdoors", occasions: ["newhire", "appreciation"], priceCents: 3400, stock: 250 },
  { sku: "TH-BLANKET-CAMP", name: "Packable Camp Blanket", description: "A water-resistant blanket that packs into its own pouch.", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "home"], category: "outdoors", occasions: ["anniversary", "holiday"], priceCents: 5900, stock: 70 },
  { sku: "TH-KIT-DAYHIKE", name: "Day Hike Kit", description: "A daypack with a bottle, a first-aid kit and a trail map case.", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "team"], category: "outdoors", occasions: ["newhire", "anniversary", "appreciation"], priceCents: 7500, stock: 30 },
];

export type DemoCompany = {
  key: string;
  name: string;
  domain: string;
  brandColor: string;
  teams: { key: string; name: string }[];
};

/** The fictional customer companies and their teams (commercetools Business Units). */
export const demoCompanies: DemoCompany[] = [
  { key: "company-lumen-labs", name: "Lumen Labs", domain: "lumenlabs.example", brandColor: "#4F46E5", teams: [{ key: "team-lumen-people", name: "People" }, { key: "team-lumen-sales", name: "Sales" }] },
  { key: "company-harbor-finch", name: "Harbor & Finch", domain: "harborfinch.example", brandColor: "#0F766E", teams: [{ key: "team-harbor-people", name: "People" }, { key: "team-harbor-clients", name: "Client Services" }] },
  { key: "company-bluepeak-health", name: "Bluepeak Health", domain: "bluepeak.example", brandColor: "#2563EB", teams: [{ key: "team-bluepeak-hr", name: "HR" }, { key: "team-bluepeak-care", name: "Care Teams" }] },
  { key: "company-copperline", name: "Copperline Logistics", domain: "copperline.example", brandColor: "#B45309", teams: [{ key: "team-copperline-ops", name: "Operations" }, { key: "team-copperline-sales", name: "Sales" }] },
  { key: "company-orbit-studio", name: "Orbit Studio", domain: "orbitstudio.example", brandColor: "#DB2777", teams: [{ key: "team-orbit-studio", name: "Studio" }, { key: "team-orbit-growth", name: "Growth" }] },
];

/**
 * A demo person and their roles: owners and admins on the company (no
 * `teamKey`), approvers and senders on one team (ADR 0016).
 */
export type SeedMember = { id: string; name: string; memberships: { teamKey?: string; role: "owner" | "admin" | "sender" | "approver" }[] };

/**
 * The company the sender dashboard runs as in development: Lumen Labs, the
 * first of `demoCompanies`, with its team settings and members. In
 * commercetools the threshold is the `team-settings` custom type and the
 * members are Associates; the API reads them there through the connector's
 * organizations, and reads these only when the connector has none.
 */
export const demoCompany = {
  ...demoCompanies[0]!,
  teams: [
    { key: "team-lumen-people", name: "People", approvalThresholdCents: 100_000 },
    { key: "team-lumen-sales", name: "Sales", approvalThresholdCents: 250_000 },
  ],
  members: [
    {
      id: "user-maya",
      name: "Maya Chen",
      memberships: [
        { teamKey: "team-lumen-people", role: "sender" },
        { teamKey: "team-lumen-sales", role: "sender" },
      ],
    },
    { id: "user-rowan", name: "Rowan Ellis", memberships: [{ teamKey: "team-lumen-people", role: "approver" }] },
    { id: "user-imani", name: "Imani Brooks", memberships: [{ teamKey: "team-lumen-sales", role: "approver" }] },
    { id: "user-dana", name: "Dana Okafor", memberships: [{ role: "owner" }] },
    { id: "user-theo", name: "Theo Lindqvist", memberships: [{ role: "admin" }] },
  ] satisfies SeedMember[],
} as const;

/** Opening balances, written as `top-up` ledger entries by `pnpm seed:demo`. */
export const demoTopUps: { teamKey: string; amountCents: Cents; paymentRef: string }[] = [
  { teamKey: "team-lumen-people", amountCents: 1_500_000, paymentRef: "demo-opening-people" },
  { teamKey: "team-lumen-sales", amountCents: 800_000, paymentRef: "demo-opening-sales" },
];

export type SeedCollection = {
  id: string;
  name: string;
  budgetBandCents: Cents;
  rules: { tags: string[]; brands: string[]; skus: string[]; pinnedSkus: string[] };
};

const rules = (tags: string[] = []) => ({ tags, brands: [], skus: [], pinnedSkus: [] });

/** Platform collections, curated by ops. */
export const demoCollections: SeedCollection[] = [
  { id: "col-treats", name: "Treats & tea", budgetBandCents: 5000, rules: rules(["food", "drink"]) },
  { id: "col-cozy", name: "Cozy at home", budgetBandCents: 6000, rules: rules(["home", "relax"]) },
  { id: "col-holiday", name: "Holiday favourites", budgetBandCents: 7500, rules: rules(["holiday", "sweet", "relax"]) },
  { id: "col-outdoor", name: "Out and about", budgetBandCents: 10_000, rules: rules(["outdoors", "wellness"]) },
  { id: "col-all", name: "Anything under $50", budgetBandCents: 5000, rules: rules() },
];

const PEOPLE = [
  "Jordan Rivera", "Sam Cohen", "Mei Malik", "Alex Haddad", "Noor Park", "Chris Reid", "Ravi Duval", "Elena Sato",
  "Tomás Costa", "Aisha Patel", "Ben Ortiz", "Grace Lee", "Kenji Novak", "Lucía Farah", "Omar Okafor", "Hana Silva",
];

const emailFor = (name: string) =>
  `${name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/ /g, ".")}@lumenlabs.example`;

/** The Lumen Labs recipient directory: fictional people at a `.example` domain. */
export const demoDirectory = PEOPLE.map((name, i) => ({
  id: `rcp-lumen-${String(i + 1).padStart(2, "0")}`,
  name,
  email: emailFor(name),
}));
