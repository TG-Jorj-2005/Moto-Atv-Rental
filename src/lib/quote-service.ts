import { Prisma, type VehicleType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runTransaction } from "@/lib/tx";
import { insertBooking } from "@/lib/booking-service";
import { isStartInFuture } from "@/lib/validators";
import { isVehicleBookable } from "@/lib/booking-rules";
import { discountBpsFor, priceQuote, quoteListPrice, quotePeriod, rankVehicles } from "@/lib/quotes";

// Bulk offers for rental companies.
//
// An offer lists the EXACT vehicles and prices (quote_items) of one version (`revision`). It is not a reservation:
// nothing is held for the company. Accepting names the revision the company saw, re-checks every vehicle atomically
// and creates one CONFIRMED booking per item, all or nothing. If anything changed the offer is recalculated, the
// revision grows and the company must accept the new version explicitly: nothing is ever confirmed partially and no
// vehicle is substituted silently. Offers do not expire on their own.
//
// Lock order (same as everywhere): the user's row, then the quote row, then the vehicles in id order.

type Db = Prisma.TransactionClient | typeof prisma;

type Search = { type: VehicleType; locationId?: string | null; start: Date; end: Date; excludeOwnerId?: string };

// Vehicles that are approved, available and free for the whole period, in allocation order: the platform's own fleet
// first, then owners with the fewest bookings so far.
async function rankedAvailable(db: Db, { type, locationId, start, end, excludeOwnerId }: Search) {
  const vehicles = await db.vehicle.findMany({
    where: {
      type,
      status: "AVAILABLE",
      listingStatus: "APPROVED",
      ...(locationId ? { locationId } : {}),
      ...(excludeOwnerId ? { OR: [{ ownerId: null }, { ownerId: { not: excludeOwnerId } }] } : {}),
      bookings: { none: { status: { not: "CANCELLED" }, startAt: { lt: end }, endAt: { gt: start } } },
    },
    include: { owner: { select: { role: true, commissionBps: true } } },
  });
  const ownerIds = [...new Set(vehicles.map((v) => v.ownerId).filter((id): id is string => !!id))];
  const past = ownerIds.length
    ? await db.booking.findMany({ where: { status: { not: "CANCELLED" }, vehicle: { ownerId: { in: ownerIds } } }, select: { vehicle: { select: { ownerId: true } } } })
    : [];
  const counts = new Map<string, number>();
  for (const b of past) counts.set(b.vehicle.ownerId!, (counts.get(b.vehicle.ownerId!) ?? 0) + 1);
  return rankVehicles(vehicles, counts);
}

type OfferLine = { vehicleId: string; listPrice: number; price: number };
type Offer = { lines: OfferLine[]; discountBps: number; total: number; note: string | null };
type QuoteRequestFacts = { vehicleType: VehicleType; quantity: number; locationId: string | null; startDate: Date; endDate: Date };

// Builds the offer from what is really free right now. It may offer fewer vehicles than requested.
async function buildOffer(db: Db, q: QuoteRequestFacts, companyId: string): Promise<Offer> {
  const { start, end } = quotePeriod(q.startDate, q.endDate);
  const ranked = await rankedAvailable(db, { type: q.vehicleType, locationId: q.locationId, start, end, excludeOwnerId: companyId });
  const picks = ranked.slice(0, q.quantity);
  const discountBps = discountBpsFor(picks.length);
  const listPrices = picks.map((v) => quoteListPrice({ daily: v.dailyRate, weekend: v.weekendRate }, q.startDate, q.endDate));
  const { prices, total } = priceQuote(listPrices, discountBps);
  const note =
    picks.length === 0
      ? "No vehicles of this type are free for these dates."
      : picks.length < q.quantity
        ? `We can offer ${picks.length} of the ${q.quantity} vehicles you asked for.`
        : null;
  return { lines: picks.map((v, i) => ({ vehicleId: v.id, listPrice: listPrices[i]!, price: prices[i]! })), discountBps, total, note };
}

export type QuoteInput = {
  userId: string;
  vehicleType: VehicleType;
  quantity: number;
  startDate: Date;
  endDate: Date;
  purpose: string;
  contactPhone: string;
  locationId?: string;
};

export async function createQuote(input: QuoteInput) {
  const company = await prisma.user.findUnique({ where: { id: input.userId }, select: { role: true } });
  if (company?.role !== "RENTAL_COMPANY") throw new QuoteForbiddenError();
  const offer = await buildOffer(prisma, { ...input, locationId: input.locationId ?? null }, input.userId);
  return prisma.quoteRequest.create({
    data: {
      userId: input.userId,
      vehicleType: input.vehicleType,
      quantity: input.quantity,
      startDate: input.startDate,
      endDate: input.endDate,
      purpose: input.purpose,
      contactPhone: input.contactPhone,
      locationId: input.locationId,
      status: offer.lines.length === 0 ? "DECLINED" : "QUOTED",
      revision: 1,
      offeredQuantity: offer.lines.length,
      discountBps: offer.discountBps,
      quotedAmount: offer.lines.length ? offer.total : null,
      adminNote: offer.note,
      items: { create: offer.lines },
    },
    include: { items: true },
  });
}

export class QuoteForbiddenError extends Error {}

export type AcceptQuoteResult =
  | { ok: true; bookings: number }
  | { ok: false; code: "FORBIDDEN" | "NOT_OPEN" | "START_IN_PAST" }
  | { ok: false; code: "STALE_REVISION" | "OFFER_CHANGED"; revision: number }
  | { ok: false; code: "NO_VEHICLES" };

// Replaces the items with a freshly calculated offer and increments the revision (inside the caller's transaction).
async function recalculate(tx: Prisma.TransactionClient, quote: QuoteRequestFacts & { id: string; userId: string }): Promise<AcceptQuoteResult> {
  const offer = await buildOffer(tx, quote, quote.userId);
  await tx.quoteItem.deleteMany({ where: { quoteId: quote.id } });
  const updated = await tx.quoteRequest.update({
    where: { id: quote.id },
    data: {
      status: offer.lines.length === 0 ? "DECLINED" : "QUOTED",
      revision: { increment: 1 },
      offeredQuantity: offer.lines.length,
      discountBps: offer.discountBps,
      quotedAmount: offer.lines.length ? offer.total : null,
      adminNote: offer.lines.length === 0 ? "The vehicles of this offer were taken in the meantime and no other vehicle is free for these dates." : `The offer was updated because availability changed. ${offer.note ?? ""}`.trim(),
      items: { create: offer.lines },
    },
    select: { revision: true },
  });
  return offer.lines.length === 0 ? { ok: false, code: "NO_VEHICLES" } : { ok: false, code: "OFFER_CHANGED", revision: updated.revision };
}

export async function acceptQuote(userId: string, quoteId: string, revisionSeen: number): Promise<AcceptQuoteResult> {
  return runTransaction(async (tx): Promise<AcceptQuoteResult> => {
    const rows = await tx.$queryRaw<{ id: string; role: string }[]>`SELECT id, role::text AS role FROM users WHERE id = ${userId} FOR UPDATE`;
    if (rows[0]?.role !== "RENTAL_COMPANY") return { ok: false, code: "FORBIDDEN" }; // role read from the database
    await tx.$queryRaw`SELECT id FROM quote_requests WHERE id = ${quoteId} FOR UPDATE`;

    const quote = await tx.quoteRequest.findFirst({ where: { id: quoteId, userId }, include: { items: true, user: true } });
    if (!quote || quote.status !== "QUOTED") return { ok: false, code: "NOT_OPEN" };
    // The company must accept the version it was shown. Nothing is changed if it is an old one.
    if (quote.revision !== revisionSeen) return { ok: false, code: "STALE_REVISION", revision: quote.revision };

    const { start, end } = quotePeriod(quote.startDate, quote.endDate);
    if (!isStartInFuture(start)) return { ok: false, code: "START_IN_PAST" };
    // Offers made before quote_items existed have no vehicle list: they are recalculated before they can be accepted.
    if (quote.items.length === 0) return recalculate(tx, quote);

    const ids = quote.items.map((i) => i.vehicleId).sort();
    await tx.$queryRaw`SELECT id FROM vehicles WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    const [vehicles, taken] = await Promise.all([
      tx.vehicle.findMany({ where: { id: { in: ids } }, include: { owner: { select: { role: true, commissionBps: true } } } }),
      tx.booking.findMany({
        where: { vehicleId: { in: ids }, status: { not: "CANCELLED" }, startAt: { lt: end }, endAt: { gt: start } },
        select: { vehicleId: true },
      }),
    ]);
    const takenIds = new Set(taken.map((b) => b.vehicleId));
    const usable = vehicles.filter((v) => isVehicleBookable(v) && v.ownerId !== userId && !takenIds.has(v.id));
    if (usable.length !== ids.length) return recalculate(tx, quote);

    const customer = await tx.customer.upsert({
      where: { email: quote.user.email },
      update: {},
      create: { email: quote.user.email, fullName: quote.user.name || quote.user.email, phone: quote.contactPhone || "n/a" },
    });
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    for (const item of quote.items) {
      const v = byId.get(item.vehicleId)!;
      await insertBooking(tx, {
        vehicle: { id: v.id, locationId: v.locationId, owner: v.owner },
        customerId: customer.id,
        userId,
        quoteId: quote.id,
        startAt: start,
        endAt: end,
        totalPrice: item.price, // the price the company accepted, even if the owner changed the rates since
        status: "CONFIRMED",
        actorId: userId,
        note: `created by accepting offer revision ${quote.revision}`,
      });
    }
    await tx.quoteRequest.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    return { ok: true, bookings: quote.items.length };
  });
}

export async function declineQuote(userId: string, quoteId: string) {
  const company = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (company?.role !== "RENTAL_COMPANY") return { ok: false as const };
  const result = await prisma.quoteRequest.updateMany({ where: { id: quoteId, userId, status: "QUOTED" }, data: { status: "DECLINED" } });
  return { ok: result.count === 1 };
}
