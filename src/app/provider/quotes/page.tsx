import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { quoteRequestSchema } from "@/lib/forms";
import { acceptQuote, createQuote, declineQuote } from "@/lib/quote-service";
import { QuoteStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, PageHeader, Section } from "@/components/ui/misc";

export const metadata = { title: "Bulk offers" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { tone: "success" | "error" | "warning"; text: string }> = {
  requested: { tone: "success", text: "Request received. Your offer is below." },
  accepted: { tone: "success", text: "Offer accepted: the vehicles are booked." },
  invalid: { tone: "error", text: "Check the form: at least 2 vehicles, dates starting tomorrow or later, a contact phone and a purpose." },
  OFFER_CHANGED: { tone: "warning", text: "Availability changed, so the offer was updated. Nothing was booked. Review the new list below and accept it again if you agree." },
  STALE_REVISION: { tone: "warning", text: "You tried to accept an old version of the offer. Nothing was booked. Review the current version below." },
  NO_VEHICLES: { tone: "error", text: "The vehicles of this offer were taken in the meantime and no other vehicle is free for these dates. Nothing was booked. You can request a new offer with other dates or another location." },
  START_IN_PAST: { tone: "error", text: "The start date of this offer has already passed. Please request a new offer." },
  NOT_OPEN: { tone: "error", text: "This offer is no longer open." },
  FORBIDDEN: { tone: "error", text: "Only rental-company accounts can accept offers." },
};

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireRole("RENTAL_COMPANY");
  const { notice } = await searchParams;
  const currency = await getCurrency();
  const [quotes, locations] = await Promise.all([
    prisma.quoteRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { items: { include: { vehicle: { select: { name: true, plate: true, location: { select: { name: true, city: true } } } } } } },
    }),
    prisma.location.findMany({ orderBy: [{ county: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, county: true } }),
  ]);

  async function requestQuote(formData: FormData) {
    "use server";
    const me = await requireRole("RENTAL_COMPANY");
    const raw = Object.fromEntries(formData);
    const parsed = quoteRequestSchema.safeParse({ ...raw, locationId: raw.locationId || undefined });
    if (!parsed.success) redirect("/provider/quotes?notice=invalid");
    const d = parsed.data;
    await createQuote({ userId: me.id, vehicleType: d.vehicleType, quantity: d.quantity, startDate: d.startDate, endDate: d.endDate, purpose: d.purpose, contactPhone: d.contactPhone, locationId: d.locationId });
    revalidatePath("/provider/quotes");
    redirect("/provider/quotes?notice=requested");
  }
  async function accept(formData: FormData) {
    "use server";
    const me = await requireRole("RENTAL_COMPANY");
    const result = await acceptQuote(me.id, String(formData.get("id")), Number(formData.get("revision")));
    revalidatePath("/provider/quotes");
    redirect(`/provider/quotes?notice=${result.ok ? "accepted" : result.code}`);
  }
  async function decline(formData: FormData) {
    "use server";
    const me = await requireRole("RENTAL_COMPANY");
    await declineQuote(me.id, String(formData.get("id")));
    revalidatePath("/provider/quotes");
  }
  const flash = notice ? MESSAGES[notice] : undefined;

  return (
    <>
      <PageHeader title="Bulk offers" description="Need many vehicles for an event or a group? Tell us what you need and we build an offer from the vehicles that are really free. Offers are not reservations: nothing is held until you accept." />
      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      <Card>
        <CardHeader><CardTitle>Request an offer</CardTitle></CardHeader>
        <CardContent>
          <form action={requestQuote} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Vehicle type" htmlFor="q-type"><Select id="q-type" name="vehicleType" defaultValue="ATV"><option value="ATV">ATV / quad</option><option value="MOTORCYCLE">Motorcycle</option><option value="SCOOTER">Scooter</option></Select></Field>
            <Field label="How many" htmlFor="q-qty" hint="At least 2."><Input id="q-qty" name="quantity" type="number" min="2" max="500" required /></Field>
            <Field label="First day" htmlFor="q-from" hint="From tomorrow."><Input id="q-from" name="startDate" type="date" required /></Field>
            <Field label="Last day" htmlFor="q-to"><Input id="q-to" name="endDate" type="date" required /></Field>
            <Field label="Location" htmlFor="q-loc"><Select id="q-loc" name="locationId" defaultValue=""><option value="">Anywhere in Romania</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.county} · {l.name}</option>)}</Select></Field>
            <Field label="Contact phone" htmlFor="q-phone"><Input id="q-phone" name="contactPhone" type="tel" required minLength={7} maxLength={25} /></Field>
            <Field label="What is it for?" htmlFor="q-purpose" className="sm:col-span-2"><Textarea id="q-purpose" name="purpose" required minLength={5} maxLength={500} className="min-h-16" /></Field>
            <div className="sm:col-span-2 lg:col-span-4"><Button size="lg">Get an offer</Button></div>
          </form>
        </CardContent>
      </Card>

      <Section title="Your offers">
        {quotes.length === 0 ? <EmptyState icon={FileText} title="No offers yet" description="Your requests and the offers made for them appear here." /> : (
          <ul className="space-y-4">
            {quotes.map((q) => (
              <li key={q.id}>
                <Card>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{q.quantity} × {q.vehicleType === "ATV" ? "ATV" : q.vehicleType === "MOTORCYCLE" ? "motorcycle" : "scooter"} · {q.startDate.toISOString().slice(0, 10)} → {q.endDate.toISOString().slice(0, 10)}</p>
                      <div className="flex items-center gap-2"><span className="text-xs text-stone-600">Version {q.revision}</span><QuoteStatusBadge status={q.status} /></div>
                    </div>
                    <p className="text-sm text-stone-600">{q.purpose}</p>
                    {q.adminNote && <Alert tone="warning">{q.adminNote}</Alert>}
                    {q.items.length > 0 && (
                      <div className="rounded-lg border border-stone-200">
                        <ul className="divide-y divide-stone-100 text-sm">
                          {q.items.map((i) => (
                            <li key={i.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                              <span>{i.vehicle.name} <span className="text-stone-600">({i.vehicle.plate}) · {i.vehicle.location?.name ?? "no location"}</span></span>
                              <span>{i.price !== i.listPrice && <s className="mr-1 text-stone-500">{formatMoney(i.listPrice, currency)}</s>}<strong>{formatMoney(i.price, currency)}</strong></span>
                            </li>
                          ))}
                        </ul>
                        <p className="flex flex-wrap justify-between gap-2 border-t border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold">
                          <span>{q.offeredQuantity} of {q.quantity} vehicles{q.discountBps ? ` · ${q.discountBps / 100}% bulk discount included` : ""}</span>
                          <span>Total {formatMoney(q.quotedAmount ?? 0, currency)}</span>
                        </p>
                      </div>
                    )}
                    {q.status === "QUOTED" && (
                      <div className="flex flex-wrap gap-2">
                        <form action={accept}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="revision" value={q.revision} /><Button>Accept version {q.revision} and book these vehicles</Button></form>
                        <form action={decline}><input type="hidden" name="id" value={q.id} /><Button variant="outline">Decline</Button></form>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
