import { requireRole } from "@/lib/session";
import { VehicleManager } from "@/components/vehicle-manager";

export const metadata = { title: "Manage vehicle" };
export const dynamic = "force-dynamic";

export default async function ProviderVehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const user = await requireRole("OWNER", "RENTAL_COMPANY");
  const { id } = await params;
  const { tab, ok, error } = await searchParams;
  return <VehicleManager vehicleId={id} user={user} basePath="/provider" tab={tab} ok={ok} error={error} />;
}
