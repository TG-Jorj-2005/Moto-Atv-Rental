import { describe, expect, it } from "vitest";
import {
  addDays,
  formatLocalDateTime,
  localDateOf,
  localDayStart,
  LocalTimeError,
  localToInstant,
  localWeekday,
  parseLocalDateTimeInput,
  toLocalInputValue,
  toLocalParts,
} from "./business-time";

// Every instant below is written in UTC on purpose: these tests must give the same result on a machine
// set to any time zone (the CI run also repeats them under several TZ values, see `npm run test:tz`).
const utc = (iso: string) => new Date(iso);
const at = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) => ({ year, month, day, hour, minute, second });

describe("toLocalParts: offset from UTC", () => {
  it("is UTC+2 in winter and UTC+3 in summer", () => {
    expect(toLocalParts(utc("2026-01-15T12:00:00Z"))).toEqual(at(2026, 1, 15, 14));
    expect(toLocalParts(utc("2026-07-15T12:00:00Z"))).toEqual(at(2026, 7, 15, 15));
  });
  it("jumps forward at 03:00 on the last Sunday of March (2027-03-28, 01:00 UTC)", () => {
    expect(toLocalParts(utc("2027-03-28T00:59:59Z"))).toEqual(at(2027, 3, 28, 2, 59, 59));
    expect(toLocalParts(utc("2027-03-28T01:00:00Z"))).toEqual(at(2027, 3, 28, 4, 0, 0));
  });
  it("falls back at 04:00 on the last Sunday of October (2026-10-25, 01:00 UTC)", () => {
    expect(toLocalParts(utc("2026-10-25T00:59:59Z"))).toEqual(at(2026, 10, 25, 3, 59, 59));
    expect(toLocalParts(utc("2026-10-25T01:00:00Z"))).toEqual(at(2026, 10, 25, 3, 0, 0));
  });
  it("rolls the date over at local midnight, not UTC midnight", () => {
    expect(toLocalParts(utc("2026-12-31T21:59:59Z"))).toEqual(at(2026, 12, 31, 23, 59, 59));
    expect(toLocalParts(utc("2026-12-31T22:00:00Z"))).toEqual(at(2027, 1, 1, 0, 0, 0));
  });
});

describe("localToInstant", () => {
  it("converts ordinary winter and summer times", () => {
    expect(localToInstant(at(2026, 1, 15, 14)).toISOString()).toBe("2026-01-15T12:00:00.000Z");
    expect(localToInstant(at(2026, 7, 15, 15)).toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });
  it("rejects a time that does not exist when the clocks jump forward", () => {
    for (const [h, m] of [[3, 0], [3, 30], [3, 59]] as const) {
      expect(() => localToInstant(at(2027, 3, 28, h, m))).toThrowError(LocalTimeError);
    }
    expect(() => localToInstant(at(2027, 3, 28, 3, 30))).toThrow(/does not exist/);
  });
  it("accepts the last valid minute before and the first one after the spring jump", () => {
    expect(localToInstant(at(2027, 3, 28, 2, 59, 59)).toISOString()).toBe("2027-03-28T00:59:59.000Z");
    expect(localToInstant(at(2027, 3, 28, 4, 0, 0)).toISOString()).toBe("2027-03-28T01:00:00.000Z");
  });
  it("resolves an ambiguous autumn time to its FIRST occurrence", () => {
    expect(localToInstant(at(2026, 10, 25, 3, 30)).toISOString()).toBe("2026-10-25T00:30:00.000Z"); // summer time
    expect(localToInstant(at(2026, 10, 25, 3, 0)).toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(localToInstant(at(2026, 10, 25, 3, 59, 59)).toISOString()).toBe("2026-10-25T00:59:59.000Z");
  });
  it("has no ambiguity just outside the repeated hour", () => {
    expect(localToInstant(at(2026, 10, 25, 2, 59)).toISOString()).toBe("2026-10-24T23:59:00.000Z");
    expect(localToInstant(at(2026, 10, 25, 4, 0)).toISOString()).toBe("2026-10-25T02:00:00.000Z");
  });
  it("rejects dates that are not on the calendar", () => {
    expect(() => localToInstant(at(2027, 2, 29))).toThrowError(LocalTimeError);
    expect(() => localToInstant(at(2026, 4, 31))).toThrowError(LocalTimeError);
    expect(() => localToInstant(at(2026, 13, 1))).toThrowError(LocalTimeError);
    expect(() => localToInstant(at(2026, 1, 1, 24))).toThrowError(LocalTimeError);
    expect(() => localToInstant(at(2026, 1, 1, 10, 60))).toThrowError(LocalTimeError);
  });
  it("accepts 29 February only in leap years", () => {
    expect(localToInstant(at(2028, 2, 29, 12)).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(() => localToInstant(at(2100, 2, 29, 12))).toThrowError(LocalTimeError); // 2100 is not a leap year
  });
  it("round-trips every hour across both clock changes (ambiguous hour gives the first occurrence)", () => {
    for (const startIso of ["2026-10-24T00:00:00Z", "2027-03-27T00:00:00Z"]) {
      const start = utc(startIso).getTime();
      for (let i = 0; i < 4 * 24; i++) {
        const instant = new Date(start + i * 3600_000);
        const back = localToInstant(toLocalParts(instant));
        const secondOccurrence = toLocalParts(new Date(instant.getTime() - 3600_000)).hour === toLocalParts(instant).hour;
        expect(secondOccurrence ? back.getTime() === instant.getTime() - 3600_000 : back.getTime() === instant.getTime()).toBe(true);
      }
    }
  });
});

describe("parseLocalDateTimeInput", () => {
  it("reads datetime-local values as Bucharest time", () => {
    expect(parseLocalDateTimeInput("2026-07-15T15:00").toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(parseLocalDateTimeInput("2026-01-15T14:00:30").toISOString()).toBe("2026-01-15T12:00:30.000Z");
  });
  it("rejects malformed values and reports the kind of problem", () => {
    for (const bad of ["", "2026-07-15", "2026-07-15 15:00", "15/07/2026T15:00", "2026-7-5T1:00", "2026-07-15T15:00Z"]) {
      expect(() => parseLocalDateTimeInput(bad)).toThrowError(LocalTimeError);
    }
    try {
      parseLocalDateTimeInput("2027-03-28T03:30");
    } catch (error) {
      expect((error as LocalTimeError).code).toBe("nonexistent");
    }
    try {
      parseLocalDateTimeInput("2027-02-30T10:00");
    } catch (error) {
      expect((error as LocalTimeError).code).toBe("invalid");
    }
  });
});

describe("calendar helpers", () => {
  it("computes the weekday in Bucharest, which can differ from the UTC weekday", () => {
    expect(localWeekday(utc("2026-10-31T10:00:00Z"))).toBe(6); // Saturday
    expect(localWeekday(utc("2026-10-31T22:30:00Z"))).toBe(0); // already Sunday 00:30 in Bucharest, still Saturday in UTC
    expect(localWeekday(utc("2026-11-01T22:30:00Z"))).toBe(1); // Monday 00:30 locally
    expect(localWeekday(utc("2026-10-30T22:30:00Z"))).toBe(6); // Saturday 00:30 locally, still Friday in UTC
  });
  it("adds days across month and year ends and leap days", () => {
    expect(addDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 });
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addDays({ year: 2027, month: 2, day: 28 }, 1)).toEqual({ year: 2027, month: 3, day: 1 });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
  });
  it("finds the start of a local day, also on the days the clocks change", () => {
    expect(localDayStart({ year: 2026, month: 1, day: 1 }).toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(localDayStart({ year: 2026, month: 7, day: 1 }).toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(localDayStart({ year: 2027, month: 3, day: 28 }).toISOString()).toBe("2027-03-27T22:00:00.000Z"); // a 23-hour day
    expect(localDayStart({ year: 2027, month: 3, day: 29 }).toISOString()).toBe("2027-03-28T21:00:00.000Z");
    expect(localDayStart({ year: 2026, month: 10, day: 25 }).toISOString()).toBe("2026-10-24T21:00:00.000Z"); // a 25-hour day
    expect(localDayStart({ year: 2026, month: 10, day: 26 }).toISOString()).toBe("2026-10-25T22:00:00.000Z");
  });
  it("finds the local date of an instant", () => {
    expect(localDateOf(utc("2026-12-31T22:30:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });
  it("formats instants for the interface", () => {
    expect(formatLocalDateTime(utc("2026-07-15T12:05:00Z"))).toBe("2026-07-15 15:05");
    expect(toLocalInputValue(utc("2026-01-02T03:04:00Z"))).toBe("2026-01-02T05:04");
  });
});
