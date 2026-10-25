import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: { not: "RETIRED" } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(vehicles);
}
