import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/session";
import { Brand } from "@/components/layout/site-header";
import { CurrencySwitch } from "@/components/layout/currency-switch";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { NavLinks, type NavItem } from "@/components/layout/nav-links";

// Frame of every signed-in area (customer, provider, admin): top bar, side navigation on large screens, a collapsible
// menu on small screens. The nav items are decided by the layout of each area, after its role check.
export function DashboardShell({ area, user, items, children }: { area: string; user: { name: string; email: string }; items: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <MobileMenu label="navigation" align="left" className="lg:hidden">
            <NavLinks items={items} />
            <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3 sm:hidden">
              <CurrencySwitch />
              <Link href="/" className="text-sm font-medium text-fg-soft hover:underline">Back to site</Link>
            </div>
          </MobileMenu>
          <Brand />
          <span className="hidden rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-fg sm:inline">{area}</span>
          <div className="ml-auto flex items-center gap-2">
            <CurrencySwitch className="hidden sm:inline-flex" />
            <Link href="/" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-fg-soft hover:bg-surface-3 sm:flex"><ArrowLeft aria-hidden className="size-4" /> Site</Link>
            <span className="hidden max-w-40 truncate text-sm text-fg-soft md:inline" title={user.email}>{user.name}</span>
            <form action={logoutAction}>
              <button className="grid size-10 cursor-pointer place-items-center rounded-lg border border-line-strong text-fg-soft hover:bg-surface-3" aria-label="Log out"><LogOut aria-hidden className="size-4" /></button>
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
