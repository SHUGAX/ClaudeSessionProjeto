import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { cls: "border-info/20 bg-info-soft text-info", Icon: Info },
  success: { cls: "border-success/20 bg-success-soft text-success", Icon: CheckCircle2 },
  warning: { cls: "border-warning/25 bg-warning-soft text-warning", Icon: AlertTriangle },
  danger: { cls: "border-danger/20 bg-danger-soft text-danger", Icon: XCircle },
} as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const { cls, Icon } = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border px-3.5 py-3 text-[13px]", cls, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-foreground min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? (
          <div className={cn("text-foreground/80", title && "mt-0.5")}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
