import { BarChart3, CalendarDays, FileText, LayoutDashboard, MapPin, Users, Wallet, Wrench, Bike } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { NavItem } from "@/components/layout/nav-links";

const icon = "size-4";
const ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard aria-hidden className={icon} />, exact: true },
  { href: "/admin/bookings", label: "Bookings", icon: <CalendarDays aria-hidden className={icon} /> },
  { href: "/admin/vehicles", label: "Vehicles", icon: <Bike aria-hidden className={icon} /> },
  { href: "/admin/quotes", label: "Bulk offers", icon: <FileText aria-hidden className={icon} /> },
  { href: "/admin/maintenance", label: "Maintenance", icon: <Wrench aria-hidden className={icon} /> },
  { href: "/admin/finance", label: "Finance & reports", icon: <BarChart3 aria-hidden className={icon} /> },
  { href: "/admin/users", label: "Users & roles", icon: <Users aria-hidden className={icon} /> },
  { href: "/admin/locations", label: "Locations", icon: <MapPin aria-hidden className={icon} /> },
  { href: "/admin/payouts", label: "Payouts", icon: <Wallet aria-hidden className={icon} /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");
  return <DashboardShell area="Administration" user={user} items={ITEMS}>{children}</DashboardShell>;
}
