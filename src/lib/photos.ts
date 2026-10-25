import credits from "@/lib/photo-credits.json";

export type PhotoCredit = { author: string; license: string; source: string };

// A stored photo path is either a file in the upload directory ("uploads/<name>", served by /uploads/...) or a
// static demonstration image shipped with the application ("/vehicles/..." or "/gallery/...").
export function photoUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function coverOf(photos: { path: string }[]): string | null {
  return photos[0] ? photoUrl(photos[0].path) : null;
}

// Demonstration photos come from Wikimedia Commons and must credit their author; uploads have no credit line.
export function creditForPath(path: string): PhotoCredit | null {
  const file = path.split("/").pop()?.replace(/\.[a-z]+$/i, "");
  if (!file) return null;
  if (path.startsWith("/vehicles/")) return (credits.vehicles as Record<string, PhotoCredit>)[file] ?? null;
  if (path.startsWith("/gallery/")) return credits.gallery.find((g) => g.file === path) ?? null;
  return null;
}

export const galleryPhotos = credits.gallery;
