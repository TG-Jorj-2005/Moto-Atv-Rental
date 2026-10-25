import { beforeEach, describe, expect, it } from "vitest";
import type { VehicleType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking-service";
import { changeVehicleStatus } from "@/lib/vehicle-service";
import { acceptQuote, createQuote, declineQuote } from "@/lib/quote-service";
import { makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

const NOW = new Date("2030-06-01T00:00:00Z");

async function quote(userId: string, over: { quantity?: number; start?: string; end?: string; type?: VehicleType; locationId?: string } = {}) {
  return createQuote({
    userId,
    vehicleType: over.type ?? "ATV",
    quantity: over.quantity ?? 3,
    startDate: new Date(over.start ?? "2030-06-04"), // a Tuesday
    endDate: new Date(over.end ?? "2030-06-05"),
    purpose: "Team building event",
    contactPhone: "0700000000",
    locationId: over.locationId,
  });
}

const reload = (id: string) => prisma.quoteRequest.findUniqueOrThrow({ where: { id }, include: { items: true } });

async function bookVehicle(customer: { id: string; email: string }, vehicleId: string) {
  // Books the 4-5 June 2030 period of the offer (Bucharest midnights, so a few hours wider than the dates themselves).
  const r = await createBooking(customer.id, {
    vehicleId,
    startAt: new Date("2030-06-04T12:00:00Z"),
    endAt: new Date("2030-06-04T14:00:00Z"),
    customer: { fullName: "T", email: customer.email, phone: "0700000000" },
  }, NOW);
  if (!r.ok) throw new Error(r.code);
  return r.booking;
}

describe("createQuote", () => {
  it("is for rental companies only (the role is read from the database)", async () => {
    await makeVehicle(null);
    for (const role of ["CUSTOMER", "OWNER", "ADMIN"] as const) {
      const user = await makeUser(role);
      await expect(quote(user.id)).rejects.toThrow();
    }
    expect(await prisma.quoteRequest.count()).toBe(0);
  });
  it("lists the exact vehicles and prices, and the total is the sum of the items", async () => {
    const company = await makeUser("RENTAL_COMPANY");
    const vehicles = [await makeVehicle(null), await makeVehicle(null), await makeVehicle(null)];
    const q = await quote(company.id, { quantity: 3, start: "2030-06-04", end: "2030-06-05" });
    expect(q).toMatchObject({ status: "QUOTED", revision: 1, offeredQuantity: 3, discountBps: 0 });
    expect(q.items.map((i) => i.vehicleId).sort()).toEqual(vehicles.map((v) => v.id).sort());
    expect(q.items.every((i) => i.listPrice === 80000 && i.price === 80000)).toBe(true); // 2 calendar days x 40000
    expect(q.quotedAmount).toBe(q.items.reduce((n, i) => n + i.price, 0));
  });
  it("applies the bulk discount per vehicle (5% from 5 vehicles) and keeps the list price", async () => {
    const company = await makeUser("RENTAL_COMPANY");
    for (let i = 0; i < 5; i++) await makeVehicle(null);
    const q = await quote(company.id, { quantity: 5, start: "2030-06-04", end: "2030-06-04" });
    expect(q.discountBps).toBe(500);
    expect(q.items.every((i) => i.listPrice === 40000 && i.price === 38000)).toBe(true);
    expect(q.quotedAmount).toBe(190000);
  });
  it("offers only what exists, and says so; with nothing free it is declined and has no items", async () => {
    const company = await makeUser("RENTAL_COMPANY");
    await makeVehicle(null);
    await makeVehicle(null);
    const partial = await quote(company.id, { quantity: 5 });
    expect(partial).toMatchObject({ status: "QUOTED", offeredQuantity: 2, quantity: 5 });
    expect(partial.adminNote).toMatch(/2 of the 5/);
    const none = await quote(company.id, { type: "MOTORCYCLE" });
    expect(none).toMatchObject({ status: "DECLINED", offeredQuantity: 0, quotedAmount: null });
    expect(none.items).toHaveLength(0);
  });
  it("never offers the company's own vehicles, vehicles in service or unapproved listings, or busy vehicles", async () => {
    const [company, customer] = [await makeUser("RENTAL_COMPANY"), await makeUser("CUSTOMER")];
    const free = await makeVehicle(null);
    await makeVehicle(company.id);
    await makeVehicle(null, { status: "IN_SERVICE" });
    await makeVehicle(null, { listingStatus: "PENDING" });
    const busy = await makeVehicle(null);
    await bookVehicle(customer, busy.id);
    const q = await quote(company.id, { quantity: 10 });
    expect(q.items.map((i) => i.vehicleId)).toEqual([free.id]);
  });
});

describe("acceptQuote", () => {
  it("books exactly the listed vehicles at the listed prices, with snapshot and history, and closes the offer", async () => {
    const company = await makeUser("RENTAL_COMPANY");
    const owner = await makeUser("OWNER");
    await makeVehicle(null);
    await makeVehicle(owner.id);
    const q = await quote(company.id, { quantity: 2 });
    const result = await acceptQuote(company.id, q.id, q.revision);
    expect(result).toEqual({ ok: true, bookings: 2 });
    const bookings = await prisma.booking.findMany({ where: { quoteId: q.id }, include: { vehicle: true, history: true } });
    expect(bookings.map((b) => b.vehicleId).sort()).toEqual(q.items.map((i) => i.vehicleId).sort());
    for (const b of bookings) {
      expect(b.status).toBe("CONFIRMED");
      expect(b.totalPrice).toBe(q.items.find((i) => i.vehicleId === b.vehicleId)!.price);
      expect(b.history).toHaveLength(1);
      expect(b.history[0]).toMatchObject({ fromStatus: null, toStatus: "CONFIRMED", changedById: company.id });
      if (b.vehicle.ownerId) expect(b).toMatchObject({ commissionBps: 1500, commissionAmount: 12000, ownerAmount: 68000 });
      else expect(b).toMatchObject({ commissionBps: 0, commissionAmount: 0, ownerAmount: null });
    }
    expect((await reload(q.id)).status).toBe("ACCEPTED");
  });
  it("refuses a version the company did not see, and changes nothing", async () => {
    const company = await makeUser("RENTAL_COMPANY");
    await makeVehicle(null);
    const q = await quote(company.id, { quantity: 1 });
    expect(await acceptQuote(company.id, q.id, 99)).toEqual({ ok: false, code: "STALE_REVISION", revision: 1 });
    expect(await acceptQuote(company.id, q.id, 0)).toEqual({ ok: false, code: "STALE_REVISION", revision: 1 });
    expect(await prisma.booking.count()).toBe(0);
    expect(await reload(q.id)).toMatchObject({ status: "QUOTED", revision: 1 });
  });
  it("when a listed vehicle is taken, confirms nothing, recalculates, raises the revision and needs a new acceptance", async () => {
    const [company, customer] = [await makeUser("RENTAL_COMPANY"), await makeUser("CUSTOMER")];
    const vehicles = [await makeVehicle(null), await makeVehicle(null), await makeVehicle(null), await makeVehicle(null)];
    const q = await quote(company.id, { quantity: 3 });
    const listed = q.items.map((i) => i.vehicleId);
    const spare = vehicles.find((v) => !listed.includes(v.id))!;
    const taken = vehicles.find((v) => v.id === listed[0])!;
    await bookVehicle(customer, taken.id); // somebody else takes one of the listed vehicles

    const result = await acceptQuote(company.id, q.id, 1);
    expect(result).toEqual({ ok: false, code: "OFFER_CHANGED", revision: 2 });
    expect(await prisma.booking.count({ where: { quoteId: q.id } })).toBe(0); // nothing confirmed, not even partially
    const updated = await reload(q.id);
    expect(updated).toMatchObject({ status: "QUOTED", revision: 2, offeredQuantity: 3 });
    expect(updated.items.map((i) => i.vehicleId)).not.toContain(taken.id);
    expect(updated.items.map((i) => i.vehicleId)).toContain(spare.id); // an explicit new list, not a silent substitution
    expect(updated.adminNote).toMatch(/availability changed/i);

    expect((await acceptQuote(company.id, q.id, 1)).ok).toBe(false); // the old version no longer works
    expect(await prisma.booking.count({ where: { quoteId: q.id } })).toBe(0);
    expect(await acceptQuote(company.id, q.id, 2)).toEqual({ ok: true, bookings: 3 });
    const booked = await prisma.booking.findMany({ where: { quoteId: q.id } });
    expect(booked.map((b) => b.vehicleId).sort()).toEqual(updated.items.map((i) => i.vehicleId).sort());
  });
  it("treats a listed vehicle that went into service like a taken one", async () => {
    const [company, admin] = [await makeUser("RENTAL_COMPANY"), await makeUser("ADMIN")];
    await makeVehicle(null);
    await makeVehicle(null);
    const q = await quote(company.id, { quantity: 2 });
    await changeVehicleStatus(admin.id, q.items[0]!.vehicleId, "IN_SERVICE");
    expect(await acceptQuote(company.id, q.id, 1)).toEqual({ ok: false, code: "OFFER_CHANGED", revision: 2 });
    expect((await reload(q.id)).offeredQuantity).toBe(1);
    expect(await prisma.booking.count()).toBe(0);
  });
  it("when nothing is free any more, creates no booking, explains, and closes the offer", async () => {
    const [company, customer] = [await makeUser("RENTAL_COMPANY"), await makeUser("CUSTOMER")];
    const v = await makeVehicle(null);
    const q = await quote(company.id, { quantity: 1 });
    await bookVehicle(customer, v.id);
    expect(await acceptQuote(company.id, q.id, 1)).toEqual({ ok: false, code: "NO_VEHICLES" });
    const updated = await reload(q.id);
    expect(updated).toMatchObject({ status: "DECLINED", offeredQuantity: 0, quotedAmount: null, revision: 2 });
    expect(updated.items).toHaveLength(0);
    expect(updated.adminNote).toMatch(/taken in the meantime/);
    expect(await prisma.booking.count({ where: { quoteId: q.id } })).toBe(0);
  });
  it("recalculates an old offer that has no vehicle list instead of accepting it", async () => {
    const company = await makeUser("RENTAL_COMPANY");
    await makeVehicle(null);
    const legacy = await prisma.quoteRequest.create({
      data: { userId: company.id, vehicleType: "ATV", quantity: 1, startDate: new Date("2030-06-04"), endDate: new Date("2030-06-05"), purpose: "Old offer", contactPhone: "0700000000", status: "QUOTED", offeredQuantity: 1, discountBps: 0, quotedAmount: 80000 },
    });
    expect(legacy.revision).toBe(1);
    expect(await acceptQuote(company.id, legacy.id, 1)).toEqual({ ok: false, code: "OFFER_CHANGED", revision: 2 });
    expect(await prisma.booking.count()).toBe(0);
    expect((await reload(legacy.id)).items).toHaveLength(1);
    expect(await acceptQuote(company.id, legacy.id, 2)).toEqual({ ok: true, bookings: 1 });
  });
  it("honours the accepted prices even if an owner changes the rates afterwards", async () => {
    const [company, owner] = [await makeUser("RENTAL_COMPANY"), await makeUser("OWNER")];
    const v = await makeVehicle(owner.id);
    const q = await quote(company.id, { quantity: 1, start: "2030-06-04", end: "2030-06-04" });
    await prisma.vehicle.update({ where: { id: v.id }, data: { dailyRate: 99999 } });
    await acceptQuote(company.id, q.id, 1);
    expect((await prisma.booking.findFirstOrThrow({ where: { quoteId: q.id } })).totalPrice).toBe(40000);
  });
  it("is refused for other accounts, for an offer that is not open, and for a start in the past", async () => {
    const [company, other, customer] = [await makeUser("RENTAL_COMPANY"), await makeUser("RENTAL_COMPANY"), await makeUser("CUSTOMER")];
    await makeVehicle(null);
    const q = await quote(company.id, { quantity: 1 });
    expect(await acceptQuote(customer.id, q.id, 1)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await acceptQuote(other.id, q.id, 1)).toEqual({ ok: false, code: "NOT_OPEN" }); // somebody else's offer does not exist
    expect(await acceptQuote(company.id, "no-such-offer", 1)).toEqual({ ok: false, code: "NOT_OPEN" });
    expect(await acceptQuote(company.id, q.id, 1)).toMatchObject({ ok: true });
    expect(await acceptQuote(company.id, q.id, 1)).toEqual({ ok: false, code: "NOT_OPEN" }); // cannot be accepted twice
    expect(await prisma.booking.count()).toBe(1);

    const past = await prisma.quoteRequest.create({
      data: { userId: company.id, vehicleType: "ATV", quantity: 1, startDate: new Date("2020-01-01"), endDate: new Date("2020-01-02"), purpose: "Past", contactPhone: "0700000000", status: "QUOTED", offeredQuantity: 1, discountBps: 0, quotedAmount: 1 },
    });
    expect(await acceptQuote(company.id, past.id, 1)).toEqual({ ok: false, code: "START_IN_PAST" });
  });
  it("can be declined by its company only while it is open", async () => {
    const [company, other] = [await makeUser("RENTAL_COMPANY"), await makeUser("RENTAL_COMPANY")];
    await makeVehicle(null);
    const q = await quote(company.id, { quantity: 1 });
    expect(await declineQuote(other.id, q.id)).toEqual({ ok: false });
    expect(await declineQuote(company.id, q.id)).toEqual({ ok: true });
    expect(await declineQuote(company.id, q.id)).toEqual({ ok: false });
    expect(await acceptQuote(company.id, q.id, 1)).toEqual({ ok: false, code: "NOT_OPEN" });
  });
});

describe("acceptQuote under concurrency", () => {
  it("two simultaneous acceptances of the same offer: one wins, no duplicate bookings", async () => {
    for (let round = 0; round < 5; round++) {
      await resetDatabase();
      const company = await makeUser("RENTAL_COMPANY");
      for (let i = 0; i < 3; i++) await makeVehicle(null);
      const q = await quote(company.id, { quantity: 3 });
      const results = await Promise.all([acceptQuote(company.id, q.id, 1), acceptQuote(company.id, q.id, 1), acceptQuote(company.id, q.id, 1)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await prisma.booking.count({ where: { quoteId: q.id } })).toBe(3);
      expect(await prisma.bookingStatusHistory.count()).toBe(3);
    }
  });
  it("an acceptance racing with a customer booking one of the vehicles is all or nothing", async () => {
    for (let round = 0; round < 8; round++) {
      await resetDatabase();
      const [company, customer] = [await makeUser("RENTAL_COMPANY"), await makeUser("CUSTOMER")];
      for (let i = 0; i < 3; i++) await makeVehicle(null);
      const q = await quote(company.id, { quantity: 3 });
      const target = q.items[0]!.vehicleId;
      const [accepted, booked] = await Promise.allSettled([acceptQuote(company.id, q.id, 1), bookVehicle(customer, target)]);
      expect(accepted.status).toBe("fulfilled");
      const quoteBookings = await prisma.booking.count({ where: { quoteId: q.id } });
      expect([0, 3]).toContain(quoteBookings); // never a partial confirmation
      // Whoever won, no vehicle is double booked.
      const overlapping = await prisma.booking.findMany({ where: { vehicleId: target, status: { not: "CANCELLED" } } });
      expect(overlapping.length).toBeLessThanOrEqual(1);
      if (quoteBookings === 3) expect(booked.status).toBe("rejected"); // the customer lost the race
      else expect(await prisma.quoteRequest.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ revision: 2 });
    }
  });
});
