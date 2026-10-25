import { Prisma, type VehicleCategory, type VehicleType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { categoriesMatching, isCategory } from "@/lib/vehicle-categories";
import { addDays, localDateOf, localDayStart, type LocalDate } from "@/lib/business-time";

// Public catalog: which vehicles are shown and how the visitor filters them. Only approved listings that are not in
// service and not retired appear. The availability filter keeps vehicles with no booking overlapping the whole period.

export const PAGE_SIZE = 12;
export const SORTS = ["newest", "price_asc", "price_desc", "name"] as const;
export type CatalogSort = (typeof SORTS)[number];
const TYPES = ["ATV", "MOTORCYCLE", "SCOOTER"] as const;

export type CatalogFilters = {
  q: string;
  type: VehicleType | null;
  category: VehicleCategory | null;
  county: string | null;
  locationId: string | null;
  minDailyRon: number | null;
  maxDailyRon: number | null;
  from: LocalDate | null; // first day wanted (Bucharest calendar date)
  to: LocalDate | null; // last day wanted
  sort: CatalogSort;
  page: number;
};

export type CatalogParseResult = { filters: CatalogFilters; problems: string[] };

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function parseDay(value: string | undefined): LocalDate | null {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const date = { year: +m[1]!, month: +m[2]!, day: +m[3]! };
  const check = addDays(date, 0);
  return check.year === date.year && check.month === date.month && check.day === date.day ? date : null;
}
const dayNumber = (d: LocalDate) => Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);

function parseMoney(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : null;
}

// Never throws: bad values are ignored and reported in `problems`, so a mistyped link still shows a page.
export function parseCatalogParams(raw: Raw, now: Date = new Date()): CatalogParseResult {
  const problems: string[] = [];
  const type = TYPES.find((t) => t === one(raw.type)) ?? null;
  const rawCategory = one(raw.category);
  const category = isCategory(rawCategory) ? rawCategory : null;
  const sort = SORTS.find((s) => s === one(raw.sort)) ?? "newest";
  const pageNumber = Number(one(raw.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 10_000 ? pageNumber : 1;

  let minDailyRon = parseMoney(one(raw.minPrice));
  let maxDailyRon = parseMoney(one(raw.maxPrice));
  if (one(raw.minPrice) !== undefined && minDailyRon === null) problems.push("The minimum price is not a valid number.");
  if (one(raw.maxPrice) !== undefined && maxDailyRon === null) problems.push("The maximum price is not a valid number.");
  if (minDailyRon !== null && maxDailyRon !== null && minDailyRon > maxDailyRon) {
    problems.push("The minimum price is higher than the maximum price, so the price filter was ignored.");
    minDailyRon = null;
    maxDailyRon = null;
  }

  let from = parseDay(one(raw.from));
  let to = parseDay(one(raw.to));
  if (one(raw.from) && !from) problems.push("The start date is not valid.");
  if (one(raw.to) && !to) problems.push("The end date is not valid.");
  if ((from && !to) || (!from && to)) {
    if (from || to) problems.push("Choose both a start and an end date to filter by availability.");
    from = null;
    to = null;
  }
  if (from && to) {
    const today = localDateOf(now);
    if (dayNumber(from) < dayNumber(today)) {
      problems.push("The start date is in the past, so the availability filter was ignored.");
      from = null;
      to = null;
    } else if (dayNumber(to) < dayNumber(from)) {
      problems.push("The end date is before the start date, so the availability filter was ignored.");
      from = null;
      to = null;
    } else if (dayNumber(to) - dayNumber(from) > 60) {
      problems.push("Availability can be checked for up to 60 days at a time, so the availability filter was ignored.");
      from = null;
      to = null;
    }
  }

  return {
    filters: { q: (one(raw.q) ?? "").slice(0, 60), type, category, county: one(raw.county)?.slice(0, 60) ?? null, locationId: one(raw.location)?.slice(0, 60) ?? null, minDailyRon, maxDailyRon, from, to, sort, page },
    problems,
  };
}

export function catalogWhere(f: CatalogFilters): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = { listingStatus: "APPROVED", status: "AVAILABLE" };
  if (f.q) {
    // The words of the search match the name, or the label of a category ("cruiser", "adventure", ...).
    const categories = categoriesMatching(f.q);
    where.OR = [{ name: { contains: f.q, mode: "insensitive" } }, ...(categories.length > 0 ? [{ category: { in: categories } }] : [])];
  }
  if (f.type) where.type = f.type;
  if (f.category) where.category = f.category;
  if (f.locationId) where.locationId = f.locationId;
  else if (f.county) where.location = { county: f.county };
  if (f.minDailyRon !== null || f.maxDailyRon !== null) {
    where.dailyRate = { ...(f.minDailyRon !== null ? { gte: Math.round(f.minDailyRon * 100) } : {}), ...(f.maxDailyRon !== null ? { lte: Math.round(f.maxDailyRon * 100) } : {}) };
  }
  if (f.from && f.to) {
    const start = localDayStart(f.from);
    const end = localDayStart(addDays(f.to, 1));
    where.bookings = { none: { status: { not: "CANCELLED" }, startAt: { lt: end }, endAt: { gt: start } } };
  }
  return where;
}

const ORDER: Record<CatalogSort, Prisma.VehicleOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  price_asc: [{ dailyRate: "asc" }, { id: "asc" }],
  price_desc: [{ dailyRate: "desc" }, { id: "asc" }],
  name: [{ name: "asc" }, { id: "asc" }],
};

// Only the columns a card needs, and only the cover photo: no heavy relations are loaded.
export const vehicleCardSelect = {
  id: true,
  name: true,
  type: true,
  category: true,
  hourlyRate: true,
  dailyRate: true,
  weekendRate: true,
  year: true,
  engineCc: true,
  powerHp: true,
  seats: true,
  owner: { select: { role: true } },
  location: { select: { name: true, city: true, county: true } },
  photos: { orderBy: { position: "asc" }, take: 1, select: { path: true } },
} satisfies Prisma.VehicleSelect;

export type VehicleCardData = Prisma.VehicleGetPayload<{ select: typeof vehicleCardSelect }>;

export async function searchVehicles(f: CatalogFilters) {
  const where = catalogWhere(f);
  const total = await prisma.vehicle.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const items = await prisma.vehicle.findMany({ where, orderBy: ORDER[f.sort], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: vehicleCardSelect });
  return { items, total, page, pages };
}

export async function catalogFacets() {
  const [locations, byType, byCategory] = await Promise.all([
    prisma.location.findMany({ orderBy: [{ county: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, county: true, _count: { select: { vehicles: { where: { listingStatus: "APPROVED", status: "AVAILABLE" } } } } } }),
    prisma.vehicle.groupBy({ by: ["type"], where: { listingStatus: "APPROVED", status: "AVAILABLE" }, _count: true }),
    prisma.vehicle.groupBy({ by: ["category"], where: { listingStatus: "APPROVED", status: "AVAILABLE", category: { not: null } }, _count: true }),
  ]);
  return {
    locations,
    counts: Object.fromEntries(byType.map((t) => [t.type, t._count])) as Partial<Record<VehicleType, number>>,
    categoryCounts: Object.fromEntries(byCategory.map((c) => [c.category, c._count])) as Partial<Record<VehicleCategory, number>>,
  };
}
