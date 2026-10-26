import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { completedBookingsCsv, csvResponse, parseExportRange } from "@/lib/export-report";

export const dynamic = "force-dynamic";

// GET /admin/finance/export?from=YYYY-MM-DD&to=YYYY-MM-DD: completed bookings (by completion day, Bucharest time) with
// the commission snapshot of each one. Administrators only.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const range = parseExportRange(params.get("from"), params.get("to"));
  if (range.error !== undefined) return new NextResponse(range.error, { status: 400 });
  return csvResponse(await completedBookingsCsv(range), "completed-bookings.csv");
}
