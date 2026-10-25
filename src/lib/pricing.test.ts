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
