import { describe, expect, it } from "vitest";
import { makeQuoteRequestSchema, vehicleCreateSchema } from "./forms";

const input = (startDate: string, endDate = "2030-01-31") => ({
  vehicleType: "ATV",
  quantity: 3,
  startDate,
  endDate,
  purpose: "Team building event",
  contactPhone: "0700000000",
});
const schemaAt = (iso: string) => makeQuoteRequestSchema(() => new Date(iso));

describe("quote request start date (calendar date in Bucharest)", () => {
  it("must be after today in Bucharest, because the period starts at the beginning of that day", () => {
    // 2026-10-24 22:30 UTC is already 2026-10-25 01:30 in Bucharest (summer time).
    const schema = schemaAt("2026-10-24T22:30:00Z");
    expect(schema.safeParse(input("2026-10-25")).success).toBe(false); // today in Bucharest
    expect(schema.safeParse(input("2026-10-24")).success).toBe(false); // yesterday in Bucharest
    expect(schema.safeParse(input("2026-10-26")).success).toBe(true);
  });
  it("uses the Bucharest date on both sides of local midnight", () => {
    // 20:59 UTC = 23:59 on 2026-10-24 in Bucharest: tomorrow is the 25th.
    expect(schemaAt("2026-10-24T20:59:00Z").safeParse(input("2026-10-25")).success).toBe(true);
    // 21:00 UTC = 00:00 on 2026-10-25 in Bucharest: the 25th is now today.
    expect(schemaAt("2026-10-24T21:00:00Z").safeParse(input("2026-10-25")).success).toBe(false);
  });
  it("works across a month end, in winter time (the autumn change was on 25 October 2026, so UTC+2)", () => {
    // 21:30 UTC = 23:30 on 31 October in Bucharest: 1 November is still tomorrow.
    expect(schemaAt("2026-10-31T21:30:00Z").safeParse(input("2026-11-01")).success).toBe(true);
    // 22:30 UTC = 00:30 on 1 November in Bucharest: 1 November is now today.
    expect(schemaAt("2026-10-31T22:30:00Z").safeParse(input("2026-11-01")).success).toBe(false);
    expect(schemaAt("2026-10-31T22:30:00Z").safeParse(input("2026-11-02")).success).toBe(true);
  });
  it("is correct on the day the clocks go back (25 October 2026, a 25-hour day)", () => {
    // 22:30 UTC on the 24th is 01:30 on the 25th in summer time: the 25th is today.
    expect(schemaAt("2026-10-24T22:30:00Z").safeParse(input("2026-10-26")).success).toBe(true);
    // 21:30 UTC on the 25th is 23:30 on the 25th in winter time: the 26th is still tomorrow.
    expect(schemaAt("2026-10-25T21:30:00Z").safeParse(input("2026-10-26")).success).toBe(true);
    // 22:30 UTC on the 25th is 00:30 on the 26th: the 26th is today.
    expect(schemaAt("2026-10-25T22:30:00Z").safeParse(input("2026-10-26")).success).toBe(false);
  });
  it("keeps the other rules: end not before start, at least 2 vehicles", () => {
    const schema = schemaAt("2026-01-01T00:00:00Z");
    expect(schema.safeParse(input("2030-02-02", "2030-02-01")).success).toBe(false);
    expect(schema.safeParse({ ...input("2030-02-01"), quantity: 1 }).success).toBe(false);
    expect(schema.safeParse(input("2030-02-01", "2030-02-01")).success).toBe(true);
  });
});

describe("vehicle category in the vehicle forms", () => {
  const form = { name: "Honda Rebel 500", type: "MOTORCYCLE", plate: "b-11-abc", hourlyRon: "100", dailyRon: "400", locationId: "x" };
  it("takes a category that fits the type and turns blank into null", () => {
    expect(vehicleCreateSchema.parse({ ...form, category: "CRUISER" }).category).toBe("CRUISER");
    expect(vehicleCreateSchema.parse({ ...form, category: "" }).category).toBeNull();
    expect(vehicleCreateSchema.parse(form).category).toBeNull();
  });
  it("rejects an unknown category and a category of the wrong type, pointing at the category field", () => {
    expect(vehicleCreateSchema.safeParse({ ...form, category: "BOAT" }).success).toBe(false);
    const wrong = vehicleCreateSchema.safeParse({ ...form, category: "ATV_SPORT" });
    expect(wrong.success).toBe(false);
    if (!wrong.success) expect(wrong.error.issues[0]!.path).toEqual(["category"]);
    expect(vehicleCreateSchema.safeParse({ ...form, type: "SCOOTER", category: "CRUISER" }).success).toBe(false);
  });
});
