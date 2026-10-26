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

export const metadata = { title: "Add a vehicle" };
export const dynamic = "force-dynamic";

export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("OWNER", "RENTAL_COMPANY");
  const { error } = await searchParams;
  const locations = await prisma.location.findMany({ orderBy: [{ county: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, county: true } });
  return (
    <>
      <Link href="/provider/vehicles" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-soft hover:underline"><ArrowLeft aria-hidden className="size-4" /> My vehicles</Link>
      <PageHeader title="Add a vehicle" description="Fill in the details now; you can add photos on the next screen. An administrator approves the listing before it appears on the site." />
      {error && <Alert tone="error">{VEHICLE_ERROR[error] ?? "Something went wrong."}</Alert>}
      <Card>
        <CardContent className="p-6">
          <form action={createVehicleAction} className="space-y-6">
            <input type="hidden" name="returnTo" value="/provider/vehicles/new" />
            <VehicleFormFields mode="create" locations={locations} />
            <div className="flex gap-2"><Button size="lg">Create the listing</Button><Link href="/provider/vehicles" className="inline-flex h-12 items-center rounded-lg px-4 text-sm font-semibold hover:bg-surface-3">Cancel</Link></div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
