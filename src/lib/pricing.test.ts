import { describe, expect, it } from "vitest";
import { calculatePrice, isWeekendRental, type Rates } from "./pricing";

const rates: Rates = { hourly: 10000, daily: 40000, weekend: 70000 };
const d = (iso: string) => new Date(iso);

describe("calculatePrice", () => {
  it("bills per started hour", () => {
    expect(calculatePrice(d("2026-11-02T10:00Z"), d("2026-11-02T12:01Z"), rates)).toBe(30000);
  });

  it("caps hourly billing at the daily rate", () => {
    expect(calculatePrice(d("2026-11-02T08:00Z"), d("2026-11-02T20:00Z"), rates)).toBe(40000);
  });

  it("bills per started day from 24h up", () => {
    expect(calculatePrice(d("2026-11-02T10:00Z"), d("2026-11-03T10:00Z"), rates)).toBe(40000);
    expect(calculatePrice(d("2026-11-02T10:00Z"), d("2026-11-03T10:01Z"), rates)).toBe(80000);
  });

  it("uses the weekend rate when cheaper", () => {
    expect(calculatePrice(d("2026-10-31T10:00Z"), d("2026-11-01T20:00Z"), rates)).toBe(70000);
  });

  it("ignores the weekend rate when not defined", () => {
    const noWeekend = { ...rates, weekend: null };
    expect(calculatePrice(d("2026-10-31T10:00Z"), d("2026-11-01T20:00Z"), noWeekend)).toBe(80000);
  });

  it("rejects an empty or negative period", () => {
    expect(() => calculatePrice(d("2026-11-02T10:00Z"), d("2026-11-02T10:00Z"), rates)).toThrow(RangeError);
  });
});

describe("isWeekendRental", () => {
  it("is false when it spills past Monday 00:00", () => {
    expect(isWeekendRental(d("2026-10-31T10:00Z"), d("2026-11-02T01:00Z"))).toBe(false);
  });

  it("is false for a rental that starts on a weekday", () => {
    expect(isWeekendRental(d("2026-10-30T10:00Z"), d("2026-11-01T20:00Z"))).toBe(false);
  });
});

// Weekend window = Saturday 00:00 to Monday 00:00 in Europe/Bucharest (not UTC).
describe("isWeekendRental in Bucharest time", () => {
  const satStart = d("2026-10-30T22:00Z"); // Saturday 2026-10-31 00:00 Bucharest (winter time, UTC+2)
  const monStart = d("2026-11-01T22:00Z"); // Monday 2026-11-02 00:00 Bucharest
  const minute = 60_000;

  it("accepts exactly Saturday 00:00 to Monday 00:00", () => {
    expect(isWeekendRental(satStart, monStart)).toBe(true);
  });
  it("rejects one minute past Monday 00:00", () => {
    expect(isWeekendRental(satStart, new Date(monStart.getTime() + minute))).toBe(false);
  });
  it("rejects a start one minute before Saturday 00:00 local (Friday 23:59)", () => {
    expect(isWeekendRental(new Date(satStart.getTime() - minute), monStart)).toBe(false);
  });
  it("treats Saturday 01:00 local (still Friday in UTC) as a weekend start", () => {
    expect(isWeekendRental(d("2026-10-30T23:00Z"), d("2026-11-01T20:00Z"))).toBe(true);
  });
  it("rejects Sunday 00:30 local, which is still Saturday in UTC", () => {
    expect(isWeekendRental(d("2026-10-31T22:30Z"), d("2026-11-02T12:00Z"))).toBe(false);
  });
  it("works on the weekend the clocks go back (49 hours long): Sat 24 Oct to Mon 26 Oct 2026", () => {
    const start = d("2026-10-23T21:00Z"); // Saturday 00:00, summer time (UTC+3)
    const end = d("2026-10-25T22:00Z"); // Monday 00:00, winter time (UTC+2)
    expect(isWeekendRental(start, end)).toBe(true);
    expect(isWeekendRental(start, new Date(end.getTime() + minute))).toBe(false);
    expect(calculatePrice(start, end, rates)).toBe(70000); // flat weekend rate beats 3 started days (120000)
  });
  it("works on the weekend the clocks go forward (47 hours long): Sat 27 Mar to Mon 29 Mar 2027", () => {
    const start = d("2027-03-26T22:00Z"); // Saturday 00:00, winter time (UTC+2)
    const end = d("2027-03-28T21:00Z"); // Monday 00:00, summer time (UTC+3)
    expect(isWeekendRental(start, end)).toBe(true);
    expect(isWeekendRental(start, new Date(end.getTime() + minute))).toBe(false);
  });
  it("still needs more than 24 hours", () => {
    expect(isWeekendRental(satStart, new Date(satStart.getTime() + 24 * 60 * minute))).toBe(false);
    expect(isWeekendRental(satStart, new Date(satStart.getTime() + 24 * 60 * minute + minute))).toBe(true);
  });
});
