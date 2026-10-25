import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ownerSummaries } from "@/lib/earnings";
import { COMPANY_MIN_COMMISSION_BPS, commissionBpsFor, OWNER_COMMISSION_BPS } from "@/lib/commission";
import { formatMoney } from "@/lib/currency";
import { ROLE_LABEL } from "@/lib/roles";
import { recordPayoutAction, setCompanyRateAction } from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PageHeader, Stat } from "@/components/ui/misc";

export const metadata = { title: "Payouts and commission rates" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  rate: `The rate must be between ${COMPANY_MIN_COMMISSION_BPS / 100}% and 100%.`,
  not_company: "Only rental companies have a configurable rate.",
  payout: "Enter a positive amount for an owner or a company.",
};

export default async function AdminPayouts({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const [owners, summaries] = await Promise.all([
    prisma.user.findMany({ where: { OR: [{ vehicles: { some: {} } }, { role: { in: ["OWNER", "RENTAL_COMPANY"] } }] }, orderBy: [{ role: "desc" }, { name: "asc" }, { id: "asc" }] }),
    ownerSummaries(),
  ]);
  const byOwner = new Map(summaries.map((s) => [s.ownerId, s]));
  const totalCommission = summaries.reduce((n, s) => n + s.commission, 0);
  const totalOwed = summaries.reduce((n, s) => n + s.balance, 0);

  return (
    <>
      <PageHeader title="Payouts and commission rates" description={`Platform-fleet vehicles carry 0% commission; individual owners a fixed ${OWNER_COMMISSION_BPS / 100}%; rental companies a rate you set here, at least ${COMPANY_MIN_COMMISSION_BPS / 100}% (${OWNER_COMMISSION_BPS / 100}% until you set one). Each booking keeps the rate it had when it was made. What is owed accrues when a booking is completed.`} />
      {sp.ok && <Alert tone="success">Saved.</Alert>}
      {sp.error && <Alert tone="error">{MESSAGES[sp.error] ?? "The action was refused."}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Commission earned on completed bookings" value={formatMoney(totalCommission, "RON")} />
        <Stat label="Still owed to owners and companies" value={formatMoney(totalOwed, "RON")} tone={totalOwed > 0 ? "warning" : undefined} />
      </div>
      <ul className="space-y-4">
        {owners.length === 0 && <li className="text-stone-600">No owners or companies yet.</li>}
        {owners.map((o) => {
          const s = byOwner.get(o.id);
          return (
            <li key={o.id}>
              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{o.name} <span className="font-normal text-stone-600">{o.email} · {ROLE_LABEL[o.role]}</span></p>
                  <p className="text-sm text-stone-700">Rate {commissionBpsFor(o) / 100}%{o.role === "OWNER" ? " (fixed)" : o.commissionBps == null ? " (default, not configured)" : ""}</p>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-5">
                  {[["Completed bookings", String(s?.completedBookings ?? 0)], ["Charged to customers", formatMoney(s?.gross ?? 0, "RON")], ["Commission", formatMoney(s?.commission ?? 0, "RON")], ["Earned by the owner", formatMoney(s?.earned ?? 0, "RON")], ["Balance owed", formatMoney(s?.balance ?? 0, "RON")]].map(([k, v]) => (
                    <div key={k}><dt className="text-xs text-stone-600">{k}</dt><dd className="font-semibold">{v}</dd></div>
                  ))}
                </dl>
                <div className="flex flex-wrap items-end gap-6 border-t border-stone-100 pt-3">
                  {o.role === "RENTAL_COMPANY" && (
                    <form action={setCompanyRateAction} className="flex items-end gap-2">
                      <input type="hidden" name="ownerId" value={o.id} />
                      <Field label="Commission rate (%)" htmlFor={`rate-${o.id}`}><Input id={`rate-${o.id}`} name="percent" type="number" min={COMPANY_MIN_COMMISSION_BPS / 100} max="100" step="0.5" required defaultValue={o.commissionBps == null ? "" : o.commissionBps / 100} className="w-36" /></Field>
                      <Button variant="outline">Set rate</Button>
                    </form>
                  )}
                  {(o.role === "OWNER" || o.role === "RENTAL_COMPANY") && (
                    <form action={recordPayoutAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="ownerId" value={o.id} />
                      <Field label="Paid out (RON)" htmlFor={`pay-${o.id}`}><Input id={`pay-${o.id}`} name="amountRon" type="number" min="1" step="1" required className="w-36" /></Field>
                      <Field label="Note" htmlFor={`note-${o.id}`}><Input id={`note-${o.id}`} name="note" maxLength={200} className="w-52" /></Field>
                      <Button variant="dark">Record payout</Button>
                    </form>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
