import { z } from "zod";
import { text } from "@/lib/zod-text";

export const bookingInputSchema = z
  .object({
    vehicleId: text().min(1),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    customer: z.object({
      fullName: text().trim().min(2).max(100),
      email: text().trim().toLowerCase().email(),
      phone: text().trim().min(7).max(20),
    }),
  })
  .refine((v) => v.endAt > v.startAt, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export type BookingInput = z.infer<typeof bookingInputSchema>;

// A booking can only start in the future. Comparison of two absolute instants (no time zone involved),
// strict: a start equal to "now" is already in the past by the time it is processed.
export function isStartInFuture(startAt: Date, now: Date = new Date()): boolean {
  return startAt.getTime() > now.getTime();
}
