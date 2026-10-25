import { z } from "zod";

export const bookingInputSchema = z
  .object({
    vehicleId: z.string().min(1),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    customer: z.object({
      fullName: z.string().trim().min(2).max(100),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().min(7).max(20),
    }),
  })
  .refine((v) => v.endAt > v.startAt, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export type BookingInput = z.infer<typeof bookingInputSchema>;
