import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking, listHistory, transitionBooking, type CreateBookingInput } from "@/lib/booking-service";
import { makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

const NOW = new Date("2030-06-01T00:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const START = new Date("2030-06-10T09:00:00Z");

const slot = (offsetDays = 0, hours = 24) => ({
  startAt: new Date(START.getTime() + offsetDays * DAY),
  endAt: new Date(START.getTime() + offsetDays * DAY + hours * HOUR),
});

async function book(user: { id: string; email: string }, vehicleId: string, offsetDays = 0, extra: Partial<CreateBookingInput> = {}) {
  return createBooking(
    user.id,
    { vehicleId, ...slot(offsetDays), customer: { fullName: "Test Person", email: user.email, phone: "0700000000" }, ...extra },
    NOW,
  );
}

async function must(result: Awaited<ReturnType<typeof book>>) {
  if (!result.ok) throw new Error(`expected a booking, got ${result.code}`);
  return result.booking;
}

const historyOf = (bookingId: string) => prisma.bookingStatusHistory.findMany({ where: { bookingId }, orderBy: [{ changedAt: "asc" }, { id: "asc" }] });

// Every history must be a connected chain starting at "created": from(n) == to(n-1).
async function expectConsistentHistory(bookingId: string) {
  const rows = await historyOf(bookingId);
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]!.fromStatus).toBeNull();
  for (let i = 1; i < rows.length; i++) expect(rows[i]!.fromStatus).toBe(rows[i - 1]!.toStatus);
  expect(rows.at(-1)!.toStatus).toBe(booking.status);
}

describe("createBooking: rules", () => {
  it("creates a PENDING booking with its creation row in the history", async () => {
    const customer = await makeUser("CUSTOMER");
    const vehicle = await makeVehicle(null);
    const booking = await must(await book(customer, vehicle.id));
    expect(booking).toMatchObject({ status: "PENDING", totalPrice: 40000 });
    const rows = await historyOf(booking.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromStatus: null, toStatus: "PENDING", changedById: customer.id, note: null });
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.userId).toBe(customer.id);
  });
  it("accepts the account email in any letter case and updates name and phone, but nothing else", async () => {
    const customer = await makeUser("CUSTOMER", { email: "ana@test.example" });
    const vehicle = await makeVehicle(null);
    await must(await book(customer, vehicle.id, 0, { customer: { fullName: "Ana Pop", email: "ANA@Test.Example", phone: "0711111111" } }));
    const record = await prisma.customer.findUniqueOrThrow({ where: { email: "ana@test.example" } });
    expect(record).toMatchObject({ fullName: "Ana Pop", phone: "0711111111" });
  });
  it("refuses a different email and writes nothing", async () => {
    const customer = await makeUser("CUSTOMER");
    const vehicle = await makeVehicle(null);
    const result = await book(customer, vehicle.id, 0, { customer: { fullName: "X", email: "someone.else@test.example", phone: "0700000000" } });
    expect(result).toEqual({ ok: false, code: "EMAIL_MISMATCH" });
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.bookingStatusHistory.count()).toBe(0);
  });
  it("lets CUSTOMER, OWNER and RENTAL_COMPANY book, but not ADMIN or an unknown account", async () => {
    const vehicle = await makeVehicle(null);
    let day = 0;
    for (const role of ["CUSTOMER", "OWNER", "RENTAL_COMPANY"] as const) {
      const user = await makeUser(role);
      expect((await book(user, vehicle.id, day++)).ok).toBe(true);
    }
    const admin = await makeUser("ADMIN");
    expect(await book(admin, vehicle.id, 10)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await book({ id: "ghost", email: "ghost@test.example" }, vehicle.id, 11)).toEqual({ ok: false, code: "UNAUTHENTICATED" });
  });
  it("refuses booking your own vehicle", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    expect(await book(owner, vehicle.id)).toEqual({ ok: false, code: "OWN_VEHICLE" });
  });
  it("refuses vehicles that are in service, retired, not approved or unknown", async () => {
    const customer = await makeUser("CUSTOMER");
    const unavailable = [
      await makeVehicle(null, { status: "IN_SERVICE" }),
      await makeVehicle(null, { status: "RETIRED" }),
      await makeVehicle(null, { listingStatus: "PENDING" }),
      await makeVehicle(null, { listingStatus: "REJECTED" }),
    ];
    for (const v of unavailable) expect(await book(customer, v.id)).toEqual({ ok: false, code: "VEHICLE_UNAVAILABLE" });
    expect(await book(customer, "no-such-vehicle")).toEqual({ ok: false, code: "VEHICLE_UNAVAILABLE" });
    expect(await prisma.booking.count()).toBe(0);
  });
  it("refuses a start that is not strictly in the future", async () => {
    const customer = await makeUser("CUSTOMER");
    const vehicle = await makeVehicle(null);
    const at = (startAt: Date) => createBooking(customer.id, { vehicleId: vehicle.id, startAt, endAt: new Date(startAt.getTime() + DAY), customer: { fullName: "T", email: customer.email, phone: "0700000000" } }, NOW);
    expect(await at(NOW)).toEqual({ ok: false, code: "START_IN_PAST" });
    expect(await at(new Date(NOW.getTime() - 1))).toEqual({ ok: false, code: "START_IN_PAST" });
    expect((await at(new Date(NOW.getTime() + 1))).ok).toBe(true);
  });
  it("answers CONFLICT for overlaps and allows back-to-back bookings", async () => {
    const [a, b] = [await makeUser("CUSTOMER"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(null);
    await must(await book(a, vehicle.id, 0));
    expect(await book(b, vehicle.id, 0)).toEqual({ ok: false, code: "CONFLICT" });
    expect((await book(b, vehicle.id, 1)).ok).toBe(true); // starts exactly when the first ends
  });
  it("lets a new booking take the slot of a cancelled one", async () => {
    const [a, b] = [await makeUser("CUSTOMER"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(null);
    const first = await must(await book(a, vehicle.id, 0));
    await transitionBooking(a.id, first.id, "CANCELLED", { now: NOW });
    expect((await book(b, vehicle.id, 0)).ok).toBe(true);
  });
});

describe("createBooking: commission snapshot taken at creation", () => {
  it("platform fleet: 0% and no owner share", async () => {
    const customer = await makeUser("CUSTOMER");
    const vehicle = await makeVehicle(null);
    const booking = await must(await book(customer, vehicle.id));
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored).toMatchObject({ commissionBps: 0, commissionAmount: 0, ownerAmount: null });
  });
  it("individual owner: a fixed 15% even if a rate is stored on the account", async () => {
    const customer = await makeUser("CUSTOMER");
    const owner = await makeUser("OWNER");
    await prisma.user.update({ where: { id: owner.id }, data: { commissionBps: 700 } });
    const vehicle = await makeVehicle(owner.id);
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: (await must(await book(customer, vehicle.id))).id } });
    expect(stored).toMatchObject({ commissionBps: 1500, commissionAmount: 6000, ownerAmount: 34000 });
  });
  it("rental company: its configured rate, never below 5%, and the snapshot never changes afterwards", async () => {
    const customer = await makeUser("CUSTOMER");
    const company = await makeUser("RENTAL_COMPANY");
    const vehicle = await makeVehicle(company.id);
    await prisma.user.update({ where: { id: company.id }, data: { commissionBps: 800 } });
    const first = await must(await book(customer, vehicle.id, 0));
    await prisma.user.update({ where: { id: company.id }, data: { commissionBps: 300 } }); // below the minimum
    const second = await must(await book(customer, vehicle.id, 1));
    await prisma.user.update({ where: { id: company.id }, data: { commissionBps: 2000 } });
    const stored = await prisma.booking.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { startAt: "asc" } });
    expect(stored.map((b) => [b.commissionBps, b.commissionAmount, b.ownerAmount])).toEqual([
      [800, 3200, 36800],
      [500, 2000, 38000], // 3% is clamped to the 5% minimum
    ]);
  });
});

describe("createBooking: the limit of 3 PENDING bookings per user", () => {
  it("refuses the 4th pending booking with a clear code, and counts only PENDING", async () => {
    const customer = await makeUser("CUSTOMER");
    const other = await makeUser("CUSTOMER");
    const admin = await makeUser("ADMIN");
    const vehicle = await makeVehicle(null);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await must(await book(customer, vehicle.id, i))).id);
    expect(await book(customer, vehicle.id, 3)).toEqual({ ok: false, code: "PENDING_LIMIT" });
    expect((await book(other, vehicle.id, 3)).ok).toBe(true); // the limit is per user
    // A CONFIRMED booking no longer counts.
    expect(await transitionBooking(admin.id, ids[0]!, "CONFIRMED", { now: NOW })).toMatchObject({ ok: true });
    expect((await book(customer, vehicle.id, 4)).ok).toBe(true);
    expect(await prisma.booking.count({ where: { userId: customer.id, status: "PENDING" } })).toBe(3);
  });
  it("holds under concurrency: 8 simultaneous requests of one user create exactly 3", async () => {
    for (let round = 0; round < 3; round++) {
      await resetDatabase();
      const customer = await makeUser("CUSTOMER");
      const vehicle = await makeVehicle(null);
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => book(customer, vehicle.id, i)));
      expect(results.filter((r) => r.ok)).toHaveLength(3);
      expect(results.filter((r) => !r.ok && r.code === "PENDING_LIMIT")).toHaveLength(5);
      expect(await prisma.booking.count({ where: { userId: customer.id, status: "PENDING" } })).toBe(3);
    }
  });
  it("never oversells a slot: 12 users racing for the same vehicle and period, exactly one wins", async () => {
    const vehicle = await makeVehicle(null);
    const users = await Promise.all(Array.from({ length: 12 }, () => makeUser("CUSTOMER")));
    const results = await Promise.all(users.map((u) => book(u, vehicle.id, 0)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "CONFLICT")).toHaveLength(11);
    expect(await prisma.booking.count()).toBe(1);
    expect(await prisma.bookingStatusHistory.count()).toBe(1); // no false history rows from the losers
  });
});

describe("transitionBooking: permissions and rules", () => {
  async function setup(vehicleOverrides: Parameters<typeof makeVehicle>[1] = {}) {
    const customer = await makeUser("CUSTOMER");
    const admin = await makeUser("ADMIN");
    const vehicle = await makeVehicle(null, vehicleOverrides);
    const booking = await must(await book(customer, vehicle.id));
    return { customer, admin, vehicle, booking };
  }

  it("runs the whole lifecycle and records every step with its actor and reason", async () => {
    const { customer, admin, booking } = await setup();
    const at = new Date(START.getTime() + 10 * 60_000);
    expect(await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW })).toMatchObject({ ok: true, status: "CONFIRMED" });
    expect(await transitionBooking(admin.id, booking.id, "ACTIVE", { now: at })).toMatchObject({ ok: true, status: "ACTIVE" });
    expect(await transitionBooking(admin.id, booking.id, "COMPLETED", { now: new Date(at.getTime() + 5 * HOUR) })).toMatchObject({ ok: true, status: "COMPLETED" });
    const history = await listHistory(booking.id);
    expect(history.map((h) => [h.fromStatus, h.toStatus, h.changedById])).toEqual([
      [null, "PENDING", customer.id],
      ["PENDING", "CONFIRMED", admin.id],
      ["CONFIRMED", "ACTIVE", admin.id],
      ["ACTIVE", "COMPLETED", admin.id],
    ]);
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.completedAt).not.toBeNull();
    await expectConsistentHistory(booking.id);
  });

  it("lets the customer cancel their own booking before the start, with an optional reason", async () => {
    const { customer, booking } = await setup();
    expect(await transitionBooking(customer.id, booking.id, "CANCELLED", { reason: "Plans changed", now: NOW })).toMatchObject({ ok: true });
    const rows = await historyOf(booking.id);
    expect(rows.at(-1)).toMatchObject({ fromStatus: "PENDING", toStatus: "CANCELLED", changedById: customer.id, note: "Plans changed" });
  });
  it("refuses a customer cancelling at or after the start and writes nothing", async () => {
    const { customer, admin, booking } = await setup();
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    const before = (await historyOf(booking.id)).length;
    for (const now of [START, new Date(START.getTime() + HOUR)]) {
      expect(await transitionBooking(customer.id, booking.id, "CANCELLED", { now })).toEqual({ ok: false, code: "ALREADY_STARTED" });
    }
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
    expect(await historyOf(booking.id)).toHaveLength(before);
    // After the start only an administrator can cancel, and must give a reason.
    expect(await transitionBooking(admin.id, booking.id, "CANCELLED", { now: START })).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(await transitionBooking(admin.id, booking.id, "CANCELLED", { reason: "No-show", now: START })).toMatchObject({ ok: true });
  });
  it("hides other people's bookings and refuses every non-admin action except cancelling your own", async () => {
    const { customer, admin, booking } = await setup();
    const stranger = await makeUser("CUSTOMER");
    const vehicleOwner = await makeUser("OWNER");
    expect(await transitionBooking(stranger.id, booking.id, "CANCELLED", { now: NOW })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await transitionBooking(vehicleOwner.id, booking.id, "CANCELLED", { now: NOW })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await transitionBooking(customer.id, booking.id, "CONFIRMED", { now: NOW })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await transitionBooking("ghost", booking.id, "CANCELLED", { now: NOW })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await transitionBooking(admin.id, "no-such-booking", "CONFIRMED", { now: NOW })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("PENDING");
  });
  it("refuses invalid transitions, including CONFIRMED -> COMPLETED, and anything out of a final status", async () => {
    const { admin, booking } = await setup();
    expect(await transitionBooking(admin.id, booking.id, "COMPLETED", { now: NOW })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    expect(await transitionBooking(admin.id, booking.id, "COMPLETED", { now: START })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    await transitionBooking(admin.id, booking.id, "CANCELLED", { reason: "x", now: NOW });
    for (const to of ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"] as const) {
      expect((await transitionBooking(admin.id, booking.id, to, { reason: "x", now: START })).ok).toBe(false);
    }
  });
  it("applies the handover window: from 1h before the start, a reason when more than 1h late, never after the end", async () => {
    const { admin, booking } = await setup();
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    const handover = (now: Date, reason?: string) => transitionBooking(admin.id, booking.id, "ACTIVE", { now, reason });
    expect(await handover(new Date(START.getTime() - HOUR - 1))).toEqual({ ok: false, code: "TOO_EARLY" });
    expect(await handover(new Date(START.getTime() + HOUR + 1))).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(await handover(booking.endAt, "too late")).toEqual({ ok: false, code: "PAST_END" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
    expect(await handover(new Date(START.getTime() + 3 * HOUR), "Customer arrived late")).toMatchObject({ ok: true });
    expect((await historyOf(booking.id)).at(-1)).toMatchObject({ toStatus: "ACTIVE", note: "Customer arrived late" });
  });
  it("does not confirm or hand over a vehicle that went out of service, and does not touch the booking", async () => {
    const { admin, vehicle, booking } = await setup();
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: "IN_SERVICE" } });
    expect(await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW })).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: "AVAILABLE" } });
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: "RETIRED" } });
    expect(await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START })).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    // Cancelling is still possible on a retired vehicle (the existing bookings are handled explicitly, not automatically).
    expect(await transitionBooking(admin.id, booking.id, "CANCELLED", { reason: "Vehicle retired", now: START })).toMatchObject({ ok: true });
  });
  it("completes with an unpaid balance, warns about it, and never marks anything as paid", async () => {
    const { admin, booking } = await setup();
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START });
    await prisma.payment.create({ data: { bookingId: booking.id, amount: 15000, method: "CASH" } });
    const done = await transitionBooking(admin.id, booking.id, "COMPLETED", { now: new Date(START.getTime() + DAY) });
    expect(done).toEqual({ ok: true, status: "COMPLETED", warnings: { unpaidBani: 25000 } });
    expect(await prisma.payment.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(await prisma.payment.aggregate({ where: { bookingId: booking.id }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: 15000 } });
  });
  it("does not warn when everything is paid, and an ACTIVE booking can be cancelled by an admin with a reason", async () => {
    const { admin, booking } = await setup();
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START });
    expect(await transitionBooking(admin.id, booking.id, "CANCELLED", { now: START })).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(await transitionBooking(admin.id, booking.id, "CANCELLED", { reason: "Entered by mistake", now: START })).toMatchObject({ ok: true });
  });
});

describe("transitionBooking: one ACTIVE booking per vehicle", () => {
  async function twoBackToBack() {
    const admin = await makeUser("ADMIN");
    const [a, b] = [await makeUser("CUSTOMER"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(null);
    const first = await must(await book(a, vehicle.id, 0));
    const second = await must(await book(b, vehicle.id, 1));
    await transitionBooking(admin.id, first.id, "CONFIRMED", { now: NOW });
    await transitionBooking(admin.id, second.id, "CONFIRMED", { now: NOW });
    return { admin, vehicle, first, second };
  }
  it("refuses the second handover until the first booking is completed or cancelled", async () => {
    const { admin, first, second } = await twoBackToBack();
    const nowForSecond = new Date(second.startAt.getTime() - 30 * 60_000); // second window is open, first is overdue
    expect((await transitionBooking(admin.id, first.id, "ACTIVE", { now: START, reason: undefined })).ok).toBe(true);
    expect(await transitionBooking(admin.id, second.id, "ACTIVE", { now: nowForSecond })).toEqual({ ok: false, code: "VEHICLE_BUSY" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("CONFIRMED");
    await transitionBooking(admin.id, first.id, "COMPLETED", { now: nowForSecond });
    expect((await transitionBooking(admin.id, second.id, "ACTIVE", { now: nowForSecond })).ok).toBe(true);
  });
  it("is enforced by the database too: a second ACTIVE row for the same vehicle is rejected", async () => {
    const { vehicle, first, second } = await twoBackToBack();
    await prisma.booking.update({ where: { id: first.id }, data: { status: "ACTIVE" } });
    await expect(prisma.booking.update({ where: { id: second.id }, data: { status: "ACTIVE" } })).rejects.toThrow();
    expect(await prisma.booking.count({ where: { vehicleId: vehicle.id, status: "ACTIVE" } })).toBe(1);
  });
  it("holds under concurrency: two simultaneous handovers of the same vehicle, exactly one succeeds", async () => {
    for (let i = 0; i < 5; i++) {
      await resetDatabase();
      const { admin, first, second } = await twoBackToBack();
      const now = new Date(second.startAt.getTime() - 30 * 60_000);
      const results = await Promise.all([
        transitionBooking(admin.id, first.id, "ACTIVE", { now, reason: "late handover" }),
        transitionBooking(admin.id, second.id, "ACTIVE", { now }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.code === "VEHICLE_BUSY")).toHaveLength(1);
      expect(await prisma.booking.count({ where: { status: "ACTIVE" } })).toBe(1);
      for (const b of [first, second]) await expectConsistentHistory(b.id);
    }
  });
});

describe("transitionBooking: concurrency on one booking", () => {
  it("two admins completing the same booking at once: one wins, one history row", async () => {
    for (let i = 0; i < 5; i++) {
      await resetDatabase();
      const admin = await makeUser("ADMIN");
      const admin2 = await makeUser("ADMIN");
      const customer = await makeUser("CUSTOMER");
      const vehicle = await makeVehicle(null);
      const booking = await must(await book(customer, vehicle.id));
      await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
      await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START });
      const before = (await historyOf(booking.id)).length;
      const now = new Date(START.getTime() + DAY);
      const results = await Promise.all([transitionBooking(admin.id, booking.id, "COMPLETED", { now }), transitionBooking(admin2.id, booking.id, "COMPLETED", { now })]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await historyOf(booking.id)).toHaveLength(before + 1);
      await expectConsistentHistory(booking.id);
    }
  });
  it("completing and cancelling an ACTIVE booking at once leaves one consistent outcome", async () => {
    for (let i = 0; i < 5; i++) {
      await resetDatabase();
      const admin = await makeUser("ADMIN");
      const customer = await makeUser("CUSTOMER");
      const vehicle = await makeVehicle(null);
      const booking = await must(await book(customer, vehicle.id));
      await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
      await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START });
      const now = new Date(START.getTime() + DAY);
      const results = await Promise.all([
        transitionBooking(admin.id, booking.id, "COMPLETED", { now }),
        transitionBooking(admin.id, booking.id, "CANCELLED", { reason: "mistake", now }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      await expectConsistentHistory(booking.id);
    }
  });
  it("a customer cancelling while an admin confirms ends cancelled, with a valid history either way", async () => {
    for (let i = 0; i < 5; i++) {
      await resetDatabase();
      const admin = await makeUser("ADMIN");
      const customer = await makeUser("CUSTOMER");
      const vehicle = await makeVehicle(null);
      const booking = await must(await book(customer, vehicle.id));
      await Promise.all([transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW }), transitionBooking(customer.id, booking.id, "CANCELLED", { now: NOW })]);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
      await expectConsistentHistory(booking.id);
    }
  });
  it("a refused transition leaves no history row behind", async () => {
    const admin = await makeUser("ADMIN");
    const customer = await makeUser("CUSTOMER");
    const vehicle = await makeVehicle(null);
    const booking = await must(await book(customer, vehicle.id));
    const before = await prisma.bookingStatusHistory.count();
    await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START }); // PENDING -> ACTIVE is invalid
    await transitionBooking(admin.id, booking.id, "CANCELLED", { now: NOW }); // reason missing
    expect(await prisma.bookingStatusHistory.count()).toBe(before);
  });
});
