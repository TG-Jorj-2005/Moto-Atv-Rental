import { describe, expect, it } from "vitest";
import { catalogWhere, parseCatalogParams } from "./catalog";

const NOW = new Date("2030-06-15T10:00:00Z"); // 13:00 in Bucharest
const parse = (raw: Record<string, string>) => parseCatalogParams(raw, NOW);

describe("parseCatalogParams", () => {
  it("has sensible defaults and never needs any parameter", () => {
    const { filters, problems } = parse({});
    expect(problems).toEqual([]);
    expect(filters).toMatchObject({ q: "", type: null, county: null, locationId: null, minDailyRon: null, maxDailyRon: null, from: null, to: null, sort: "newest", page: 1 });
  });
  it("reads valid values", () => {
    const { filters, problems } = parse({ q: " grizzly ", type: "ATV", county: "Cluj", location: "abc", minPrice: "100", maxPrice: "500", sort: "price_asc", page: "3", from: "2030-06-20", to: "2030-06-22" });
    expect(problems).toEqual([]);
    expect(filters).toMatchObject({ q: "grizzly", type: "ATV", county: "Cluj", locationId: "abc", minDailyRon: 100, maxDailyRon: 500, sort: "price_asc", page: 3, from: { year: 2030, month: 6, day: 20 }, to: { year: 2030, month: 6, day: 22 } });
  });
  it("ignores unknown types and sorts, bad pages and arrays", () => {
    const { filters } = parseCatalogParams({ type: "BOAT", sort: "random", page: "0" }, NOW);
    expect(filters).toMatchObject({ type: null, sort: "newest", page: 1 });
    expect(parseCatalogParams({ page: "-3" }, NOW).filters.page).toBe(1);
    expect(parseCatalogParams({ page: "abc" }, NOW).filters.page).toBe(1);
    expect(parseCatalogParams({ type: ["MOTORCYCLE", "ATV"] }, NOW).filters.type).toBe("MOTORCYCLE");
  });
  it("reports bad prices and drops a contradictory price range", () => {
    const bad = parse({ minPrice: "abc", maxPrice: "-5" });
    expect(bad.problems).toHaveLength(2);
    expect(bad.filters.minDailyRon).toBeNull();
    const reversed = parse({ minPrice: "500", maxPrice: "100" });
    expect(reversed.problems[0]).toMatch(/higher than the maximum/);
    expect(reversed.filters).toMatchObject({ minDailyRon: null, maxDailyRon: null });
  });
  it("needs both dates, and not in the past, not reversed, not longer than 60 days, and must be real dates", () => {
    expect(parse({ from: "2030-06-20" }).problems[0]).toMatch(/both/);
    expect(parse({ from: "2030-06-20" }).filters.from).toBeNull();
    expect(parse({ from: "2030-06-10", to: "2030-06-12" }).problems[0]).toMatch(/past/);
    expect(parse({ from: "2030-06-20", to: "2030-06-18" }).problems[0]).toMatch(/before/);
    expect(parse({ from: "2030-06-20", to: "2030-09-30" }).problems[0]).toMatch(/60 days/);
    expect(parse({ from: "2030-02-30", to: "2030-03-02" }).problems.join()).toMatch(/not valid/);
    expect(parse({ from: "2030-06-15", to: "2030-06-15" }).problems).toEqual([]); // today is allowed
  });
  it("uses the Bucharest date for 'today' around local midnight", () => {
    // 21:30 UTC on 14 June is already 00:30 on 15 June in Bucharest: the 14th is in the past.
    expect(parseCatalogParams({ from: "2030-06-14", to: "2030-06-15" }, new Date("2030-06-14T21:30:00Z")).problems[0]).toMatch(/past/);
    expect(parseCatalogParams({ from: "2030-06-14", to: "2030-06-15" }, new Date("2030-06-14T20:30:00Z")).problems).toEqual([]);
  });
  it("caps the length of free text", () => {
    expect(parse({ q: "x".repeat(500) }).filters.q).toHaveLength(60);
  });
});

describe("catalogWhere", () => {
  it("always restricts to approved, available listings", () => {
    expect(catalogWhere(parse({}).filters)).toEqual({ listingStatus: "APPROVED", status: "AVAILABLE" });
  });
  it("converts RON per day to bani and prefers a location over a county", () => {
    const where = catalogWhere(parse({ minPrice: "100.5", maxPrice: "500", county: "Cluj", location: "loc1" }).filters);
    expect(where.dailyRate).toEqual({ gte: 10050, lte: 50000 });
    expect(where.locationId).toBe("loc1");
    expect(where.location).toBeUndefined();
    expect(catalogWhere(parse({ county: "Cluj" }).filters).location).toEqual({ county: "Cluj" });
  });
  it("turns the days into Bucharest day boundaries for the availability test", () => {
    const where = catalogWhere(parse({ from: "2030-06-20", to: "2030-06-21" }).filters);
    expect(where.bookings).toEqual({ none: { status: { not: "CANCELLED" }, startAt: { lt: new Date("2030-06-21T21:00:00.000Z") }, endAt: { gt: new Date("2030-06-19T21:00:00.000Z") } } });
  });
});
