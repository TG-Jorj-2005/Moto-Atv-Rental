import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { localToInstant } from "@/lib/business-time";
import { calculatePrice } from "@/lib/pricing";
import { makeUser, resetDatabase } from "@/test-support/db";
import type { RideDnaAnswers } from "./answers";
import { recommend, resolvePeriod } from "./service";

beforeEach(resetDatabase);

const NOW = new Date("2027-03-01T10:00:00Z");
const answers = (over: Partial<RideDnaAnswers> = {}): RideDnaAnswers => ({ experience: "ADVANCED", licence: "A", adventure: "ROAD_TOURING", priorities: ["COMFORT"], budgetRon: 5000, duration: "ONE_DAY", start: null, passengers: 1, ...over });

let n = 0;
function vehicle(over: Partial<Prisma.VehicleUncheckedCreateInput> = {}) {
  n += 1;
  return prisma.vehicle.create({
    data: { name: `Vehicle ${String(n).padStart(2, "0")}`, type: "MOTORCYCLE", category: "ADVENTURE", plate: `RD-${n}`, hourlyRate: 10_000, dailyRate: 40_000, weekendRate: 70_000, powerHp: 90, engineCc: 700, seats: 2, licenseCategory: "A", listingStatus: "APPROVED", status: "AVAILABLE", ...over },
  });
}
async function booking(vehicleId: string, startAt: Date, endAt: Date, status: "PENDING" | "CONFIRMED" | "CANCELLED" = "CONFIRMED") {
  const c = await prisma.customer.create({ data: { fullName: "Test", email: `c${++n}@test.example`, phone: "0000000" } });
  return prisma.booking.create({ data: { vehicleId, customerId: c.id, startAt, endAt, status, totalPrice: 1000 } });
}
const ids = (r: Awaited<ReturnType<typeof recommend>>) => r.recommendations.map((x) => x.id);

describe("recommend: which vehicles are considered", () => {
  it("looks only at approved vehicles that are not in service and not retired", async () => {
    const ok = await vehicle();
    await vehicle({ status: "IN_SERVICE" });
    await vehicle({ status: "RETIRED" });
    await vehicle({ listingStatus: "PENDING" });
    await vehicle({ listingStatus: "REJECTED" });
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    expect(r.considered).toBe(1);
    expect(ids(r)).toEqual([ok.id]);
  });
  it("returns three distinct vehicles, best first, when there are more than three; fewer when there are fewer; none when none fit", async () => {
    const cats = ["ADVENTURE", "CRUISER", "NAKED_SPORT", "DUAL_SPORT", "ADVENTURE"] as const;
    for (const category of cats) await vehicle({ category });
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    expect(r.recommendations).toHaveLength(3);
    expect(new Set(ids(r)).size).toBe(3);
    const scores = r.recommendations.map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(r.eligible).toBe(5);

    await resetDatabase();
    await vehicle(); await vehicle();
    expect((await recommend(answers(), { currency: "RON", now: NOW })).recommendations).toHaveLength(2);

    await resetDatabase();
    const none = await recommend(answers(), { currency: "RON", now: NOW });
    expect(none).toMatchObject({ considered: 0, eligible: 0, recommendations: [], onlyOverBudget: null });
  });
  it("never recommends a vehicle whose category is not meant for the ride, even when it is the only one", async () => {
    await vehicle({ category: "CRUISER" });
    const r = await recommend(answers({ adventure: "OFFROAD_TRAILS" }), { currency: "RON", now: NOW });
    expect(r.recommendations).toEqual([]);
    expect(r.excluded.NOT_FOR_ADVENTURE).toBe(1);
  });
  it("leaves out the vehicles of the signed-in user", async () => {
    const owner = await makeUser("OWNER");
    const mine = await vehicle({ ownerId: owner.id });
    const other = await vehicle();
    expect(ids(await recommend(answers(), { currency: "RON", now: NOW }))).toEqual(expect.arrayContaining([mine.id, other.id]));
    expect(ids(await recommend(answers(), { currency: "RON", now: NOW, excludeOwnerId: owner.id }))).toEqual([other.id]);
  });
  it("is the same on every run", async () => {
    for (let i = 0; i < 6; i += 1) await vehicle();
    const first = await recommend(answers(), { currency: "RON", now: NOW });
    for (let i = 0; i < 3; i += 1) expect(await recommend(answers(), { currency: "RON", now: NOW })).toEqual(first);
  });
});

describe("recommend: price", () => {
  it("is the price of the pricing function: an estimate on a weekday without dates, exact with dates (weekend rate included)", async () => {
    const v = await vehicle();
    const rates = { hourly: v.hourlyRate, daily: v.dailyRate, weekend: v.weekendRate };
    const est = await recommend(answers({ duration: "WEEKEND" }), { currency: "RON", now: NOW });
    if (est.period.kind !== "ESTIMATE") throw new Error("an estimate was expected");
    expect(est.recommendations[0]!.priceBani).toBe(calculatePrice(est.period.period.startAt, est.period.period.endAt, rates));
    expect(est.recommendations[0]!.priceBani).toBe(2 * 40_000); // a weekday: no weekend rate

    const saturday = { year: 2027, month: 5, day: 8 };
    const exact = await recommend(answers({ duration: "WEEKEND", start: saturday }), { currency: "RON", now: NOW });
    expect(exact.period.kind).toBe("EXACT");
    const start = localToInstant({ ...saturday, hour: 9, minute: 0, second: 0 });
    expect(exact.recommendations[0]!.priceBani).toBe(calculatePrice(start, new Date(start.getTime() + 48 * 3_600_000), rates));
  });
  it("shows the amount in the currency of the page", async () => {
    await vehicle();
    const eur = await recommend(answers(), { currency: "EUR", now: NOW });
    expect(eur.recommendations[0]!.priceLabel).toMatch(/^€/);
  });
  it("applies the budget as a hard limit and says what a higher budget would give", async () => {
    await vehicle({ dailyRate: 40_000 });
    await vehicle({ dailyRate: 60_000 });
    const r = await recommend(answers({ budgetRon: 500 }), { currency: "RON", now: NOW });
    expect(ids(r)).toHaveLength(1);
    expect(r.recommendations[0]!.priceBani).toBe(40_000);
    expect(r.onlyOverBudget).toEqual({ count: 1, cheapestBani: 60_000 });
    const tiny = await recommend(answers({ budgetRon: 50 }), { currency: "RON", now: NOW });
    expect(tiny.recommendations).toEqual([]);
    expect(tiny.onlyOverBudget).toEqual({ count: 2, cheapestBani: 40_000 });
  });
});

describe("recommend: availability for the chosen dates (Europe/Bucharest)", () => {
  const day = { year: 2027, month: 6, day: 10 };
  const start = localToInstant({ ...day, hour: 9, minute: 0, second: 0 });
  const end = new Date(start.getTime() + 24 * 3_600_000);

  it("leaves out a vehicle booked for part of the period and keeps a free one", async () => {
    const booked = await vehicle();
    const free = await vehicle();
    await booking(booked.id, new Date(start.getTime() + 3_600_000), new Date(end.getTime() + 3_600_000));
    const r = await recommend(answers({ start: day }), { currency: "RON", now: NOW });
    expect(ids(r)).toEqual([free.id]);
    expect(r.recommendations[0]!.available).toBe(true);
    expect(r.excluded.UNAVAILABLE).toBe(1);
    expect(r.onlyUnavailable).toBe(1);
  });
  it("treats back-to-back bookings as free (half-open periods) and one millisecond of overlap as busy", async () => {
    const before = await vehicle();
    const after = await vehicle();
    const overlap = await vehicle();
    await booking(before.id, new Date(start.getTime() - 3_600_000), start);
    await booking(after.id, end, new Date(end.getTime() + 3_600_000));
    await booking(overlap.id, new Date(start.getTime() - 3_600_000), new Date(start.getTime() + 1));
    expect(ids(await recommend(answers({ start: day }), { currency: "RON", now: NOW })).sort()).toEqual([before.id, after.id].sort());
  });
  it("ignores cancelled bookings and counts pending ones", async () => {
    const cancelled = await vehicle();
    const pending = await vehicle();
    await booking(cancelled.id, start, end, "CANCELLED");
    await booking(pending.id, start, end, "PENDING");
    expect(ids(await recommend(answers({ start: day }), { currency: "RON", now: NOW }))).toEqual([cancelled.id]);
  });
  it("without dates it does not claim anything about availability", async () => {
    const v = await vehicle();
    await booking(v.id, start, end);
    const r = await recommend(answers(), { currency: "RON", now: NOW });
    expect(r.recommendations[0]!.available).toBeNull();
  });
  it("refuses a start in the past", async () => {
    await vehicle();
    const past = await recommend(answers({ start: { year: 2027, month: 2, day: 1 } }), { currency: "RON", now: NOW });
    expect(past.period).toEqual({ kind: "INVALID", reason: "start_in_past" });
    expect(past.recommendations).toEqual([]);
  });
  it("uses Bucharest time across the spring clock change: 09:00 on 27 March is 07:00Z, the 48 hours end at 07:00Z on 29 March", () => {
    const p = resolvePeriod(answers({ duration: "WEEKEND", start: { year: 2027, month: 3, day: 27 } }), NOW);
    if (p.kind !== "EXACT") throw new Error("exact period expected");
    expect(p.period.startAt.toISOString()).toBe("2027-03-27T07:00:00.000Z");
    expect(p.period.endAt.toISOString()).toBe("2027-03-29T07:00:00.000Z");
  });
});
