/**
 * Fictional demo data: vendors, brands and products for the commercetools
 * sandbox, and one demo company. No real companies, people or brands; domains
 * use `.example`. M0 package 0.3 grows this to 50 to 100 products and imports
 * it through the Import API.
 */
import type { Cents } from "@gifting/domain";

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
  { sku: "NB-TIN-CLASSIC-12", name: "Classic Cookie Tin (12)", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "celebration"], priceCents: 2800, stock: 200 },
  { sku: "NB-TIN-ASSORTED-24", name: "Assorted Cookie Tin (24)", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "team"], priceCents: 4500, stock: 120 },
  { sku: "NB-TIN-HOLIDAY-18", name: "Holiday Cookie Tin (18)", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "holiday"], priceCents: 3900, stock: 80 },
  { sku: "CP-CANDLE-CEDAR", name: "Cedarwood Candle", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], priceCents: 3200, stock: 150 },
  { sku: "CP-CANDLE-TRIO", name: "Seasonal Candle Trio", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax", "holiday"], priceCents: 4800, stock: 60 },
  { sku: "CP-DIFFUSER-LAV", name: "Lavender Reed Diffuser", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], priceCents: 2600, stock: 90 },
  { sku: "BL-TEA-SAMPLER", name: "Loose Leaf Tea Sampler", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["food", "drink", "wellness"], priceCents: 2400, stock: 300 },
  { sku: "BL-TEA-CEREMONY", name: "Tea Ceremony Set", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], priceCents: 6500, stock: 40 },
  { sku: "BL-MUG-PAIR", name: "Stoneware Mug Pair", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], priceCents: 3000, stock: 110 },
  { sku: "TH-BOTTLE-750", name: "Insulated Bottle 750 ml", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "wellness"], priceCents: 3400, stock: 250 },
  { sku: "TH-BLANKET-CAMP", name: "Packable Camp Blanket", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "home"], priceCents: 5900, stock: 70 },
  { sku: "TH-KIT-DAYHIKE", name: "Day Hike Kit", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "team"], priceCents: 7500, stock: 30 },
];

export const demoCompany = {
  key: "company-lumen-labs",
  name: "Lumen Labs",
  teams: [
    { key: "team-lumen-people", name: "People" },
    { key: "team-lumen-sales", name: "Sales" },
  ],
} as const;
