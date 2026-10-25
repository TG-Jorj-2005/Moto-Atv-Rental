import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculatePrice } from "@/lib/pricing";
import { bookingInputSchema } from "@/lib/validators";

// Name of the exclusion constraint created in prisma/sql/booking_no_overlap.sql
const OVERLAP_CONSTRAINT = "booking_no_overlap";

function isOverlapViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes(OVERLAP_CONSTRAINT);
}

export async function POST(request: Request) {
  const parsed = bookingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }
  const { vehicleId, startAt, endAt, customer } = parsed.data;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.status === "RETIRED" || vehicle.status === "IN_SERVICE") {
    return NextResponse.json({ error: "vehicle_unavailable" }, { status: 404 });
  }

  const totalPrice = calculatePrice(startAt, endAt, {
    hourly: vehicle.hourlyRate,
    daily: vehicle.dailyRate,
    weekend: vehicle.weekendRate,
  });

  try {
    // No availability pre-check: the database constraint is the single source of truth,
    // so concurrent requests cannot both succeed.
    const booking = await prisma.booking.create({
      data: {
        vehicle: { connect: { id: vehicleId } },
        customer: {
          connectOrCreate: {
            where: { email: customer.email },
            create: customer,
          },
        },
        startAt,
        endAt,
        totalPrice,
      },
      select: { id: true, startAt: true, endAt: true, totalPrice: true, status: true },
    });
    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (isOverlapViolation(error)) {
      return NextResponse.json({ error: "period_conflict" }, { status: 409 });
    }
    throw error;
  }
}
