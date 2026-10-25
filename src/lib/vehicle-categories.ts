import type { VehicleCategory, VehicleType } from "@prisma/client";

// Optional finer classification of a vehicle inside its type. It is only a label for browsing: it never changes the
// booking, authorization or commission rules.
export const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  CRUISER: "Cruiser",
  ADVENTURE: "Adventure & touring",
  NAKED_SPORT: "Naked & sport",
  DUAL_SPORT: "Dual-sport & enduro",
  ATV_SPORT: "Sport ATV",
  ATV_UTILITY: "Utility ATV",
};

export const CATEGORY_BLURBS: Record<VehicleCategory, string> = {
  CRUISER: "Relaxed riding position, classic lines, lots of chrome and torque.",
  ADVENTURE: "Long distances, mixed roads and luggage: built to travel.",
  NAKED_SPORT: "Light, quick and agile for fun on twisty roads.",
  DUAL_SPORT: "Street legal and ready for trails and gravel.",
  ATV_SPORT: "Light, fast quad built for performance on open terrain.",
  ATV_UTILITY: "Stable, powerful quads for trails, work and touring.",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as VehicleCategory[];

// Which categories fit which vehicle type. Scooters have none.
const BY_TYPE: Record<VehicleType, readonly VehicleCategory[]> = {
  MOTORCYCLE: ["CRUISER", "ADVENTURE", "NAKED_SPORT", "DUAL_SPORT"],
  ATV: ["ATV_SPORT", "ATV_UTILITY"],
  SCOOTER: [],
};

export const categoriesFor = (type: VehicleType): readonly VehicleCategory[] => BY_TYPE[type];
export const isCategory = (value: unknown): value is VehicleCategory => typeof value === "string" && value in CATEGORY_LABELS;
export const categoryFitsType = (category: VehicleCategory, type: VehicleType) => BY_TYPE[type].includes(category);

// Categories whose label contains the search words, so that typing "cruiser" in the search box finds them.
export function categoriesMatching(query: string): VehicleCategory[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  return CATEGORIES.filter((c) => CATEGORY_LABELS[c].toLowerCase().includes(q) || c.toLowerCase().replace(/_/g, " ").includes(q));
}
