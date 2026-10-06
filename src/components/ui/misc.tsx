import { Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? (
          <div className="text-muted-foreground mb-1.5 text-[13px]">{breadcrumb}</div>
        ) : null}
        <h1 className="text-foreground truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}
    >
      {Icon ? (
        <div className="bg-muted text-muted-foreground mb-3 flex size-10 items-center justify-center rounded-full">
          <Icon className="size-5" aria-hidden />
        </div>
      ) : null}
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-[13px]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-muted animate-pulse rounded-md", className)} aria-hidden />;
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 className={cn("text-muted-foreground size-4 animate-spin", className)} aria-hidden />
      {label ? (
        <span className="text-muted-foreground text-sm">{label}</span>
      ) : (
        <span className="sr-only">…</span>
      )}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "neutral" | "warning" | "danger" | "success";
  href?: string;
}) {
  const toneCls = {
    neutral: "text-muted-foreground bg-muted",
    warning: "text-warning bg-warning-soft",
    danger: "text-danger bg-danger-soft",
    success: "text-success bg-success-soft",
  }[tone];
  const content = (
    <div className="border-border bg-surface hover:border-input flex h-full items-start justify-between gap-3 rounded-lg border p-4 shadow-[var(--shadow-card)] transition-colors">
      <div className="min-w-0">
        <p className="text-muted-foreground text-[13px]">{label}</p>
        <p className="tabular mt-1.5 truncate text-xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </div>
      {Icon ? (
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", toneCls)}>
          <Icon className="size-4" aria-hidden />
        </div>
      ) : null}
    </div>
  );
  return href ? (
    <a href={href} className="block rounded-lg focus-visible:outline-2">
      {content}
    </a>
  ) : (
    content
  );
}
