"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MemberRole } from "@/lib/supabase/types";
import { tenantPath } from "@/lib/tenancy/urls";

interface TenantClientContext {
  slug: string;
  organizationId: string;
  organizationName: string;
  role: MemberRole;
  userId: string;
  currency: string;
  timezone: string;
}

const Ctx = createContext<TenantClientContext | null>(null);

export function TenantProvider({ value, children }: { value: TenantClientContext; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useTenant must be used inside <TenantProvider>");
  return { ...value, href: (path: string) => tenantPath(value.slug, path) };
}
