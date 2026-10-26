import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking-service";
import { makeUser, resetDatabase } from "@/test-support/db";
import type { RideDnaAnswers } from "./answers";
import { recommend } from "./service";

// What RideDNA shows and what the normal booking then does must agree, and the booking must keep every protection it has.

beforeEach(resetDatabase);

const NOW = new Date("2027-03-01T10:00:00Z");
const answers = (over: Partial<RideDnaAnswers> = {}): RideDnaAnswers => ({ experience: "ADVANCED", licence: "A", adventure: "ROAD_TOURING", priorities: ["COMFORT"], budgetRon: 5000, duration: "WEEKEND", start: { year: 2027, month: 5, day: 8 }, passengers: 1, ...over });

let n = 0;
function vehicle(over: Partial<Prisma.VehicleUncheckedCreateInput> = {}) {
  n += 1;
  return prisma.vehicle.create({ data: { name: `Handoff ${n}`, type: "MOTORCYCLE", category: "ADVENTURE", plate: `HO-${n}`, hourlyRate: 10_000, dailyRate: 40_000, weekendRate: 70_000, powerHp: 90, seats: 2, licenseCategory: "A", ...over } });
}
const input = (r: Awaited<ReturnType<typeof recommend>>, email: string) => {
  if (r.period.kind !== "EXACT") throw new Error("exact period expected");
  return { startAt: r.period.period.startAt, endAt: r.period.period.endAt, customer: { fullName: "Rider", email, phone: "0700000000" } };
};

describe("from the recommendation to the booking", () => {
  it("the price shown is the price the booking stores (two started days at the daily rate: 09:00 plus 48 hours does not fit in the weekend window)", async () => {
    const user = await makeUser("CUSTOMER");
    const v = await vehicle();
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]!.priceBani).toBe(80_000); // 2 x 40 000: the weekend rate needs the rental to end by Monday 00:00
    const booked = await createBooking(user.id, { vehicleId: v.id, ...input(r, user.email) }, NOW);
    expect(booked).toMatchObject({ ok: true, booking: { status: "PENDING", totalPrice: 80_000 } });
  });

  it("a vehicle taken by someone else after the recommendation is refused by the booking (CONFLICT) and is no longer recommended", async () => {
    const [first, second] = [await makeUser("CUSTOMER"), await makeUser("CUSTOMER")];
    const v = await vehicle();
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    expect(r.recommendations.map((x) => x.id)).toEqual([v.id]);
    expect(await createBooking(first.id, { vehicleId: v.id, ...input(r, first.email) }, NOW)).toMatchObject({ ok: true });
    // the second user still holds the old recommendation
    expect(await createBooking(second.id, { vehicleId: v.id, ...input(r, second.email) }, NOW)).toEqual({ ok: false, code: "CONFLICT" });
    const again = await recommend(answers(), { currency: "RON", now: NOW });
    expect(again.recommendations).toEqual([]);
    expect(again.onlyUnavailable).toBe(1);
    expect(await prisma.booking.count({ where: { vehicleId: v.id, status: { not: "CANCELLED" } } })).toBe(1);
  });

  it("two people choosing the same recommended vehicle at the same moment: exactly one booking", async () => {
    const users = await Promise.all([makeUser("CUSTOMER"), makeUser("CUSTOMER"), makeUser("CUSTOMER"), makeUser("CUSTOMER")]);
    const v = await vehicle();
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    const results = await Promise.all(users.map((u) => createBooking(u.id, { vehicleId: v.id, ...input(r, u.email) }, NOW)));
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.filter((x) => !x.ok).every((x) => !x.ok && x.code === "CONFLICT")).toBe(true);
    expect(await prisma.booking.count({ where: { vehicleId: v.id } })).toBe(1);
  });

  it("a vehicle put in service after the recommendation cannot be booked, and the recommendation drops it", async () => {
    const user = await makeUser("CUSTOMER");
    const v = await vehicle();
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    await prisma.vehicle.update({ where: { id: v.id }, data: { status: "IN_SERVICE" } });
    expect(await createBooking(user.id, { vehicleId: v.id, ...input(r, user.email) }, NOW)).toEqual({ ok: false, code: "VEHICLE_UNAVAILABLE" });
    expect((await recommend(answers(), { currency: "RON", now: NOW })).recommendations).toEqual([]);
  });

  it("an owner is never offered, and cannot book, their own vehicle; an administrator cannot book at all", async () => {
    const owner = await makeUser("OWNER");
    const admin = await makeUser("ADMIN");
    const v = await vehicle({ ownerId: owner.id });
    const r = await recommend(answers(), { currency: "RON", now: NOW, excludeOwnerId: owner.id });
    expect(r.recommendations).toEqual([]);
    const open = await recommend(answers(), { currency: "RON", now: NOW });
    expect(await createBooking(owner.id, { vehicleId: v.id, ...input(open, owner.email) }, NOW)).toEqual({ ok: false, code: "OWN_VEHICLE" });
    expect(await createBooking(admin.id, { vehicleId: v.id, ...input(open, admin.email) }, NOW)).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("the booking recalculates the price on the server: the recommendation cannot dictate it", async () => {
    const user = await makeUser("CUSTOMER");
    const v = await vehicle();
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    await prisma.vehicle.update({ where: { id: v.id }, data: { dailyRate: 50_000 } }); // the rates change after the recommendation
    const booked = await createBooking(user.id, { vehicleId: v.id, ...input(r, user.email) }, NOW);
    expect(booked).toMatchObject({ ok: true, booking: { totalPrice: 100_000 } });
    expect(r.recommendations[0]!.priceBani).toBe(80_000);
  });

  it("across the autumn clock change the period RideDNA checked is the instant period that is booked", async () => {
    const user = await makeUser("CUSTOMER");
    const v = await vehicle();
    const r = await recommend(answers({ start: { year: 2027, month: 10, day: 30 }, duration: "WEEKEND" }), { currency: "RON", now: NOW });
    const period = input(r, user.email);
    expect(period.startAt.toISOString()).toBe("2027-10-30T06:00:00.000Z"); // 09:00 Bucharest (UTC+3)
    expect(period.endAt.toISOString()).toBe("2027-11-01T06:00:00.000Z"); // 48 hours later, 08:00 local after the change (UTC+2)
    const booked = await createBooking(user.id, { vehicleId: v.id, ...period }, NOW);
    expect(booked).toMatchObject({ ok: true });
    const row = await prisma.booking.findFirstOrThrow({ where: { vehicleId: v.id } });
    expect(row.startAt.toISOString()).toBe(period.startAt.toISOString());
    expect(row.endAt.toISOString()).toBe(period.endAt.toISOString());
  });
});
