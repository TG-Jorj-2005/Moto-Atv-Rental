import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

// A plain GET form: the browser downloads the CSV the route builds for the chosen completion days (Bucharest time).
export function ExportForm({ action, title }: { action: string; title: string }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3" aria-label={title}>
      <Field label="Completed from" htmlFor="export-from" className="w-44"><Input id="export-from" type="date" name="from" /></Field>
      <Field label="Completed to" htmlFor="export-to" className="w-44"><Input id="export-to" type="date" name="to" /></Field>
      <Button type="submit" variant="outline"><Download aria-hidden className="size-4" /> {title}</Button>
    </form>
  );
}
