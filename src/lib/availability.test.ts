import { describe, expect, it } from "vitest";
import { findConflicts, isAvailable, periodsOverlap, type ExistingBooking } from "./availability";

const d = (iso: string) => new Date(iso);
const booking = (start: string, end: string, status: ExistingBooking["status"] = "CONFIRMED"): ExistingBooking => ({
  start: d(start),
  end: d(end),
  status,
});

describe("periodsOverlap", () => {
  const base = { start: d("2026-11-02T10:00Z"), end: d("2026-11-02T14:00Z") };

  it("detects partial overlap on both sides", () => {
    expect(periodsOverlap(base, { start: d("2026-11-02T12:00Z"), end: d("2026-11-02T16:00Z") })).toBe(true);
    expect(periodsOverlap(base, { start: d("2026-11-02T08:00Z"), end: d("2026-11-02T11:00Z") })).toBe(true);
  });

  it("detects containment both ways", () => {
    expect(periodsOverlap(base, { start: d("2026-11-02T11:00Z"), end: d("2026-11-02T12:00Z") })).toBe(true);
    expect(periodsOverlap(base, { start: d("2026-11-02T08:00Z"), end: d("2026-11-02T18:00Z") })).toBe(true);
  });

  it("allows back-to-back periods", () => {
    expect(periodsOverlap(base, { start: d("2026-11-02T14:00Z"), end: d("2026-11-02T16:00Z") })).toBe(false);
    expect(periodsOverlap(base, { start: d("2026-11-02T08:00Z"), end: d("2026-11-02T10:00Z") })).toBe(false);
  });
});

describe("availability", () => {
  const requested = { start: d("2026-11-02T10:00Z"), end: d("2026-11-02T14:00Z") };

  it("ignores cancelled bookings", () => {
    const existing = [booking("2026-11-02T09:00Z", "2026-11-02T15:00Z", "CANCELLED")];
    expect(isAvailable(requested, existing)).toBe(true);
  });

  it("reports the conflicting bookings", () => {
    const clash = booking("2026-11-02T13:00Z", "2026-11-02T18:00Z");
    const free = booking("2026-11-03T09:00Z", "2026-11-03T10:00Z");
    expect(findConflicts(requested, [clash, free])).toEqual([clash]);
  });
});
