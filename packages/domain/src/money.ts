/**
 * Money is always integer cents plus a currency. Never do arithmetic on
 * decimal dollars: 0.1 + 0.2 is not 0.3, and a ledger that drifts by a cent
 * can't be reconciled.
 */

export type Cents = number;

export const CURRENCIES = ["USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Returns `value` if it is a safe, non-negative integer amount of cents. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Amount must be a non-negative integer number of cents.");
  }
  return value;
}

/**
 * Parses a decimal string such as "50", "50.5" or "50.00" into cents without
 * going through floating point. Accepts at most two decimal places.
 */
export function toCents(decimal: string): Cents {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal.trim());
  if (!match) throw new RangeError("Amount must look like 50 or 50.00.");
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return cents(Number(whole) * 100 + Number(fraction));
}

export function sumCents(amounts: readonly Cents[]): Cents {
  return cents(amounts.reduce((total, amount) => total + cents(amount), 0));
}

export function formatCents(amount: Cents, currency: Currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents(amount) / 100);
}
