export type CurrencyCode = "RON" | "EUR";

export function parseCurrency(value: string | undefined): CurrencyCode {
  return value === "EUR" ? "EUR" : "RON";
}

export function eurRonRate(): number {
  const rate = Number(process.env.EUR_RON_RATE ?? "5");
  return Number.isFinite(rate) && rate > 0 ? rate : 5;
}

// Prices are stored in RON bani; EUR is derived with a fixed configurable rate.
export function convertBani(bani: number, currency: CurrencyCode): number {
  return currency === "EUR" ? Math.round(bani / eurRonRate()) : bani;
}

export function formatMoney(bani: number, currency: CurrencyCode): string {
  const minor = convertBani(bani, currency);
  return currency === "EUR" ? `€${(minor / 100).toFixed(0)}` : `${(minor / 100).toFixed(0)} RON`;
}
