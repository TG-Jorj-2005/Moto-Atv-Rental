import { describe, expect, it } from "vitest";
import { discountBpsFor, priceQuote, quoteDays, quoteListPrice, quotePeriod, rankVehicles } from "./quotes";

describe("discountBpsFor", () => {
  it("applies the volume tiers", () => {
    expect([2, 4, 5, 9, 10, 40].map(discountBpsFor)).toEqual([0, 0, 500, 500, 1000, 1000]);
  });
});

describe("priceQuote", () => {
  it("discounts each vehicle and sums the rounded prices", () => {
    const { prices, total } = priceQuote([40000, 40001, 55000], 1000);
    expect(prices).toEqual([36000, 36001, 49500]);
    expect(total).toBe(121501);
  });
  it("returns list prices without discount", () => {
    expect(priceQuote([10000, 20000], 0).total).toBe(30000);
  });
});

describe("rankVehicles", () => {
  const d = (n: number) => new Date(2026, 0, n);
  it("puts platform vehicles first, then owners with fewer bookings", () => {
    const vs = [
      { id: "busy", ownerId: "o1", createdAt: d(1) },
      { id: "quiet", ownerId: "o2", createdAt: d(2) },
      { id: "own", ownerId: null, createdAt: d(3) },
    ];
    const ranked = rankVehicles(vs, new Map([["o1", 9], ["o2", 1]])).map((v) => v.id);
    expect(ranked).toEqual(["own", "quiet", "busy"]);
  });
  it("breaks ties by oldest listing", () => {
    const vs = [{ id: "new", ownerId: "o1", createdAt: d(5) }, { id: "old", ownerId: "o2", createdAt: d(1) }];
    expect(rankVehicles(vs, new Map()).map((v) => v.id)).toEqual(["old", "new"]);
  });
});

describe("quotePeriod (Bucharest calendar days)", () => {
  it("starts and ends at local midnight, summer time", () => {
    const { start, end } = quotePeriod(new Date("2027-06-01"), new Date("2027-06-03"));
    expect(start.toISOString()).toBe("2027-05-31T21:00:00.000Z");
    expect(end.toISOString()).toBe("2027-06-03T21:00:00.000Z");
  });
  it("starts and ends at local midnight, winter time", () => {
    const { start, end } = quotePeriod(new Date("2027-01-10"), new Date("2027-01-10"));
    expect(start.toISOString()).toBe("2027-01-09T22:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-10T22:00:00.000Z");
  });
  it("is 73 hours long when it contains the autumn clock change (24-26 Oct 2026)", () => {
    const { start, end } = quotePeriod(new Date("2026-10-24"), new Date("2026-10-26"));
    expect((end.getTime() - start.getTime()) / 3600000).toBe(73);
  });
  it("is 71 hours long when it contains the spring clock change (27-29 Mar 2027)", () => {
    const { start, end } = quotePeriod(new Date("2027-03-27"), new Date("2027-03-29"));
    expect((end.getTime() - start.getTime()) / 3600000).toBe(71);
  });
});

describe("quoteDays", () => {
  it("counts calendar days, both ends included", () => {
    expect(quoteDays(new Date("2027-06-01"), new Date("2027-06-01"))).toBe(1);
    expect(quoteDays(new Date("2027-06-01"), new Date("2027-06-03"))).toBe(3);
  });
  it("works across month ends, year ends and leap days", () => {
    expect(quoteDays(new Date("2026-12-30"), new Date("2027-01-02"))).toBe(4);
    expect(quoteDays(new Date("2028-02-27"), new Date("2028-03-01"))).toBe(4);
    expect(quoteDays(new Date("2027-02-27"), new Date("2027-03-01"))).toBe(3);
  });
});

describe("quoteListPrice", () => {
  const rates = { daily: 40000, weekend: 70000 };
  it("bills N calendar days as N daily rates, also across the clock changes", () => {
    expect(quoteListPrice({ ...rates, weekend: null }, new Date("2026-11-02"), new Date("2026-11-04"))).toBe(120000);
    expect(quoteListPrice({ ...rates, weekend: null }, new Date("2026-10-24"), new Date("2026-10-26"))).toBe(120000); // 73 hours, still 3 days
    expect(quoteListPrice({ ...rates, weekend: null }, new Date("2027-03-27"), new Date("2027-03-29"))).toBe(120000); // 71 hours
    expect(quoteListPrice({ ...rates, weekend: null }, new Date("2026-10-25"), new Date("2026-10-25"))).toBe(40000); // the 25-hour day
  });
  it("uses the weekend rate for Saturday-Sunday when cheaper", () => {
    expect(quoteListPrice(rates, new Date("2026-10-31"), new Date("2026-11-01"))).toBe(70000);
    expect(quoteListPrice(rates, new Date("2026-10-24"), new Date("2026-10-25"))).toBe(70000); // the weekend of the clock change
  });
  it("does not use the weekend rate on other days or when it is dearer", () => {
    expect(quoteListPrice(rates, new Date("2026-10-30"), new Date("2026-10-31"))).toBe(80000); // Friday-Saturday
    expect(quoteListPrice(rates, new Date("2026-10-31"), new Date("2026-11-02"))).toBe(120000); // Saturday-Monday
    expect(quoteListPrice({ daily: 30000, weekend: 70000 }, new Date("2026-10-31"), new Date("2026-11-01"))).toBe(60000);
  });
});
