export type Rates = {
  hourly: number;
  daily: number;
  weekend: number | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_HOURS = 24;

/**
 * A rental qualifies for the flat weekend rate when it lasts more than one
 * day and fits entirely between Saturday 00:00 and Monday 00:00 (UTC).
 */
export function isWeekendRental(start: Date, end: Date): boolean {
  if (end.getTime() - start.getTime() <= DAY_HOURS * HOUR_MS) return false;
  if (start.getUTCDay() !== 6) return false;

  const saturdayStart = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const mondayStart = saturdayStart + 2 * DAY_HOURS * HOUR_MS;
  return start.getTime() >= saturdayStart && end.getTime() <= mondayStart;
}

/**
 * Price in bani for renting between `start` and `end`.
 * - under 24h: billed per started hour, capped at the daily rate
 * - 24h or more: billed per started day, or the flat weekend rate if cheaper
 */
export function calculatePrice(start: Date, end: Date, rates: Rates): number {
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) {
    throw new RangeError("Rental end must be after its start");
  }

  const hours = Math.ceil(durationMs / HOUR_MS);
  if (hours < DAY_HOURS) {
    return Math.min(hours * rates.hourly, rates.daily);
  }

  const dailyTotal = Math.ceil(hours / DAY_HOURS) * rates.daily;
  if (rates.weekend !== null && isWeekendRental(start, end)) {
    return Math.min(dailyTotal, rates.weekend);
  }
  return dailyTotal;
}
