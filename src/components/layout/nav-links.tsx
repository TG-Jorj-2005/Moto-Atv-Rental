"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon?: React.ReactNode; exact?: boolean };

// Navigation list that marks the current page (aria-current) using the browser location.
export function NavLinks({ items, orientation = "vertical" }: { items: NavItem[]; orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <ul className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "flex-row flex-wrap items-center")}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                active ? "bg-accent-soft text-accent-fg" : "text-fg-soft hover:bg-surface-3 hover:text-fg",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
