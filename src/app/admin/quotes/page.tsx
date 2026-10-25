import { FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { QuoteStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Bulk offers" };
export const dynamic = "force-dynamic";

export default async function AdminQuotes() {
  await requireRole("ADMIN");
  const [currency, quotes] = await Promise.all([
    getCurrency(),
    prisma.quoteRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true, email: true } }, items: { include: { vehicle: { select: { name: true, plate: true } } } }, _count: { select: { bookings: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader title="Bulk offers" description="Offers are built automatically from the vehicles that are free and are not reservations. A company accepts a specific version; if availability changes, the offer is recalculated and the version number grows." />
      {quotes.length === 0 ? <EmptyState icon={FileText} title="No offers yet" /> : (
        <ul className="space-y-4">
          {quotes.map((q) => (
            <li key={q.id}>
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{q.user.name} <span className="font-normal text-stone-600">{q.user.email} · {q.contactPhone}</span></p>
                    <div className="flex items-center gap-2"><span className="text-xs text-stone-600">Version {q.revision}</span><QuoteStatusBadge status={q.status} /></div>
                  </div>
                  <p className="text-sm">{q.quantity} × {q.vehicleType.toLowerCase()} · {q.startDate.toISOString().slice(0, 10)} → {q.endDate.toISOString().slice(0, 10)} · <span className="text-stone-600">{q.purpose}</span></p>
                  {q.adminNote && <Alert tone="warning">{q.adminNote}</Alert>}
                  {q.items.length > 0 && (
                    <p className="text-sm text-stone-700">Offered {q.offeredQuantity} of {q.quantity}: {q.items.map((i) => `${i.vehicle.name} (${formatMoney(i.price, currency)})`).join(", ")}. Total <strong>{formatMoney(q.quotedAmount ?? 0, currency)}</strong>{q.discountBps ? `, ${q.discountBps / 100}% bulk discount` : ""}.</p>
                  )}
                  {q.status === "ACCEPTED" && <p className="text-sm font-medium text-green-800">{q._count.bookings} booking{q._count.bookings === 1 ? "" : "s"} created.</p>}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
