"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Compact menu for small screens: closes on Escape, on an outside tap and after navigating to another page, and
// returns focus to its button. Content is rendered by the server and passed in as children.
export function MobileMenu({ label, align = "right", className, children }: { label: string; align?: "left" | "right"; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-label={open ? `Close ${label}` : `Open ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 cursor-pointer place-items-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-surface-3"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
      </button>
      {open && (
        <div className={cn("absolute z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-2 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  );
}
