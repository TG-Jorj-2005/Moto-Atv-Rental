import { notFound } from "next/navigation";
import { BookingForm } from "@/components/booking-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) notFound();

  return (
    <main>
      <h1 className="mb-6 text-2xl font-bold">Book {vehicle.name}</h1>
      <BookingForm vehicleId={vehicle.id} />
    </main>
  );
}
