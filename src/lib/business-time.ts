// Business calendar rules live in Europe/Bucharest. This module is the ONLY place that converts between
// absolute instants (stored as UTC in the database) and Bucharest wall-clock time. It uses Intl only,
// never the machine's local time zone (no getHours(), getDate(), ... on Date).

export const BUSINESS_TIME_ZONE = "Europe/Bucharest";

export type LocalDateTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };
export type LocalDate = Pick<LocalDateTime, "year" | "month" | "day">;

export class LocalTimeError extends Error {
  constructor(
    public readonly code: "invalid" | "nonexistent",
    message: string,
  ) {
    super(message);
  }
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Wall-clock time in Bucharest at the given instant.
export function toLocalParts(instant: Date): LocalDateTime {
  const get: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") get[part.type] = Number(part.value);
  }
  return {
    year: get.year!,
    month: get.month!,
    day: get.day!,
    hour: get.hour === 24 ? 0 : get.hour!, // some engines print midnight as 24
    minute: get.minute!,
    second: get.second!,
  };
}

const partsAsUtc = (p: LocalDateTime) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

// Offset from UTC in minutes at the given instant (+120 in winter, +180 in summer).
function offsetMinutes(instant: Date): number {
  const wholeSeconds = instant.getTime() - (((instant.getTime() % 1000) + 1000) % 1000);
  return Math.round((partsAsUtc(toLocalParts(instant)) - wholeSeconds) / MINUTE_MS);
}

const sameLocal = (a: LocalDateTime, b: LocalDateTime) => partsAsUtc(a) === partsAsUtc(b);

// Converts a Bucharest wall-clock time into the instant it denotes.
// - A time that never happens (clocks jump forward) throws LocalTimeError("nonexistent").
// - A time that happens twice (clocks go back) resolves deterministically to its FIRST occurrence.
export function localToInstant(local: LocalDateTime): Date {
  const asUtc = partsAsUtc(local);
  const roundTrip = new Date(asUtc);
  if (
    roundTrip.getUTCFullYear() !== local.year ||
    roundTrip.getUTCMonth() !== local.month - 1 ||
    roundTrip.getUTCDate() !== local.day ||
    local.hour < 0 || local.hour > 23 || local.minute < 0 || local.minute > 59 || local.second < 0 || local.second > 59
  ) {
    throw new LocalTimeError("invalid", "That date or time does not exist on the calendar.");
  }
  // Only two offsets are possible around any date; probe a day on each side to find them.
  const offsets = new Set([offsetMinutes(new Date(asUtc - DAY_MS)), offsetMinutes(new Date(asUtc + DAY_MS))]);
  const valid = [...offsets]
    .map((offset) => asUtc - offset * MINUTE_MS)
    .filter((candidate) => sameLocal(toLocalParts(new Date(candidate)), local))
    .sort((a, b) => a - b);
  if (valid.length === 0) {
    throw new LocalTimeError("nonexistent", "That local time does not exist: the clocks move forward at that moment.");
  }
  return new Date(valid[0]!);
}

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// Parses the value of <input type="datetime-local"> ("2027-03-28T10:30") as Bucharest time,
// whatever time zone the browser or the server runs in.
export function parseLocalDateTimeInput(value: string): Date {
  const m = INPUT_PATTERN.exec(value.trim());
  if (!m) throw new LocalTimeError("invalid", "Use the format YYYY-MM-DDTHH:mm.");
  return localToInstant({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]!, second: m[6] ? +m[6] : 0 });
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function toLocalInputValue(instant: Date): string {
  const p = toLocalParts(instant);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// "2027-03-28 10:30" in Bucharest time, for the interface.
export function formatLocalDateTime(instant: Date): string {
  return toLocalInputValue(instant).replace("T", " ");
}

export function formatLocalDate(instant: Date): string {
  return toLocalInputValue(instant).slice(0, 10);
}

export function localDateOf(instant: Date): LocalDate {
  const { year, month, day } = toLocalParts(instant);
  return { year, month, day };
}

// 0 = Sunday ... 6 = Saturday, as seen in Bucharest.
export function localWeekday(instant: Date): number {
  const { year, month, day } = toLocalParts(instant);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Calendar arithmetic on dates (handles month ends and leap years), independent of any time zone.
export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// The instant at which the given Bucharest calendar day starts (00:00 always exists in this zone).
export function localDayStart(date: LocalDate): Date {
  return localToInstant({ ...date, hour: 0, minute: 0, second: 0 });
}
