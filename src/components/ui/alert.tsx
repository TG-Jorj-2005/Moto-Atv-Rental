import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  success: { box: "border-success/40 bg-success-soft text-fg", icon: CheckCircle2, role: "status" },
  error: { box: "border-danger/40 bg-danger-soft text-fg", icon: XCircle, role: "alert" },
  warning: { box: "border-warning/40 bg-warning-soft text-fg", icon: AlertTriangle, role: "status" },
  info: { box: "border-info/40 bg-info-soft text-fg", icon: Info, role: "status" },
} as const;

const iconColor = { success: "text-success", error: "text-danger", warning: "text-warning", info: "text-info" } as const;

export function Alert({ tone = "info", title, className, children }: { tone?: keyof typeof tones; title?: string; className?: string; children?: React.ReactNode }) {
  const { box, icon: Icon, role } = tones[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border p-3 text-sm", box, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", iconColor[tone])} />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
