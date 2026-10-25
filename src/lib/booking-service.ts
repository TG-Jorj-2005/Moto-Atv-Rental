import { Prisma, type BookingStatus, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runTransaction } from "@/lib/tx";
import { calculatePrice } from "@/lib/pricing";
import { canRent } from "@/lib/roles";
import { snapshotFor, type VehicleOwner } from "@/lib/commission";
import { isStartInFuture } from "@/lib/validators";
import { cleanReason, evaluateTransition, isVehicleBookable, MAX_PENDING_PER_USER, type TransitionDenial } from "@/lib/booking-rules";

// All writes to bookings go through this module, so every booking gets its commission snapshot at creation and every
// status change gets its history row in the SAME transaction. The role of the person acting is always read from the
// database here, never taken from the caller.

type Db = Prisma.TransactionClient;

const OVERLAP_CONSTRAINT = "booking_no_overlap"; // exclusion constraint, see prisma/sql/booking_no_overlap.sql

const isOverlapViolation = (e: unknown) => e instanceof Error && e.message.includes(OVERLAP_CONSTRAINT);
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ---------------------------------------------------------------------------------------------------------------
// Creation

export type CreateBookingInput = {
  vehicleId: string;
  startAt: Date;
  endAt: Date;
  customer: { fullName: string; email: string; phone: string };
};

export type CreateBookingFailure =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "EMAIL_MISMATCH"
  | "START_IN_PAST"
  | "VEHICLE_UNAVAILABLE"
  | "OWN_VEHICLE"
  | "PENDING_LIMIT"
  | "CONFLICT";

export type CreateBookingResult =
  | { ok: true; booking: { id: string; startAt: Date; endAt: Date; totalPrice: number; status: BookingStatus } }
  | { ok: false; code: CreateBookingFailure };

type BookingRecordParams = {
  vehicle: { id: string; locationId: string | null; owner: VehicleOwner | null };
  customerId: string;
  userId: string;
  quoteId?: string;
  startAt: Date;
  endAt: Date;
  totalPrice: number;
  status: "PENDING" | "CONFIRMED";
  actorId: string;
  note?: string;
};

// The one place where a booking row is inserted: snapshot of the commission + creation row of the history.
export async function insertBooking(tx: Db, p: BookingRecordParams) {
  const snapshot = snapshotFor(p.totalPrice, p.vehicle.owner);
  const booking = await tx.booking.create({
    data: {
      vehicleId: p.vehicle.id,
      customerId: p.customerId,
      userId: p.userId,
      quoteId: p.quoteId,
      locationId: p.vehicle.locationId,
      startAt: p.startAt,
      endAt: p.endAt,
      totalPrice: p.totalPrice,
      status: p.status,
      commissionBps: snapshot.commissionBps,
      commissionAmount: snapshot.commissionAmount,
      ownerAmount: snapshot.ownerAmount,
    },
    select: { id: true, startAt: true, endAt: true, totalPrice: true, status: true },
  });
  await tx.bookingStatusHistory.create({
    data: { bookingId: booking.id, fromStatus: null, toStatus: p.status, changedById: p.actorId, note: p.note ?? null },
  });
  return booking;
}

export async function createBooking(actorId: string, input: CreateBookingInput, now: Date = new Date()): Promise<CreateBookingResult> {
  try {
    return await runTransaction(async (tx): Promise<CreateBookingResult> => {
      // Lock the user's row: concurrent requests of the same user are serialized, so the PENDING limit below
      // cannot be exceeded by two requests that both counted before either inserted.
      const rows = await tx.$queryRaw<{ id: string; role: Role; email: string }[]>`
        SELECT id, role::text AS role, email FROM users WHERE id = ${actorId} FOR UPDATE`;
      const me = rows[0];
      if (!me) return { ok: false, code: "UNAUTHENTICATED" };
      if (!canRent(me.role)) return { ok: false, code: "FORBIDDEN" };
      if (input.customer.email.trim().toLowerCase() !== me.email.toLowerCase()) return { ok: false, code: "EMAIL_MISMATCH" };
      if (!isStartInFuture(input.startAt, now)) return { ok: false, code: "START_IN_PAST" };

      // Lock order everywhere: users first, then vehicles. Locking the vehicle serializes the bookings of the same
      // vehicle, so a lost race ends as a clean exclusion-constraint violation (CONFLICT) instead of a deadlock, and
      // the vehicle facts below are read after any concurrent change of its status has committed.
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${input.vehicleId} FOR UPDATE`;
      const vehicle = await tx.vehicle.findUnique({
        where: { id: input.vehicleId },
        include: { owner: { select: { role: true, commissionBps: true } } },
      });
      if (!vehicle || !isVehicleBookable(vehicle)) return { ok: false, code: "VEHICLE_UNAVAILABLE" };
      if (vehicle.ownerId === me.id) return { ok: false, code: "OWN_VEHICLE" };

      const pending = await tx.booking.count({ where: { userId: me.id, status: "PENDING" } });
      if (pending >= MAX_PENDING_PER_USER) return { ok: false, code: "PENDING_LIMIT" };

      const totalPrice = calculatePrice(input.startAt, input.endAt, {
        hourly: vehicle.hourlyRate,
        daily: vehicle.dailyRate,
        weekend: vehicle.weekendRate,
      });
      const customer = await tx.customer.upsert({
        where: { email: me.email.toLowerCase() },
        update: { fullName: input.customer.fullName, phone: input.customer.phone },
        create: { email: me.email.toLowerCase(), fullName: input.customer.fullName, phone: input.customer.phone },
      });
      // No availability pre-check: the exclusion constraint is the single source of truth.
      const booking = await insertBooking(tx, {
        vehicle: { id: vehicle.id, locationId: vehicle.locationId, owner: vehicle.owner },
        customerId: customer.id,
        userId: me.id,
        startAt: input.startAt,
        endAt: input.endAt,
        totalPrice,
        status: "PENDING",
        actorId: me.id,
      });
      return { ok: true, booking };
    });
  } catch (error) {
    if (isOverlapViolation(error)) return { ok: false, code: "CONFLICT" };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Status changes

export type TransitionOptions = { reason?: string | null; now?: Date };

export type TransitionResult =
  | { ok: true; status: BookingStatus; warnings: { unpaidBani?: number } }
  | { ok: false; code: TransitionDenial | "NOT_FOUND" | "CONFLICT_STATE" };

export async function transitionBooking(actorId: string, bookingId: string, to: BookingStatus, options: TransitionOptions = {}): Promise<TransitionResult> {
  const now = options.now ?? new Date();
  try {
    return await runTransaction(async (tx): Promise<TransitionResult> => {
      const head = await tx.booking.findUnique({ where: { id: bookingId }, select: { vehicleId: true } });
      if (!head) return { ok: false, code: "NOT_FOUND" };
      // Serialize everything that concerns this vehicle (other transitions, admin status changes).
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${head.vehicleId} FOR UPDATE`;

      const [actor, booking] = await Promise.all([
        tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } }),
        tx.booking.findUnique({
          where: { id: bookingId },
          select: {
            id: true, status: true, userId: true, startAt: true, endAt: true, vehicleId: true, totalPrice: true,
            vehicle: { select: { status: true, listingStatus: true } },
          },
        }),
      ]);
      if (!actor || !booking) return { ok: false, code: "NOT_FOUND" };
      // Somebody else's booking does not exist for a non-admin.
      if (actor.role !== "ADMIN" && booking.userId !== actor.id) return { ok: false, code: "NOT_FOUND" };

      const [otherActive, overlapping] = await Promise.all([
        tx.booking.count({ where: { vehicleId: booking.vehicleId, status: "ACTIVE", id: { not: booking.id } } }),
        tx.booking.count({
          where: { vehicleId: booking.vehicleId, id: { not: booking.id }, status: { not: "CANCELLED" }, startAt: { lt: booking.endAt }, endAt: { gt: booking.startAt } },
        }),
      ]);

      const verdict = evaluateTransition({
        from: booking.status,
        to,
        actor: { id: actor.id, role: actor.role },
        bookingUserId: booking.userId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        now,
        reason: options.reason,
        vehicle: booking.vehicle,
        otherActiveOnVehicle: otherActive > 0,
        overlappingOnVehicle: overlapping > 0,
      });
      if (!verdict.ok) return { ok: false, code: verdict.code };

      // Conditional update: it only succeeds if the booking is still in the status we judged above.
      const updated = await tx.booking.updateMany({
        where: { id: booking.id, status: booking.status },
        data: { status: to, ...(to === "COMPLETED" ? { completedAt: now } : {}) },
      });
      if (updated.count !== 1) return { ok: false, code: "CONFLICT_STATE" };

      await tx.bookingStatusHistory.create({
        data: { bookingId: booking.id, fromStatus: booking.status, toStatus: to, changedById: actor.id, note: cleanReason(options.reason) },
      });

      const warnings: { unpaidBani?: number } = {};
      if (to === "COMPLETED") {
        const paid = await tx.payment.aggregate({ where: { bookingId: booking.id }, _sum: { amount: true } });
        const unpaid = booking.totalPrice - (paid._sum.amount ?? 0);
        if (unpaid > 0) warnings.unpaidBani = unpaid;
      }
      return { ok: true, status: to, warnings };
    });
  } catch (error) {
    // The partial unique index "one ACTIVE booking per vehicle" is the last line of defence.
    if (to === "ACTIVE" && isUniqueViolation(error)) return { ok: false, code: "VEHICLE_BUSY" };
    throw error;
  }
}

export function listHistory(bookingId: string) {
  return prisma.bookingStatusHistory.findMany({
    where: { bookingId },
    orderBy: { changedAt: "asc" },
    include: { changedBy: { select: { name: true, email: true, role: true } } },
  });
}
