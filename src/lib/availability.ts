export type Period = { start: Date; end: Date };

export type ExistingBooking = Period & {
  status: "PENDING" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
};

/**
 * Periods are half-open [start, end), matching the tstzrange '[)' used by the
 * database exclusion constraint, so back-to-back bookings do not overlap.
 */
export function periodsOverlap(a: Period, b: Period): boolean {
  return a.start < b.end && b.start < a.end;
}

export function findConflicts(
  requested: Period,
  existing: ExistingBooking[],
): ExistingBooking[] {
  return existing.filter(
    (b) => b.status !== "CANCELLED" && periodsOverlap(requested, b),
  );
}

export function isAvailable(
  requested: Period,
  existing: ExistingBooking[],
): boolean {
  return findConflicts(requested, existing).length === 0;
}
