import type { CurrencyCode } from "@/lib/currency";

// A payment is entered in the currency the customer used. We keep that amount and the rate used,
// plus the RON equivalent (bani) so every booking balance can be computed in one currency.
export function toRonBani(paidMinor: number, currency: CurrencyCode, eurRonRate: number): number {
  return currency === "EUR" ? Math.round(paidMinor * eurRonRate) : paidMinor;
}

export function remainingBani(totalPrice: number, paymentsRonBani: number[]): number {
  return Math.max(0, totalPrice - paymentsRonBani.reduce((n, a) => n + a, 0));
}
