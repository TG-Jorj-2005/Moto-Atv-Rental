import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking-service";
import { makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

// Regression test: with three or more simultaneous conflicting inserts PostgreSQL used to answer
// "deadlock detected" instead of the exclusion-constraint violation, which surfaced as HTTP 500.
describe("booking creation under heavy contention", () => {
  it("30 users race for one slot, 10 rounds: every request ends as a success or a clean CONFLICT, never an error", async () => {
    const NOW = new Date("2030-06-01T00:00:00Z");
    for (let round = 0; round < 10; round++) {
      await resetDatabase();
      const vehicle = await makeVehicle(null);
      const users = await Promise.all(Array.from({ length: 30 }, () => makeUser("CUSTOMER")));
      const results = await Promise.allSettled(
        users.map((u) =>
          createBooking(
            u.id,
            { vehicleId: vehicle.id, startAt: new Date("2030-06-10T09:00:00Z"), endAt: new Date("2030-06-11T09:00:00Z"), customer: { fullName: "T", email: u.email, phone: "0700000000" } },
            NOW,
          ),
        ),
      );
      expect(results.filter((r) => r.status === "rejected")).toEqual([]);
      const values = results.map((r) => (r.status === "fulfilled" ? r.value : null));
      expect(values.filter((v) => v?.ok)).toHaveLength(1);
      expect(values.filter((v) => v && !v.ok && v.code === "CONFLICT")).toHaveLength(29);
      expect(await prisma.booking.count()).toBe(1);
      expect(await prisma.bookingStatusHistory.count()).toBe(1);
    }
  });

  it("many different slots of one vehicle booked at once all succeed, none is lost", async () => {
    const NOW = new Date("2030-06-01T00:00:00Z");
    const vehicle = await makeVehicle(null);
    const users = await Promise.all(Array.from({ length: 20 }, () => makeUser("CUSTOMER")));
    const results = await Promise.all(
      users.map((u, i) =>
        createBooking(
          u.id,
          { vehicleId: vehicle.id, startAt: new Date(Date.UTC(2030, 6, 1 + i, 9)), endAt: new Date(Date.UTC(2030, 6, 2 + i, 9)), customer: { fullName: "T", email: u.email, phone: "0700000000" } },
          NOW,
        ),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await prisma.booking.count()).toBe(20);
  });
});
