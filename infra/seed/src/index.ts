/**
 * Fictional demo data: vendors, brands and products for the commercetools
 * project, and the demo companies with their teams. No real companies,
 * people or brands; domains use `.example`. The client's own catalog comes in
 * separately (infra/catalog) and never lives here.
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
  description: string;
  brand: string;
  vendorKey: string;
  tags: string[];
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
  { sku: "NB-TIN-CLASSIC-12", name: "Classic Cookie Tin (12)", description: "Twelve butter cookies in three classic flavours, baked the day they ship.", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "celebration"], priceCents: 2800, stock: 200, perishable: true },
  { sku: "NB-TIN-ASSORTED-24", name: "Assorted Cookie Tin (24)", description: "Two dozen cookies in six flavours, made for sharing with a team.", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "team"], priceCents: 4500, stock: 120, perishable: true },
  { sku: "NB-TIN-HOLIDAY-18", name: "Holiday Cookie Tin (18)", description: "Eighteen spiced and iced cookies in a festive tin.", brand: "North Bakery", vendorKey: "vendor-north-bakery", tags: ["food", "sweet", "holiday"], priceCents: 3900, stock: 80, perishable: true },
  { sku: "CP-CANDLE-CEDAR", name: "Cedarwood Candle", description: "A soy candle with cedar and amber notes; about 45 hours of burn time.", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], priceCents: 3200, stock: 150 },
  { sku: "CP-CANDLE-TRIO", name: "Seasonal Candle Trio", description: "Three small candles for autumn, winter and spring.", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax", "holiday"], priceCents: 4800, stock: 60 },
  { sku: "CP-DIFFUSER-LAV", name: "Lavender Reed Diffuser", description: "A glass diffuser with lavender oil and eight rattan reeds.", brand: "Cedar & Pine", vendorKey: "vendor-cedar-pine", tags: ["home", "relax"], priceCents: 2600, stock: 90 },
  { sku: "BL-TEA-SAMPLER", name: "Loose Leaf Tea Sampler", description: "Six loose-leaf teas, from green to rooibos, with a steeping guide.", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["food", "drink", "wellness"], priceCents: 2400, stock: 300 },
  { sku: "BL-TEA-CEREMONY", name: "Tea Ceremony Set", description: "A cast-iron pot, two cups and a tin of ceremonial green tea.", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], priceCents: 6500, stock: 40 },
  { sku: "BL-MUG-PAIR", name: "Stoneware Mug Pair", description: "Two hand-glazed stoneware mugs, dishwasher safe.", brand: "Brightleaf", vendorKey: "vendor-brightleaf", tags: ["drink", "home"], priceCents: 3000, stock: 110 },
  { sku: "TH-BOTTLE-750", name: "Insulated Bottle 750 ml", description: "A steel bottle that keeps drinks cold for a day or hot for twelve hours.", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "wellness"], priceCents: 3400, stock: 250 },
  { sku: "TH-BLANKET-CAMP", name: "Packable Camp Blanket", description: "A water-resistant blanket that packs into its own pouch.", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "home"], priceCents: 5900, stock: 70 },
  { sku: "TH-KIT-DAYHIKE", name: "Day Hike Kit", description: "A daypack with a bottle, a first-aid kit and a trail map case.", brand: "Trailhead", vendorKey: "vendor-trailhead", tags: ["outdoors", "team"], priceCents: 7500, stock: 30 },
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

/** The first demo company, used where one company is enough. */
export const demoCompany = demoCompanies[0]!;
