import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { createVehicleAction } from "@/app/actions/vehicle";
import { VEHICLE_ERROR } from "@/lib/vehicle-messages";
import { VehicleFormFields } from "@/components/vehicle-form-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Add a platform vehicle" };
export const dynamic = "force-dynamic";

export default async function NewPlatformVehicle({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("ADMIN");
  const { error } = await searchParams;
  const locations = await prisma.location.findMany({ orderBy: [{ county: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, county: true } });
  return (
    <>
      <Link href="/admin/vehicles" className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-700 hover:underline"><ArrowLeft aria-hidden className="size-4" /> All vehicles</Link>
      <PageHeader title="Add a platform vehicle" description="A vehicle of the platform's own fleet: it has no owner, carries no commission (the platform keeps 100%) and is approved immediately." />
      {error && <Alert tone="error">{VEHICLE_ERROR[error] ?? "Something went wrong."}</Alert>}
      <Card><CardContent className="p-6">
        <form action={createVehicleAction} className="space-y-6">
          <input type="hidden" name="returnTo" value="/admin/vehicles/new" />
          <VehicleFormFields mode="create" locations={locations} />
          <Button size="lg">Create the vehicle</Button>
        </form>
      </CardContent></Card>
    </>
  );
}
