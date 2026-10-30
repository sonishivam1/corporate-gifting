import { describeConnectorConformance } from "@gifting/commerce/conformance";

import type { CatalogItem } from "@gifting/commerce";

import { createMemoryConnector } from "./memory";

let n = 0;
const newEmail = () => `person-${++n}@conformance.example`;

describeConnectorConformance("memory, password sign-in", { connector: () => createMemoryConnector().connector, newEmail });

describeConnectorConformance("memory, password sign-in without platform sessions", {
  connector: () => createMemoryConnector({ platformSessions: false }).connector,
  newEmail,
});

const hosted = createMemoryConnector({ signIn: "hosted" });
describeConnectorConformance("memory, hosted sign-in", { connector: () => hosted.connector, newEmail, completeHostedSignIn: hosted.completeHostedSignIn });

// Fictional items: one tin in two sizes (the bigger out of stock) and a mug.
const items: CatalogItem[] = [
  {
    key: "tin",
    name: "Butter Cookie Tin",
    brand: "North Bakery",
    description: "",
    tags: ["food"],
    vendorKey: "vendor-north-bakery",
    vendorName: "North Bakery Co.",
    slaDays: 3,
    currency: "USD",
    variants: [
      { sku: "TIN-12", label: "12 pieces", priceCents: 2800, available: true, imageUrl: null },
      { sku: "TIN-24", label: "24 pieces", priceCents: 4500, available: false, imageUrl: null },
    ],
  },
  {
    key: "mug",
    name: "Stoneware Mug",
    brand: "Brightleaf",
    description: "",
    tags: ["drink"],
    vendorKey: "vendor-brightleaf",
    vendorName: "Brightleaf Tea House",
    slaDays: 2,
    currency: "USD",
    variants: [{ sku: "MUG-1", label: "", priceCents: 3000, available: true, imageUrl: null }],
  },
];

describeConnectorConformance("memory, with a catalog", { connector: () => createMemoryConnector({ catalog: items }).connector, newEmail });
