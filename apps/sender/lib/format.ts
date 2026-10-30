import { formatCents, type ProductView } from "@gifting/domain";

/** "$50" for whole dollars, "$49.50" otherwise; negative amounts keep their sign. */
export function money(cents: number): string {
  const text = formatCents(Math.abs(cents));
  return `${cents < 0 ? "−" : ""}${text.endsWith(".00") ? text.slice(0, -3) : text}`;
}

/** "28 Oct" */
export function shortDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/** "$28", or "From $28" when its variants cost different amounts. */
export function priceLabel(product: Pick<ProductView, "priceCents" | "variants">): string {
  const prices = new Set(product.variants.map((v) => v.priceCents));
  return prices.size > 1 ? `From ${money(product.priceCents)}` : money(product.priceCents);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
