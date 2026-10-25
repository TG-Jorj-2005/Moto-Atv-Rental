import { CalendarDays, LayoutDashboard, UserRound } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { NavItem } from "@/components/layout/nav-links";

const icon = "size-4";
const ITEMS: NavItem[] = [
  { href: "/account", label: "Overview", icon: <LayoutDashboard aria-hidden className={icon} />, exact: true },
  { href: "/account/bookings", label: "My bookings", icon: <CalendarDays aria-hidden className={icon} /> },
  { href: "/account/profile", label: "Profile", icon: <UserRound aria-hidden className={icon} /> },
];

// Everyone who can rent: CUSTOMER, OWNER and RENTAL_COMPANY. Administrators have their own area.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
  return <DashboardShell area="My account" user={user} items={ITEMS}>{children}</DashboardShell>;
}
