import { describe, expect, it } from "vitest";
import { parseExportRange } from "./export-report";

describe("parseExportRange", () => {
  it("accepts empty bounds", () => {
    expect(parseExportRange(null, null)).toEqual({ from: null, toExclusive: null });
  });
  it("makes `to` inclusive: the range ends at the start of the next Bucharest day", () => {
    const r = parseExportRange("2027-03-27", "2027-03-27");
    if (r.error !== undefined) throw new Error(r.error);
    // 27 March 2027 is the day before the spring clock change: 24 hours; 00:00 Bucharest is 22:00Z (UTC+2).
    expect(r.from?.toISOString()).toBe("2027-03-26T22:00:00.000Z");
    expect(r.toExclusive?.toISOString()).toBe("2027-03-27T22:00:00.000Z");
  });
  it("handles the 23-hour day of the spring clock change", () => {
    const r = parseExportRange("2027-03-28", "2027-03-28");
    if (r.error !== undefined) throw new Error(r.error);
    expect(r.toExclusive!.getTime() - r.from!.getTime()).toBe(23 * 3600_000);
  });
  it("rejects malformed and impossible dates and reversed ranges", () => {
    for (const bad of ["2027-3-1", "yesterday", "2027-02-30", "2027-13-01"]) expect(parseExportRange(bad, null).error).toBeDefined();
    expect(parseExportRange("2027-05-02", "2027-05-01").error).toBeDefined();
  });
});
