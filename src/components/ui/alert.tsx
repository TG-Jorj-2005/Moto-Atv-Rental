import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  success: { box: "border-green-300 bg-green-50 text-green-900", icon: CheckCircle2, role: "status" },
  error: { box: "border-red-300 bg-red-50 text-red-900", icon: XCircle, role: "alert" },
  warning: { box: "border-amber-300 bg-amber-50 text-amber-950", icon: AlertTriangle, role: "status" },
  info: { box: "border-sky-300 bg-sky-50 text-sky-950", icon: Info, role: "status" },
} as const;

export function Alert({ tone = "info", title, className, children }: { tone?: keyof typeof tones; title?: string; className?: string; children?: React.ReactNode }) {
  const { box, icon: Icon, role } = tones[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border p-3 text-sm", box, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
