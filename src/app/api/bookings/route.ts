import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { bookingInputSchema } from "@/lib/validators";
import { createBooking, type CreateBookingFailure } from "@/lib/booking-service";

const STATUS: Record<CreateBookingFailure, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  OWN_VEHICLE: 403,
  EMAIL_MISMATCH: 400,
  START_IN_PAST: 400,
  VEHICLE_UNAVAILABLE: 404,
  PENDING_LIMIT: 429,
  CONFLICT: 409,
};

export async function POST(request: Request) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = bookingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await createBooking(current.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.code.toLowerCase() }, { status: STATUS[result.code] });
  const { id, startAt, endAt, totalPrice, status } = result.booking;
  return NextResponse.json({ id, startAt, endAt, totalPrice, status }, { status: 201 });
}
