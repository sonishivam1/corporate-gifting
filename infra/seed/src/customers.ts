/**
 * Fictional demo customers for the commercetools project: people at
 * fictional companies, with `.example` emails, phone numbers in the 555-01xx
 * range reserved for fiction, and US shipping addresses on made-up streets.
 * Generated from a fixed seed, so every run gives the same people and
 * re-importing updates them instead of adding new ones. They sign in through
 * our identity provider (ADR 0009), so commercetools holds no password
 * (`ExternalAuth`).
 */
import type { CustomerImport } from "@commercetools/importapi-sdk";

/** About one demo customer per catalog product. */
export const DEMO_CUSTOMER_COUNT = 250;

export type DemoCustomer = {
  key: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  phone: string;
  address: { streetNumber: string; streetName: string; city: string; state: string; postalCode: string };
};

const FIRST_NAMES = [
  "Avery", "Jordan", "Riley", "Morgan", "Casey", "Quinn", "Harper", "Rowan", "Emerson", "Finley",
  "Sage", "Reese", "Parker", "Hayden", "Blake", "Dakota", "Skyler", "Logan", "Cameron", "Peyton",
  "Elliot", "Remy", "Marlowe", "Arden", "Sloane", "Tatum", "Kendall", "Lennox", "Briar", "Oakley",
  "Jules", "Shiloh", "Ainsley", "Darcy", "Ellis", "Hollis", "Linden", "Monroe", "Noel", "Wren",
];

const LAST_NAMES = [
  "Ashdown", "Bellweather", "Calloway", "Dunmore", "Everhart", "Fairbanks", "Galloway", "Hartwell",
  "Ingram", "Juniper", "Kingsley", "Lockridge", "Marchetti", "Northcott", "Oakhurst", "Pemberton",
  "Quintrell", "Ravenscroft", "Sutherland", "Thornbury", "Underhill", "Vance", "Whitlock", "Yardley",
  "Abernathy", "Brightwater", "Castellan", "Delacroix", "Elsworth", "Fenwick", "Greaves", "Holloway",
  "Ironside", "Kettering", "Larkspur", "Mayfield", "Nightingale", "Ortega", "Prescott", "Rowntree",
];

const COMPANIES = [
  { name: "Lumen Labs", domain: "lumenlabs.example" },
  { name: "Harbor & Finch", domain: "harborfinch.example" },
  { name: "Bluepeak Health", domain: "bluepeak.example" },
  { name: "Copperline Logistics", domain: "copperline.example" },
  { name: "Orbit Studio", domain: "orbitstudio.example" },
];

const STREET_NAMES = [
  "Maple Avenue", "Cedar Lane", "Willow Way", "Juniper Court", "Aspen Drive", "Birchwood Road",
  "Harbor View Street", "Meadowlark Lane", "Foxglove Terrace", "Riverbend Drive", "Stonegate Road", "Larch Street",
];

/** Real US cities, so tax and shipping on the address can be tested (spike 3). */
const CITIES = [
  { city: "Nashville", state: "TN", postalCode: "37203", area: "615" },
  { city: "Austin", state: "TX", postalCode: "78701", area: "512" },
  { city: "Denver", state: "CO", postalCode: "80202", area: "303" },
  { city: "Seattle", state: "WA", postalCode: "98101", area: "206" },
  { city: "Chicago", state: "IL", postalCode: "60601", area: "312" },
  { city: "Atlanta", state: "GA", postalCode: "30303", area: "404" },
  { city: "Boston", state: "MA", postalCode: "02108", area: "617" },
  { city: "Phoenix", state: "AZ", postalCode: "85004", area: "602" },
  { city: "San Diego", state: "CA", postalCode: "92101", area: "619" },
  { city: "New York", state: "NY", postalCode: "10001", area: "212" },
];

/** A small deterministic PRNG (mulberry32), so the same seed gives the same people. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoCustomers(count = DEMO_CUSTOMER_COUNT, seed = 20261028): DemoCustomer[] {
  const next = random(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(4, "0");
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const company = COMPANIES[i % COMPANIES.length]!;
    const place = pick(CITIES);
    return {
      key: `customer-${n}`,
      customerNumber: `DEMO-${n}`,
      firstName,
      lastName,
      // The number keeps emails unique when two people share a name.
      email: `${firstName}.${lastName}.${n}@${company.domain}`.toLowerCase(),
      companyName: company.name,
      phone: `+1${place.area}55501${String(i % 100).padStart(2, "0")}`,
      address: {
        streetNumber: String(10 + Math.floor(next() * 9890)),
        streetName: pick(STREET_NAMES),
        city: place.city,
        state: place.state,
        postalCode: place.postalCode,
      },
    };
  });
}

export function customerImport(customer: DemoCustomer): CustomerImport {
  return {
    key: customer.key,
    customerNumber: customer.customerNumber,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    companyName: customer.companyName,
    authenticationMode: "ExternalAuth",
    isEmailVerified: true,
    locale: "en-US",
    addresses: [
      {
        key: `${customer.key}-home`,
        country: "US",
        firstName: customer.firstName,
        lastName: customer.lastName,
        streetNumber: customer.address.streetNumber,
        streetName: customer.address.streetName,
        city: customer.address.city,
        state: customer.address.state,
        postalCode: customer.address.postalCode,
        phone: customer.phone,
        email: customer.email,
      },
    ],
    defaultShippingAddress: 0,
    shippingAddresses: [0],
    defaultBillingAddress: 0,
    billingAddresses: [0],
  };
}
