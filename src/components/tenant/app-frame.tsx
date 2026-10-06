"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { SidebarNav, type NavItem } from "./sidebar-nav";

/** Responsive frame: fixed sidebar on desktop, slide-over drawer on mobile. */
export function AppFrame({
  sidebarHeader,
  navItems,
  sidebarFooter,
  topbar,
  children,
}: {
  sidebarHeader: ReactNode;
  navItems: NavItem[];
  sidebarFooter?: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-3 pt-4">{sidebarHeader}</div>
      <div className="flex-1 overflow-y-auto px-3">
        <SidebarNav items={navItems} onNavigate={() => setOpen(false)} />
      </div>
      {sidebarFooter ? <div className="border-t border-border px-3 py-3">{sidebarFooter}</div> : null}
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-surface lg:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/30"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label={t("common.close")}
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t("nav.openMenu")}
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{topbar}</div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
