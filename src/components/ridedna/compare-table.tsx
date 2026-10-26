import { TYPE_LABEL } from "@/components/vehicle-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CATEGORY_LABELS } from "@/lib/vehicle-categories";
import type { Recommendation } from "@/lib/ridedna/service";

const dash = "—";

// The recommended vehicles side by side (only stored facts; a missing value is shown as a dash, never guessed).
export function CompareTable({ items }: { items: Recommendation[] }) {
  const rows: { label: string; cell: (r: Recommendation) => string }[] = [
    { label: "Compatibility", cell: (r) => `${r.score} / 100 · ${r.label}` },
    { label: "Estimated price", cell: (r) => r.priceLabel },
    { label: "Type", cell: (r) => TYPE_LABEL[r.type] },
    { label: "Category", cell: (r) => (r.category ? CATEGORY_LABELS[r.category] : dash) },
    { label: "Power", cell: (r) => (r.powerHp != null ? `${r.powerHp} hp` : dash) },
    { label: "Engine", cell: (r) => (r.engineCc != null ? `${r.engineCc} cc` : dash) },
    { label: "Seats", cell: (r) => (r.seats != null ? String(r.seats) : dash) },
    { label: "Licence needed", cell: (r) => r.licenseCategory ?? dash },
    { label: "Pick-up", cell: (r) => r.locationLabel ?? dash },
  ];
  return (
    <div className="rounded-xl border border-line bg-surface">
      <Table>
        <caption className="sr-only">Comparison of the recommended vehicles</caption>
        <THead><TR><TH scope="col"><span className="sr-only">Feature</span></TH>{items.map((r) => <TH key={r.id} scope="col">{r.name}</TH>)}</TR></THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.label}>
              <TH scope="row" className="whitespace-nowrap font-medium text-muted normal-case tracking-normal">{row.label}</TH>
              {items.map((r) => <TD key={r.id}>{row.cell(r)}</TD>)}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
