import { BarChart3, CalendarDays, FileText, LayoutDashboard, Bike, ListChecks, UserRound } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { NavItem } from "@/components/layout/nav-links";

const icon = "size-4";

// Owners and rental companies. Bulk offers are only for rental companies, so that link is not shown to owners.
export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("OWNER", "RENTAL_COMPANY");
  const items: NavItem[] = [
    { href: "/provider", label: "Overview", icon: <LayoutDashboard aria-hidden className={icon} />, exact: true },
    { href: "/provider/vehicles", label: "My vehicles", icon: <Bike aria-hidden className={icon} /> },
    { href: "/provider/bookings", label: "Bookings", icon: <ListChecks aria-hidden className={icon} /> },
    { href: "/provider/calendar", label: "Calendar", icon: <CalendarDays aria-hidden className={icon} /> },
    { href: "/provider/finance", label: "Earnings", icon: <BarChart3 aria-hidden className={icon} /> },
    ...(user.role === "RENTAL_COMPANY" ? [{ href: "/provider/quotes", label: "Bulk offers", icon: <FileText aria-hidden className={icon} /> }] : []),
    { href: "/account", label: "My account", icon: <UserRound aria-hidden className={icon} /> },
  ];
  return <DashboardShell area={user.role === "RENTAL_COMPANY" ? "Rental company" : "Owner"} user={user} items={items}>{children}</DashboardShell>;
}
