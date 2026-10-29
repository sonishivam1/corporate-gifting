import { formatCents } from "@gifting/domain";

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

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
