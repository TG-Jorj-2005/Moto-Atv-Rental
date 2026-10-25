import { z } from "zod";
import { REGISTERABLE_ROLES } from "@/lib/roles";
import { localDateOf } from "@/lib/business-time";
import { CATEGORIES, categoryFitsType } from "@/lib/vehicle-categories";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  role: z.enum(REGISTERABLE_ROLES),
});

const ron = z.coerce.number().positive().max(100000);
const blankToNull = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);
const optionalInt = (min: number, max: number) => z.preprocess(blankToNull, z.coerce.number().int().min(min).max(max).nullable());

// Specifications are optional; blank fields are stored as "not given".
export const vehicleSpecsSchema = z.object({
  year: optionalInt(1990, 2100),
  engineCc: optionalInt(20, 5000),
  powerHp: optionalInt(1, 500),
  seats: optionalInt(1, 8),
  licenseCategory: z.enum(["", "AM", "A1", "A2", "A", "B"]).default("").transform((v) => v || null),
  // Optional finer classification; whether it fits the vehicle type is checked where the type is known.
  category: z.enum(["", ...CATEGORIES]).default("").transform((v) => v || null),
});

const vehicleCommon = z
  .object({
    name: z.string().trim().min(3).max(80),
    hourlyRon: ron,
    dailyRon: ron,
    weekendRon: z.preprocess(blankToNull, ron.nullable()),
    locationId: z.string().min(1),
    description: z.string().trim().max(1000).optional().transform((v) => v || null),
  })
  .merge(vehicleSpecsSchema);

// New vehicle: type and plate are fixed from now on.
export const vehicleCreateSchema = vehicleCommon
  .extend({
    type: z.enum(["ATV", "MOTORCYCLE", "SCOOTER"]),
    plate: z.string().trim().toUpperCase().min(4).max(15),
  })
  .refine((v) => v.category === null || categoryFitsType(v.category, v.type), { path: ["category"], message: "The category does not fit the vehicle type." });
export const vehicleEditSchema = vehicleCommon;

export const toBani = (ron: number) => Math.round(ron * 100);

// `now` is injectable so the boundary can be tested. Quote dates are calendar dates (Bucharest).
export const makeQuoteRequestSchema = (now: () => Date) =>
  z
  .object({
    vehicleType: z.enum(["ATV", "MOTORCYCLE", "SCOOTER"]),
    quantity: z.coerce.number().int().min(2).max(500),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    purpose: z.string().trim().min(5).max(500),
    contactPhone: z.string().trim().min(7).max(25),
    locationId: z.string().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "endDate before startDate", path: ["endDate"] })
  .refine(
    (v) => {
      const today = localDateOf(now());
      return v.startDate.getTime() > Date.UTC(today.year, today.month - 1, today.day);
    },
    { message: "startDate must be after today", path: ["startDate"] },
  );

export const quoteRequestSchema = makeQuoteRequestSchema(() => new Date());

export const locationSchema = z.object({
  name: z.string().trim().min(3).max(80),
  city: z.string().trim().min(2).max(60),
  county: z.string().trim().min(2).max(60),
  address: z.string().trim().min(5).max(120),
  phone: z.string().trim().min(7).max(25),
  hours: z.string().trim().min(3).max(60),
});
