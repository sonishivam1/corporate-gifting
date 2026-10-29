/**
 * Fictional demo data: vendors, brands and products for the commercetools
 * sandbox, and one demo company. No real companies, people or brands; domains
 * use `.example`. M0 package 0.3 grows this to 50 to 100 products and imports
 * it through the Import API.
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
  brand: string;
  vendorKey: string;
  tags: string[];
  category: ProductCategory;
  occasions: Occasion[];
  description: string;
  priceCents: Cents;
  stock: number;
};

export const vendors: SeedVendor[] = [
  { key: "vendor-north-bakery", name: "North Bakery Co.", contactEmail: "orders@northbakery.example", fulfilmentMethod: "portal", slaDays: 3 },
  { key: "vendor-cedar-pine", name: "Cedar & Pine Candles", contactEmail: "ship@cedarpine.example", fulfilmentMethod: "portal", slaDays: 4 },
  { key: "vendor-brightleaf", name: "Brightleaf Tea House", contactEmail: "hello@brightleaf.example", fulfilmentMethod: "email", slaDays: 2 },
  { key: "vendor-trailhead", name: "Trailhead Goods", contactEmail: "fulfil@trailhead.example", fulfilmentMethod: "portal", slaDays: 5 },
];

export const products: SeedProduct[] = [
  { sku: "NB-TIN-CLASSIC-12", name: "Classic Cookie Tin (12)", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "celebration"], category: "food", occasions: ["birthday", "thanks", "appreciation"], description: "Twelve butter cookies, baked the morning they ship and packed in a keepsake tin.", priceCents: 2800, stock: 200 },
  { sku: "NB-TIN-ASSORTED-24", name: "Assorted Cookie Tin (24)", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "team"], category: "food", occasions: ["thanks", "appreciation", "newhire"], description: "Two dozen cookies in six flavours. Big enough to share with a team.", priceCents: 4500, stock: 120 },
  { sku: "NB-TIN-HOLIDAY-18", name: "Holiday Cookie Tin (18)", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "holiday"], category: "food", occasions: ["holiday"], description: "Gingerbread, spiced shortbread and cranberry oat, eighteen in all.", priceCents: 3900, stock: 80 },
  { sku: "CP-CANDLE-CEDAR", name: "Cedarwood Candle", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], category: "home", occasions: ["birthday", "anniversary", "thanks"], description: "A soy candle that smells like a walk in the woods. About 45 hours of burn time.", priceCents: 3200, stock: 150 },
  { sku: "CP-CANDLE-TRIO", name: "Seasonal Candle Trio", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax", "holiday"], category: "home", occasions: ["holiday", "appreciation"], description: "Three travel candles: fir, orange peel and clove, and fireside.", priceCents: 4800, stock: 60 },
  { sku: "CP-DIFFUSER-LAV", name: "Lavender Reed Diffuser", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], category: "home", occasions: ["thanks", "birthday"], description: "A slow, steady lavender scent for a desk or a bedside table.", priceCents: 2600, stock: 90 },
  { sku: "BL-TEA-SAMPLER", name: "Loose Leaf Tea Sampler", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["food", "drink", "wellness"], category: "drink", occasions: ["thanks", "newhire", "birthday"], description: "Eight loose leaf teas, from a bright green sencha to a malty breakfast blend.", priceCents: 2400, stock: 300 },
  { sku: "BL-TEA-CEREMONY", name: "Tea Ceremony Set", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], category: "drink", occasions: ["anniversary", "holiday"], description: "A cast iron teapot, two cups and a tin of the house oolong.", priceCents: 6500, stock: 40 },
  { sku: "BL-MUG-PAIR", name: "Stoneware Mug Pair", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], category: "drink", occasions: ["newhire", "anniversary", "thanks"], description: "Two hand-glazed 350 ml mugs. Dishwasher safe.", priceCents: 3000, stock: 110 },
  { sku: "TH-BOTTLE-750", name: "Insulated Bottle 750 ml", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "wellness"], category: "outdoors", occasions: ["newhire", "appreciation"], description: "Keeps drinks cold for a day or hot for half of one.", priceCents: 3400, stock: 250 },
  { sku: "TH-BLANKET-CAMP", name: "Packable Camp Blanket", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "home"], category: "outdoors", occasions: ["anniversary", "holiday"], description: "Water-resistant, warm and packs down to the size of a water bottle.", priceCents: 5900, stock: 70 },
  { sku: "TH-KIT-DAYHIKE", name: "Day Hike Kit", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "team"], category: "outdoors", occasions: ["newhire", "anniversary", "appreciation"], description: "A 20 litre daypack with a bottle, trail snacks and a first aid kit.", priceCents: 7500, stock: 30 },
];

export type SeedMember = { id: string; name: string; teams: { teamKey: string; role: "owner" | "admin" | "sender" | "approver" }[] };

/**
 * The demo company. In commercetools it is a Business Unit with one Division
 * per team; the threshold and approvers are the `team-settings` custom type
 * and the members are Associates. Until M1 creates them, the API reads them
 * from here.
 */
export const demoCompany = {
  key: "company-lumen-labs",
  name: "Lumen Labs",
  teams: [
    { key: "team-lumen-people", name: "People", approvalThresholdCents: 100_000, approverIds: ["user-rowan"] },
    { key: "team-lumen-sales", name: "Sales", approvalThresholdCents: 250_000, approverIds: ["user-imani"] },
  ],
  members: [
    {
      id: "user-maya",
      name: "Maya Chen",
      teams: [
        { teamKey: "team-lumen-people", role: "sender" },
        { teamKey: "team-lumen-sales", role: "sender" },
      ],
    },
    { id: "user-rowan", name: "Rowan Ellis", teams: [{ teamKey: "team-lumen-people", role: "approver" }] },
    { id: "user-imani", name: "Imani Brooks", teams: [{ teamKey: "team-lumen-sales", role: "approver" }] },
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
