"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; tone: "success" | "error" };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Minimal toast store (survives component remounts within the page). */
export function toast(message: string, tone: Toast["tone"] = "success") {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4500);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: Toast[] = [];

export function Toaster() {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cn(
            "bg-surface pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg",
            t.tone === "error" ? "border-danger/30" : "border-success/30",
          )}
        >
          {t.tone === "error" ? (
            <XCircle className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
