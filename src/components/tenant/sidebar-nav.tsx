"use client";

import {
  Bell,
  Bot,
  FileText,
  FolderTree,
  LayoutDashboard,
  ScrollText,
  Settings,
  Truck,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: MessageKey;
  icon:
    | "dashboard"
    | "documents"
    | "upload"
    | "suppliers"
    | "categories"
    | "alerts"
    | "assistant"
    | "users"
    | "settings"
    | "audit";
  badge?: number;
  exact?: boolean;
}

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  dashboard: LayoutDashboard,
  documents: FileText,
  upload: Upload,
  suppliers: Truck,
  categories: FolderTree,
  alerts: Bell,
  assistant: Bot,
  users: Users,
  settings: Settings,
  audit: ScrollText,
};

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Principal">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors",
              active
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">{t(item.label)}</span>
            {item.badge ? (
              <span className="tabular bg-danger rounded-full px-1.5 text-[11px] leading-5 font-semibold text-white">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
