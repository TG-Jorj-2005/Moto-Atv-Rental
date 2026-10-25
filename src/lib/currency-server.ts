import { cookies } from "next/headers";
import { parseCurrency, type CurrencyCode } from "@/lib/currency";

export const CURRENCY_COOKIE = "currency";

// The display currency chosen by the visitor (RON or EUR), remembered in a cookie. Prices are always stored in RON;
// EUR is only a conversion at the fixed configured rate.
export async function getCurrency(): Promise<CurrencyCode> {
  return parseCurrency((await cookies()).get(CURRENCY_COOKIE)?.value);
}
