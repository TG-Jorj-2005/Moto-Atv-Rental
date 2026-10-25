import { getCurrency } from "@/lib/currency-server";
import { setCurrencyAction } from "@/app/actions/session";
import { cn } from "@/lib/utils";

// RON | EUR switch. Works without JavaScript: two small forms that set a cookie and return to the same page.
export async function CurrencySwitch({ returnTo = "/", className }: { returnTo?: string; className?: string }) {
  const current = await getCurrency();
  return (
    <form action={setCurrencyAction} aria-label="Display currency" className={cn("inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-xs font-semibold", className)}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {(["RON", "EUR"] as const).map((c) => (
        <button
          key={c}
          name="currency"
          value={c}
          aria-pressed={current === c}
          className={cn("cursor-pointer rounded-md px-2.5 py-1", current === c ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100")}
        >
          {c}
        </button>
      ))}
    </form>
  );
}
