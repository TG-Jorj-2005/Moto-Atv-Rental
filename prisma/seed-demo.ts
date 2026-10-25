// OPTIONAL DEMONSTRATION DATA (SEED_DEMO_USERS=true): a customer, an owner and a rental company with vehicles,
// bookings in every status, maintenance records, a payout and an open offer. All names, e-mails, phone numbers and
// prices are fictional. The accounts use the password given in DEMO_PASSWORD (it is not stored anywhere in the code).
// Bookings are created through the same services as the application, so snapshots and history are real.
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, localDateOf, localToInstant } from "../src/lib/business-time";
import { createBooking, transitionBooking } from "../src/lib/booking-service";
import { createQuote } from "../src/lib/quote-service";
import { recordMaintenance } from "../src/lib/maintenance-service";
import { changeVehicleStatus, moderateListing } from "../src/lib/vehicle-service";

export async function seedDemoAccounts(prisma: PrismaClient, locationIds: Record<string, string>) {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error("DEMO_PASSWORD (at least 8 characters) is required when SEED_DEMO_USERS=true");
  if (await prisma.user.findUnique({ where: { email: "demo.customer@example.com" } })) {
    console.log("Demo accounts already exist: nothing to do.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const mk = (email: string, name: string, role: "CUSTOMER" | "OWNER" | "RENTAL_COMPANY", commissionBps?: number) =>
    prisma.user.create({ data: { email, name, role, passwordHash, commissionBps } });
  const customer = await mk("demo.customer@example.com", "Demo Customer", "CUSTOMER");
  const customer2 = await mk("demo.customer2@example.com", "Demo Customer Two", "CUSTOMER");
  const owner = await mk("demo.owner@example.com", "Demo Owner", "OWNER");
  const company = await mk("demo.company@example.com", "Demo Trails SRL", "RENTAL_COMPANY", 800);

  const today = localDateOf(new Date());
  const at = (dayOffset: number, hour: number, minute = 0) => localToInstant({ ...addDays(today, dayOffset), hour, minute, second: 0 });
  const note = "Demo listing: demonstration data.";
  const veh = (ownerId: string, name: string, plate: string, type: "ATV" | "MOTORCYCLE", daily: number, loc: string, photo: string, extra: Record<string, unknown> = {}) =>
    prisma.vehicle.create({
      data: { name, plate, type, ownerId, hourlyRate: Math.round(daily / 4), dailyRate: daily, weekendRate: Math.round(daily * 1.7), description: note, locationId: locationIds[loc], year: 2022, seats: 2, engineCc: type === "ATV" ? 450 : 300, powerHp: type === "ATV" ? 35 : 28,
        photos: { create: [{ path: photo, position: 0 }] }, listingStatus: "APPROVED", ...extra },
    });
  const ownerAtv = await veh(owner.id, "Honda TRX 420 (demo owner)", "DM-01-ATV", "ATV", 42000, "Cluj Hills", "/gallery/g2.jpg");
  await veh(owner.id, "Yamaha YFZ450R (demo owner)", "DM-02-ATV", "ATV", 52000, "Cluj Hills", "/gallery/g6.jpg", { listingStatus: "PENDING" });
  await veh(owner.id, "Kawasaki KLX 230 (demo owner)", "DM-03-MOT", "MOTORCYCLE", 38000, "Cluj Hills", "/gallery/g3.jpg", { listingStatus: "REJECTED" });
  const c1 = await veh(company.id, "Can-Am Renegade 650 (demo company)", "DT-01-ATV", "ATV", 56000, "Brasov Mountain Base", "/gallery/g1.jpg");
  const c2 = await veh(company.id, "Polaris Scrambler 850 (demo company)", "DT-02-ATV", "ATV", 62000, "Brasov Mountain Base", "/gallery/g2.jpg");
  const c3 = await veh(company.id, "Honda CRF 450L (demo company)", "DT-03-MOT", "MOTORCYCLE", 54000, "Brasov Mountain Base", "/gallery/g3.jpg");
  const c4 = await veh(company.id, "Beta RR 300 (demo company)", "DT-04-MOT", "MOTORCYCLE", 48000, "Brasov Mountain Base", "/gallery/g3.jpg");
  const platform = await prisma.vehicle.findMany({ where: { ownerId: null }, orderBy: { plate: "asc" } });
  const byPlate = (p: string) => platform.find((v) => v.plate === p)!;
  const grizzly = byPlate("GL-01-ATV");
  const outlander = byPlate("GL-02-ATV");
  const honda = byPlate("GL-03-MOT");
  const tenere = byPlate("TM-08-MOT");
  const polaris = byPlate("BV-05-ATV");

  // Maintenance: valid, due soon, overdue and missing documents, so the warnings have something to show.
  const rec = (vehicleId: string, type: "ITP" | "RCA" | "SERVICE", doneDaysAgo: number, dueInDays: number | null) =>
    recordMaintenance(admin.id, vehicleId, { type, performedAt: at(-doneDaysAgo, 12), nextDueAt: dueInDays === null ? null : at(dueInDays, 0), notes: "Demo record" });
  for (const v of [grizzly, outlander, honda, polaris, ownerAtv, c1, c2, c3]) {
    await rec(v.id, "ITP", 200, 300);
    await rec(v.id, "RCA", 100, 265);
  }
  await rec(tenere.id, "ITP", 700, -12); // overdue
  await rec(tenere.id, "RCA", 300, 18); // due soon
  await rec(c4.id, "SERVICE", 400, -3); // service overdue; ITP/RCA missing
  await rec(grizzly.id, "SERVICE", 60, 22); // due soon

  type Who = { id: string; email: string; name: string };
  const book = async (who: Who, vehicleId: string, startDay: number, startHour: number, days: number) => {
    const startAt = at(startDay, startHour);
    const endAt = at(startDay + days, startHour);
    const r = await createBooking(who.id, { vehicleId, startAt, endAt, customer: { fullName: who.name, email: who.email, phone: "+40 000 000 000" } }, new Date(startAt.getTime() - 3 * 86_400_000));
    if (!r.ok) throw new Error(`demo booking failed: ${r.code}`);
    return { id: r.booking.id, startAt, endAt, total: r.booking.totalPrice };
  };
  const go = async (actor: Who | { id: string }, id: string, to: "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED", now: Date, reason?: string) => {
    const r = await transitionBooking(actor.id, id, to, { now, reason });
    if (!r.ok) throw new Error(`demo transition ${to} failed: ${r.code}`);
  };
  const pay = (bookingId: string, amount: number) => prisma.payment.create({ data: { bookingId, amount, method: "CASH" } });
  const HOUR = 3_600_000;

  // Completed in the past: one platform vehicle (0% commission), one owner vehicle (15%), one company vehicle (8%).
  const a = await book(customer, grizzly.id, -20, 10, 2);
  await go(admin, a.id, "CONFIRMED", new Date(a.startAt.getTime() - 86_400_000));
  await go(admin, a.id, "ACTIVE", new Date(a.startAt.getTime() + 10 * 60_000));
  await go(admin, a.id, "COMPLETED", new Date(a.endAt.getTime() + HOUR));
  await pay(a.id, a.total);
  const b = await book(customer, ownerAtv.id, -10, 9, 1);
  await go(admin, b.id, "CONFIRMED", new Date(b.startAt.getTime() - 86_400_000));
  await go(admin, b.id, "ACTIVE", new Date(b.startAt.getTime() + 5 * 60_000));
  await go(admin, b.id, "COMPLETED", new Date(b.endAt.getTime() + HOUR));
  await pay(b.id, Math.round(b.total / 2)); // half paid: completed with a balance
  const c = await book(customer2, c1.id, -14, 11, 3);
  await go(admin, c.id, "CONFIRMED", new Date(c.startAt.getTime() - 86_400_000));
  await go(admin, c.id, "ACTIVE", new Date(c.startAt.getTime() + 20 * 60_000));
  await go(admin, c.id, "COMPLETED", new Date(c.endAt.getTime() + HOUR));
  await pay(c.id, c.total);
  await prisma.payout.create({ data: { ownerId: owner.id, amount: 20000, note: "Demo payout" } });

  // In progress now, overdue return, delayed handover, upcoming, pending and cancelled.
  const live = await book(customer, outlander.id, -1, 10, 2);
  await go(admin, live.id, "CONFIRMED", new Date(live.startAt.getTime() - 86_400_000));
  await go(admin, live.id, "ACTIVE", new Date(live.startAt.getTime() + 10 * 60_000));
  const overdue = await book(customer2, honda.id, -4, 9, 2);
  await go(admin, overdue.id, "CONFIRMED", new Date(overdue.startAt.getTime() - 86_400_000));
  await go(admin, overdue.id, "ACTIVE", new Date(overdue.startAt.getTime() + 5 * 60_000));
  const delayedStart = new Date(Date.now() - 3 * HOUR);
  const delayed = await createBooking(customer2.id, { vehicleId: polaris.id, startAt: delayedStart, endAt: new Date(delayedStart.getTime() + 48 * HOUR), customer: { fullName: customer2.name, email: customer2.email, phone: "+40 000 000 000" } }, new Date(delayedStart.getTime() - 3 * 86_400_000));
  if (!delayed.ok) throw new Error(delayed.code);
  await go(admin, delayed.booking.id, "CONFIRMED", new Date(delayedStart.getTime() - 86_400_000));
  const upcoming = await book(customer, polaris.id, 6, 10, 2);
  await go(admin, upcoming.id, "CONFIRMED", new Date());
  await book(customer, ownerAtv.id, 12, 9, 1); // pending
  await book(customer2, c2.id, 9, 10, 2); // pending
  const cancelled = await book(customer, grizzly.id, 8, 10, 1);
  await go(customer, cancelled.id, "CANCELLED", new Date(), "Change of plans");
  const forCompany = await book(customer, c3.id, 3, 10, 1);
  await go(admin, forCompany.id, "CONFIRMED", new Date());

  // An open bulk offer for the company, and one vehicle in service.
  await createQuote({ userId: company.id, vehicleType: "ATV", quantity: 4, startDate: new Date(Date.UTC(today.year, today.month - 1, today.day + 30)), endDate: new Date(Date.UTC(today.year, today.month - 1, today.day + 32)), purpose: "Demo team-building weekend", contactPhone: "+40 000 000 000" });
  await changeVehicleStatus(admin.id, c4.id, "IN_SERVICE");
  await moderateListing(admin.id, ownerAtv.id, "APPROVED");
  console.log("Demo accounts created: demo.customer@example.com, demo.customer2@example.com, demo.owner@example.com, demo.company@example.com (password = DEMO_PASSWORD).");
}
