import Link from "next/link";
import { LayoutDashboard, LogOut, Menu, Mountain, ShieldCheck, Store, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canListVehicles } from "@/lib/roles";
import { logoutAction } from "@/app/actions/session";
import { buttonVariants } from "@/components/ui/button";
import { CurrencySwitch } from "@/components/layout/currency-switch";

export function Brand({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-bold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white"><Mountain aria-hidden className="size-4" /></span>
      <span className={light ? "text-white" : "text-stone-900"}>Moto &amp; ATV Rental</span>
    </Link>
  );
}

const PUBLIC_LINKS = [
  { href: "/vehicles", label: "Vehicles" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#locations", label: "Locations" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const area = !user ? null : user.role === "ADMIN" ? { href: "/admin", label: "Admin", icon: ShieldCheck } : canListVehicles(user.role) ? { href: "/provider", label: "Provider area", icon: Store } : null;

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Brand />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CurrencySwitch className="hidden sm:inline-flex" />
          {user ? (
            <details className="relative">
              <summary className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50" aria-label="Account menu">
                <UserRound aria-hidden className="size-4" />
                <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
              </summary>
              <div className="absolute right-0 mt-2 w-60 rounded-xl border border-stone-200 bg-white p-2 shadow-pop">
                <p className="truncate px-3 py-2 text-xs text-stone-600">{user.email}</p>
                {user.role !== "ADMIN" && (
                  <Link href="/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100"><LayoutDashboard aria-hidden className="size-4" /> My account</Link>
                )}
                {area && (
                  <Link href={area.href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100"><area.icon aria-hidden className="size-4" /> {area.label}</Link>
                )}
                <form action={logoutAction}>
                  <button className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><LogOut aria-hidden className="size-4" /> Log out</button>
                </form>
              </div>
            </details>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Log in</Link>
              <Link href="/register" className={buttonVariants({ variant: "primary", size: "sm" })}>Register</Link>
            </>
          )}
          <details className="relative md:hidden">
            <summary className="grid size-10 cursor-pointer place-items-center rounded-lg border border-stone-300 bg-white" aria-label="Open menu"><Menu aria-hidden className="size-5" /></summary>
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-stone-200 bg-white p-2 shadow-pop">
              {PUBLIC_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-100">{l.label}</Link>
              ))}
              <div className="px-3 py-2"><CurrencySwitch /></div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
