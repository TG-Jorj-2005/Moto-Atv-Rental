import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { transitionBooking } from "@/lib/booking-service";

const bodySchema = z.object({
  to: z.enum(["CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"]),
  reason: z.string().max(500).optional(),
});

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_TRANSITION: 409,
  CONFLICT_STATE: 409,
  VEHICLE_BUSY: 409,
  OVERLAP: 409,
  VEHICLE_NOT_BOOKABLE: 409,
  ALREADY_STARTED: 403,
  REASON_REQUIRED: 400,
  TOO_EARLY: 409,
  PAST_END: 409,
};

// POST /api/bookings/:id/status  { "to": "CANCELLED", "reason": "..." }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;
  const result = await transitionBooking(current.id, id, parsed.data.to, { reason: parsed.data.reason });
  if (!result.ok) return NextResponse.json({ error: result.code.toLowerCase() }, { status: STATUS[result.code] ?? 400 });
  return NextResponse.json({ status: result.status, warnings: result.warnings });
}
