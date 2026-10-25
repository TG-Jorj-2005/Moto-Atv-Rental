import { describe, expect, it } from "vitest";
import { monthBounds, monthParam, parseMonth, shiftMonth } from "./month-view";

describe("parseMonth", () => {
  const now = new Date("2030-06-15T10:00:00Z");
  it("reads YYYY-MM and falls back to the current month for anything else", () => {
    expect(parseMonth("2031-02", now)).toEqual({ year: 2031, month: 2 });
    for (const bad of [undefined, "", "2031-13", "2031-00", "31-02", "2031-2", "abcd-ef", "1999-12", "2101-01"]) expect(parseMonth(bad, now)).toEqual({ year: 2030, month: 6 });
  });
  it("uses the Bucharest month at the turn of the month", () => {
    expect(parseMonth(undefined, new Date("2030-06-30T21:30:00Z"))).toEqual({ year: 2030, month: 7 }); // already 1 July locally
    expect(parseMonth(undefined, new Date("2030-06-30T20:30:00Z"))).toEqual({ year: 2030, month: 6 });
  });
});

describe("monthBounds and shiftMonth", () => {
  it("covers the month from local midnight to local midnight", () => {
    const b = monthBounds({ year: 2030, month: 2 });
    expect(b.days).toBe(28);
    expect(b.start.toISOString()).toBe("2030-01-31T22:00:00.000Z");
    expect(b.end.toISOString()).toBe("2030-02-28T22:00:00.000Z");
    expect(monthBounds({ year: 2028, month: 2 }).days).toBe(29);
  });
  it("is correct for the months with a clock change (31 and 30 days, 23 and 25 hour days)", () => {
    expect((monthBounds({ year: 2030, month: 10 }).end.getTime() - monthBounds({ year: 2030, month: 10 }).start.getTime()) / 3600000).toBe(31 * 24 + 1);
    expect((monthBounds({ year: 2030, month: 3 }).end.getTime() - monthBounds({ year: 2030, month: 3 }).start.getTime()) / 3600000).toBe(31 * 24 - 1);
  });
  it("moves across year ends", () => {
    expect(shiftMonth({ year: 2030, month: 12 }, 1)).toEqual({ year: 2031, month: 1 });
    expect(shiftMonth({ year: 2030, month: 1 }, -1)).toEqual({ year: 2029, month: 12 });
    expect(monthParam({ year: 2030, month: 3 })).toBe("2030-03");
  });
});
