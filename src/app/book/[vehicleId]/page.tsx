import { redirect } from "next/navigation";

// Old URL: the booking form now lives on the vehicle page.
export default async function OldBookPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  redirect(`/vehicles/${(await params).vehicleId}`);
}
