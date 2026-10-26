import Link from "next/link";
import { LayoutDashboard, LogOut, ShieldCheck, Store, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canListVehicles } from "@/lib/roles";
import { logoutAction } from "@/app/actions/session";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { CurrencySwitch } from "@/components/layout/currency-switch";

// Kept as the single import point for the brand in headers and footers.
export function Brand({ href = "/", mark = false }: { href?: string; mark?: boolean }) {
  return <Logo href={href} variant={mark ? "mark" : "full"} />;
}

const PUBLIC_LINKS = [
  { href: "/vehicles", label: "All vehicles" },
  { href: "/vehicles?type=MOTORCYCLE", label: "Motorcycles" },
  { href: "/vehicles?type=ATV", label: "ATVs" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#locations", label: "Locations" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const area = !user ? null : user.role === "ADMIN" ? { href: "/admin", label: "Admin", icon: ShieldCheck } : canListVehicles(user.role) ? { href: "/provider", label: "Provider area", icon: Store } : null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Brand />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-fg-soft hover:bg-surface-3 hover:text-fg">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CurrencySwitch className="hidden sm:inline-flex" />
          {user ? (
            <details className="relative">
              <summary className="flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2" aria-label="Account menu">
                <UserRound aria-hidden className="size-4" />
                <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
              </summary>
              <div className="absolute right-0 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-pop">
                <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
                {user.role !== "ADMIN" && (
                  <Link href="/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-3"><LayoutDashboard aria-hidden className="size-4" /> My account</Link>
                )}
                {area && (
                  <Link href={area.href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-3"><area.icon aria-hidden className="size-4" /> {area.label}</Link>
                )}
                <form action={logoutAction}>
                  <button className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"><LogOut aria-hidden className="size-4" /> Log out</button>
                </form>
              </div>
            </details>
          ) : (
            <>
              <span className="hidden sm:inline-flex"><Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Log in</Link></span>
              <Link href="/register" className={buttonVariants({ variant: "primary", size: "sm" })}>Register</Link>
            </>
          )}
          <MobileMenu label="menu" className="md:hidden">
            {PUBLIC_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-3">{l.label}</Link>
            ))}
            {!user && (
              <div className="mt-1 grid gap-2 border-t border-line px-1 pt-3">
                <Link href="/login" className={buttonVariants({ variant: "outline" })}>Log in</Link>
                <Link href="/register" className={buttonVariants({ variant: "primary" })}>Register</Link>
              </div>
            )}
            <div className="mt-1 border-t border-line px-3 pt-3"><CurrencySwitch /></div>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
