import { describe, expect, it } from "vitest";
import { documentWarnings, dueState, parseDateInput } from "./maintenance-rules";

const at = (iso: string) => new Date(iso);
const NOW = at("2027-06-15T10:00:00Z"); // 13:00 in Bucharest

describe("dueState (calendar dates in Bucharest)", () => {
  it("is valid up to and including the due date, overdue the day after", () => {
    expect(dueState(parseDateInput("2027-06-15")!, NOW)).toBe("DUE_SOON"); // due today: still valid
    expect(dueState(parseDateInput("2027-06-14")!, NOW)).toBe("OVERDUE");
  });
  it("is DUE_SOON within 30 days and OK after that", () => {
    expect(dueState(parseDateInput("2027-07-15")!, NOW)).toBe("DUE_SOON"); // exactly 30 days
    expect(dueState(parseDateInput("2027-07-16")!, NOW)).toBe("OK");
  });
  it("uses the Bucharest date, not the UTC one, around midnight", () => {
    // 2027-06-14 21:30 UTC is already 2027-06-15 00:30 in Bucharest: a deadline of the 14th is overdue.
    expect(dueState(parseDateInput("2027-06-14")!, at("2027-06-14T21:30:00Z"))).toBe("OVERDUE");
    expect(dueState(parseDateInput("2027-06-14")!, at("2027-06-14T20:30:00Z"))).toBe("DUE_SOON");
  });
  it("works across the clock changes and year end", () => {
    expect(dueState(parseDateInput("2026-10-25")!, at("2026-10-25T10:00:00Z"))).toBe("DUE_SOON");
    expect(dueState(parseDateInput("2026-10-25")!, at("2026-10-25T22:30:00Z"))).toBe("OVERDUE"); // already the 26th locally
    expect(dueState(parseDateInput("2027-01-05")!, at("2026-12-31T12:00:00Z"))).toBe("DUE_SOON");
  });
});

describe("parseDateInput", () => {
  it("accepts real calendar dates only", () => {
    expect(parseDateInput("2028-02-29")).not.toBeNull();
    for (const bad of ["2027-02-29", "2027-13-01", "2027-04-31", "27-01-01", "2027-1-1", "", "2027-01-01T00:00"]) expect(parseDateInput(bad)).toBeNull();
  });
  it("returns the start of the day in Bucharest", () => {
    expect(parseDateInput("2027-07-01")!.toISOString()).toBe("2027-06-30T21:00:00.000Z");
    expect(parseDateInput("2027-01-01")!.toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });
});

describe("documentWarnings", () => {
  const rec = (type: "ITP" | "RCA" | "SERVICE" | "OTHER", performed: string, due: string | null) => ({ type, performedAt: at(performed), nextDueAt: due ? parseDateInput(due) : null });
  it("flags a missing ITP and RCA", () => {
    expect(documentWarnings([], NOW).map((w) => [w.type, w.state])).toEqual([["ITP", "NO_RECORD"], ["RCA", "NO_RECORD"]]);
  });
  it("only the most recent record of a type counts: a renewal replaces the old deadline", () => {
    const records = [rec("ITP", "2026-01-01T00:00:00Z", "2027-01-01"), rec("ITP", "2027-05-01T00:00:00Z", "2029-05-01"), rec("RCA", "2027-06-01T00:00:00Z", "2028-06-01")];
    expect(documentWarnings(records, NOW)).toEqual([]);
  });
  it("reports overdue and due-soon documents with their date", () => {
    const records = [rec("ITP", "2025-06-01T00:00:00Z", "2027-06-10"), rec("RCA", "2026-06-20T00:00:00Z", "2027-07-01")];
    expect(documentWarnings(records, NOW).map((w) => [w.type, w.state])).toEqual([["ITP", "OVERDUE"], ["RCA", "DUE_SOON"]]);
  });
  it("also warns about a service that is due, but a service without a deadline never warns", () => {
    const base = [rec("ITP", "2027-05-01T00:00:00Z", "2029-05-01"), rec("RCA", "2027-06-01T00:00:00Z", "2028-06-01")];
    expect(documentWarnings([...base, rec("SERVICE", "2026-06-01T00:00:00Z", "2027-06-20")], NOW).map((w) => [w.type, w.state])).toEqual([["SERVICE", "DUE_SOON"]]);
    expect(documentWarnings([...base, rec("SERVICE", "2026-06-01T00:00:00Z", null), rec("OTHER", "2026-06-01T00:00:00Z", null)], NOW)).toEqual([]);
  });
  it("a required document recorded without a deadline counts as no record", () => {
    expect(documentWarnings([rec("ITP", "2027-05-01T00:00:00Z", null), rec("RCA", "2027-06-01T00:00:00Z", "2028-06-01")], NOW).map((w) => [w.type, w.state])).toEqual([["ITP", "NO_RECORD"]]);
  });
});
