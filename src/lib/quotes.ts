import { addDays, localDayStart } from "@/lib/business-time";
import { isWeekendRental } from "@/lib/pricing";

// Pure helpers for bulk quotes (no database access), so they can be unit tested.

// Bulk discount in basis points: 5% from 5 vehicles, 10% from 10.
export function discountBpsFor(quantity: number): number {
  if (quantity >= 10) return 1000;
  if (quantity >= 5) return 500;
  return 0;
}

export type RankableVehicle = { id: string; ownerId: string | null; createdAt: Date };

// Platform-owned vehicles first, then owners with the fewest bookings so far (fair rotation).
export function rankVehicles<T extends RankableVehicle>(vehicles: T[], bookingsByOwner: Map<string, number>): T[] {
  return [...vehicles].sort((a, b) => {
    if (!a.ownerId !== !b.ownerId) return a.ownerId ? 1 : -1;
    const diff = (bookingsByOwner.get(a.ownerId ?? "") ?? 0) - (bookingsByOwner.get(b.ownerId ?? "") ?? 0);
    return diff !== 0 ? diff : a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// Discount is applied per vehicle, so each booking carries its own (rounded) price and the total always matches.
export function priceQuote(listPrices: number[], discountBps: number): { prices: number[]; total: number } {
  const prices = listPrices.map((p) => p - Math.round((p * discountBps) / 10000));
  return { prices, total: prices.reduce((n, p) => n + p, 0) };
}

// Quote dates are whole calendar days in Europe/Bucharest: from 00:00 of the first day until 00:00 after the last day.
// The period is only used to find free vehicles; billing counts calendar days (see quoteListPrice).
export function quotePeriod(startDate: Date, endDate: Date): { start: Date; end: Date } {
  // DATE columns arrive as UTC midnight, so their UTC components are the calendar date.
  const first = { year: startDate.getUTCFullYear(), month: startDate.getUTCMonth() + 1, day: startDate.getUTCDate() };
  const last = { year: endDate.getUTCFullYear(), month: endDate.getUTCMonth() + 1, day: endDate.getUTCDate() };
  return { start: localDayStart(first), end: localDayStart(addDays(last, 1)) };
}

// Number of calendar days a quote covers, both ends included.
export function quoteDays(startDate: Date, endDate: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const first = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const last = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.round((last - first) / MS_PER_DAY) + 1;
}

export type QuoteRates = { daily: number; weekend: number | null };

// List price of one vehicle for a quote: N calendar days cost N daily rates, whatever the length of those days in
// hours (a day with a clock change has 23 or 25 hours), or the flat weekend rate when that is cheaper.
export function quoteListPrice(rates: QuoteRates, startDate: Date, endDate: Date): number {
  const total = quoteDays(startDate, endDate) * rates.daily;
  const { start, end } = quotePeriod(startDate, endDate);
  if (rates.weekend !== null && isWeekendRental(start, end)) return Math.min(total, rates.weekend);
  return total;
}
