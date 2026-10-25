import { describe, expect, it } from "vitest";
import { bookingInputSchema, isStartInFuture } from "./validators";
import { LocalTimeError, parseLocalDateTimeInput } from "./business-time";

const now = new Date("2026-11-02T10:00:00.000Z");

describe("isStartInFuture", () => {
  it("rejects a start equal to now (strict) and anything earlier", () => {
    expect(isStartInFuture(new Date(now), now)).toBe(false);
    expect(isStartInFuture(new Date(now.getTime() - 1), now)).toBe(false);
    expect(isStartInFuture(new Date("2020-01-01T00:00:00Z"), now)).toBe(false);
  });
  it("accepts one millisecond after now", () => {
    expect(isStartInFuture(new Date(now.getTime() + 1), now)).toBe(true);
  });
  it("compares instants, so the offset used to write them does not matter", () => {
    // 12:00 in UTC+2 is 10:00 UTC: exactly now, hence rejected; 12:01+02:00 is in the future.
    expect(isStartInFuture(new Date("2026-11-02T12:00:00+02:00"), now)).toBe(false);
    expect(isStartInFuture(new Date("2026-11-02T12:01:00+02:00"), now)).toBe(true);
  });
});

describe("start times typed in the form (Bucharest time)", () => {
  it("is in the past when the typed Bucharest time is earlier than now, whatever the browser zone", () => {
    // now = 12:00 in Bucharest (UTC+2). 11:59 local is past, 12:01 local is future.
    expect(isStartInFuture(parseLocalDateTimeInput("2026-11-02T11:59"), now)).toBe(false);
    expect(isStartInFuture(parseLocalDateTimeInput("2026-11-02T12:01"), now)).toBe(true);
  });
  it("cannot sneak a past time in through the ambiguous autumn hour", () => {
    const justAfter0030Utc = new Date("2026-10-25T00:45:00Z"); // 03:45 summer time
    // 03:30 is ambiguous; it resolves to its first occurrence (00:30 UTC), which is already past.
    expect(isStartInFuture(parseLocalDateTimeInput("2026-10-25T03:30"), justAfter0030Utc)).toBe(false);
    expect(isStartInFuture(parseLocalDateTimeInput("2026-10-25T04:00"), justAfter0030Utc)).toBe(true);
  });
  it("refuses the hour that does not exist instead of guessing", () => {
    expect(() => parseLocalDateTimeInput("2027-03-28T03:30")).toThrowError(LocalTimeError);
  });
});

describe("bookingInputSchema", () => {
  const base = {
    vehicleId: "v1",
    startAt: "2026-11-02T10:00:00Z",
    endAt: "2026-11-02T12:00:00Z",
    customer: { fullName: "Ana Pop", email: "ana@example.com", phone: "0700000000" },
  };
  it("accepts ISO instants with any offset", () => {
    expect(bookingInputSchema.safeParse(base).success).toBe(true);
    expect(bookingInputSchema.safeParse({ ...base, startAt: "2026-11-02T12:00:00+02:00", endAt: "2026-11-02T14:00:00+02:00" }).success).toBe(true);
  });
  it("still requires the end to be after the start", () => {
    expect(bookingInputSchema.safeParse({ ...base, endAt: base.startAt }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...base, endAt: "2026-11-02T09:00:00Z" }).success).toBe(false);
  });
  it("rejects unparsable dates", () => {
    expect(bookingInputSchema.safeParse({ ...base, startAt: "not a date" }).success).toBe(false);
  });
});
