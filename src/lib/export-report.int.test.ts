import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { completedBookingsCsv, parseExportRange } from "@/lib/export-report";
import { makeBooking, makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

function range(from: string | null, to: string | null) {
  const r = parseExportRange(from, to);
  if (r.error !== undefined) throw new Error(r.error);
  return r;
}
const bookingIds = (csv: string) => csv.replace(/^﻿/, "").trim().split("\n").slice(1).map((l) => l.split(",")[0]!);

async function completedAt(vehicleId: string, at: string) {
  const b = await makeBooking(vehicleId, "COMPLETED");
  await prisma.booking.update({ where: { id: b.id }, data: { completedAt: new Date(at) } });
  return b.id;
}

describe("completedBookingsCsv", () => {
  it("cuts the days exactly at Bucharest midnight, in winter (UTC+2) and in summer (UTC+3)", async () => {
    const owner = await makeUser("OWNER");
    const v = await makeVehicle(owner.id);
    const winterLast = await completedAt(v.id, "2026-12-31T21:59:59.999Z"); // 23:59:59.999 on 31 Dec in Bucharest
    const winterFirst = await completedAt(v.id, "2026-12-31T22:00:00.000Z"); // 00:00:00 on 1 Jan
    const winterEnd = await completedAt(v.id, "2027-01-01T21:59:59.999Z"); // last millisecond of 1 Jan
    const winterNext = await completedAt(v.id, "2027-01-01T22:00:00.000Z"); // 00:00 on 2 Jan
    expect(bookingIds(await completedBookingsCsv(range("2027-01-01", "2027-01-01")))).toEqual(expect.arrayContaining([winterFirst, winterEnd]));
    expect(bookingIds(await completedBookingsCsv(range("2027-01-01", "2027-01-01"))).sort()).toEqual([winterFirst, winterEnd].sort());
    expect(bookingIds(await completedBookingsCsv(range("2026-12-31", "2026-12-31")))).toEqual(expect.arrayContaining([winterLast]));
    expect(bookingIds(await completedBookingsCsv(range("2027-01-02", null)))).toEqual([winterNext]);

    const summerLast = await completedAt(v.id, "2026-06-30T20:59:59.999Z"); // 23:59:59.999 on 30 Jun, UTC+3
    const summerFirst = await completedAt(v.id, "2026-06-30T21:00:00.000Z"); // 00:00 on 1 Jul
    expect(bookingIds(await completedBookingsCsv(range("2026-07-01", "2026-07-01")))).toEqual([summerFirst]);
    expect(bookingIds(await completedBookingsCsv(range(null, "2026-06-30")))).toEqual([summerLast]);
  });

  it("includes bookings made on the day of the 23-hour spring clock change and the 25-hour autumn one", async () => {
    const owner = await makeUser("OWNER");
    const v = await makeVehicle(owner.id);
    const springIn = await completedAt(v.id, "2027-03-28T20:59:59.999Z"); // 23:59:59.999 on 28 Mar (UTC+3 after the change)
    const springOut = await completedAt(v.id, "2027-03-28T21:00:00.000Z"); // 00:00 on 29 Mar
    expect(bookingIds(await completedBookingsCsv(range("2027-03-28", "2027-03-28")))).toEqual([springIn]);
    expect(bookingIds(await completedBookingsCsv(range("2027-03-29", "2027-03-29")))).toEqual([springOut]);
    const autumnIn = await completedAt(v.id, "2026-10-25T21:59:59.999Z"); // 23:59:59.999 on 25 Oct (UTC+2 after the change)
    const autumnOut = await completedAt(v.id, "2026-10-25T22:00:00.000Z");
    expect(bookingIds(await completedBookingsCsv(range("2026-10-25", "2026-10-25")))).toEqual([autumnIn]);
    expect(bookingIds(await completedBookingsCsv(range("2026-10-26", "2026-10-26")))).toEqual([autumnOut]);
  });

  it("exports only completed bookings and, for a provider, only the bookings of that provider's vehicles", async () => {
    const [a, b] = [await makeUser("OWNER", { name: "Owner A" }), await makeUser("RENTAL_COMPANY", { name: "Company B" })];
    const [va, vb, vp] = [await makeVehicle(a.id), await makeVehicle(b.id), await makeVehicle(null)];
    const done = [await completedAt(va.id, "2027-02-01T10:00:00Z"), await completedAt(vb.id, "2027-02-01T11:00:00Z"), await completedAt(vp.id, "2027-02-01T12:00:00Z")];
    await makeBooking(va.id, "PENDING");
    await makeBooking(va.id, "CANCELLED");
    const open = { from: null, toExclusive: null };
    expect(bookingIds(await completedBookingsCsv(open)).sort()).toEqual([...done].sort());
    expect(bookingIds(await completedBookingsCsv(open, a.id))).toEqual([done[0]]);
    expect(bookingIds(await completedBookingsCsv(open, b.id))).toEqual([done[1]]);
    expect(bookingIds(await completedBookingsCsv(open, "someone-else"))).toEqual([]);
  });

  it("writes UTF-8 with a BOM, the header, exact money and the commission snapshot, and neutralizes formulas", async () => {
    const owner = await makeUser("OWNER", { name: "Ștefan Țicu" });
    const v = await prisma.vehicle.create({ data: { name: "=SUM(A1)", type: "ATV", plate: "X-1", hourlyRate: 100, dailyRate: 100, ownerId: owner.id } });
    const b = await makeBooking(v.id, "COMPLETED", { totalPrice: 9999, ownerAmount: 8499 });
    await prisma.booking.update({ where: { id: b.id }, data: { completedAt: new Date("2027-01-15T10:00:00Z"), commissionBps: 1500, commissionAmount: 1500 } });
    const csv = await completedBookingsCsv({ from: null, toExclusive: null });
    expect(csv.startsWith("﻿booking,vehicle,plate,offered_by,start_bucharest,end_bucharest,completed_bucharest,charged_ron,commission_percent,commission_ron,owner_share_ron\n")).toBe(true);
    const row = csv.trim().split("\n")[1]!;
    expect(row).toContain(",'=SUM(A1),X-1,Ștefan Țicu,");
    expect(row.endsWith(",2027-01-15 12:00,99.99,15.00,15.00,84.99")).toBe(true);
  });
});
