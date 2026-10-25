import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { saveLocationAction } from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Locations" };
export const dynamic = "force-dynamic";

export default async function AdminLocations({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const locations = await prisma.location.findMany({ orderBy: [{ county: "asc" }, { name: "asc" }], include: { _count: { select: { vehicles: true } } } });
  return (
    <>
      <PageHeader title="Locations" description="Pick-up points shown to customers. Saving a name that already exists updates that location." />
      {sp.ok && <Alert tone="success">The location was saved.</Alert>}
      {sp.error && <Alert tone="error">Check the fields; every one of them is required.</Alert>}
      <Card>
        <CardHeader><CardTitle>Add or update a location</CardTitle></CardHeader>
        <CardContent>
          <form action={saveLocationAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name" htmlFor="l-name"><Input id="l-name" name="name" required minLength={3} maxLength={80} /></Field>
            <Field label="City" htmlFor="l-city"><Input id="l-city" name="city" required maxLength={60} /></Field>
            <Field label="County" htmlFor="l-county"><Input id="l-county" name="county" required maxLength={60} /></Field>
            <Field label="Address" htmlFor="l-address" className="lg:col-span-2"><Input id="l-address" name="address" required minLength={5} maxLength={120} /></Field>
            <Field label="Phone" htmlFor="l-phone"><Input id="l-phone" name="phone" type="tel" required minLength={7} maxLength={25} /></Field>
            <Field label="Opening hours" htmlFor="l-hours" className="lg:col-span-2"><Input id="l-hours" name="hours" required maxLength={60} /></Field>
            <div className="flex items-end"><Button variant="dark">Save location</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>County</TH><TH>Name</TH><TH>Address</TH><TH>Hours</TH><TH className="text-right">Vehicles</TH></TR></THead>
          <TBody>{locations.map((l) => <TR key={l.id}><TD>{l.county}</TD><TD className="font-medium">{l.name}</TD><TD className="text-stone-600">{l.address}, {l.city}</TD><TD className="text-stone-600">{l.hours}</TD><TD className="text-right">{l._count.vehicles}</TD></TR>)}</TBody>
        </Table>
      </Card>
    </>
  );
}
