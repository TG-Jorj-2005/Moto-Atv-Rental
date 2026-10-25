import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/vehicles: the public catalog as JSON. Only what a visitor can see on the site: approved vehicles that can be
// booked, without the owner, the plate number or any internal field.
export async function GET() {
  const vehicles = await prisma.vehicle.findMany({
    where: { listingStatus: "APPROVED", status: "AVAILABLE" },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      type: true,
      hourlyRate: true,
      dailyRate: true,
      weekendRate: true,
      year: true,
      engineCc: true,
      powerHp: true,
      seats: true,
      location: { select: { id: true, name: true, city: true, county: true } },
      photos: { orderBy: { position: "asc" }, take: 1, select: { path: true } },
    },
  });
  return NextResponse.json(vehicles);
}
