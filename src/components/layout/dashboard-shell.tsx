import Link from "next/link";
import { ArrowLeft, LogOut, Menu } from "lucide-react";
import { logoutAction } from "@/app/actions/session";
import { Brand } from "@/components/layout/site-header";
import { CurrencySwitch } from "@/components/layout/currency-switch";
import { NavLinks, type NavItem } from "@/components/layout/nav-links";

// Frame of every signed-in area (customer, provider, admin): top bar, side navigation on large screens, a collapsible
// menu on small screens. The nav items are decided by the layout of each area, after its role check.
export function DashboardShell({ area, user, items, children }: { area: string; user: { name: string; email: string }; items: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <details className="relative lg:hidden">
            <summary className="grid size-10 cursor-pointer place-items-center rounded-lg border border-stone-300" aria-label="Open navigation"><Menu aria-hidden className="size-5" /></summary>
            <div className="absolute left-0 mt-2 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-pop">
              <NavLinks items={items} />
              <div className="mt-2 flex items-center justify-between border-t border-stone-100 px-3 pt-3 sm:hidden">
                <CurrencySwitch />
                <Link href="/" className="text-sm font-medium text-stone-700 hover:underline">Back to site</Link>
              </div>
            </div>
          </details>
          <Brand />
          <span className="hidden rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-900 sm:inline">{area}</span>
          <div className="ml-auto flex items-center gap-2">
            <CurrencySwitch className="hidden sm:inline-flex" />
            <Link href="/" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 sm:flex"><ArrowLeft aria-hidden className="size-4" /> Site</Link>
            <span className="hidden max-w-40 truncate text-sm text-stone-700 md:inline" title={user.email}>{user.name}</span>
            <form action={logoutAction}>
              <button className="grid size-10 cursor-pointer place-items-center rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100" aria-label="Log out"><LogOut aria-hidden className="size-4" /></button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav aria-label={`${area} navigation`} className="sticky top-24"><NavLinks items={items} /></nav>
        </aside>
        <main id="content" className="min-w-0 flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
