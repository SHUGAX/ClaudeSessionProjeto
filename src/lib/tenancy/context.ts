import "server-only";
import { cache } from "react";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/observability/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberRole, OrganizationStatus } from "@/lib/supabase/types";

export interface TenantPublicInfo {
  id: string;
  name: string;
  slug: string;
  logoPath: string | null;
  status: OrganizationStatus;
}

export interface TenantContext {
  user: SessionUser;
  organization: TenantPublicInfo & { legalName: string | null; taxId: string | null };
  role: MemberRole;
}

export type TenantResolution =
  | { kind: "not_found" }
  | { kind: "suspended"; tenant: TenantPublicInfo }
  | { kind: "unauthenticated"; tenant: TenantPublicInfo }
  | { kind: "forbidden"; tenant: TenantPublicInfo; user: SessionUser }
  | { kind: "ok"; context: TenantContext };

/** Public (display-only) information about a tenant, for branded pages. */
export const getTenantPublicInfo = cache(async (slug: string): Promise<TenantPublicInfo | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_tenant_public_info", { p_slug: slug });
  const row = !error && data ? data[0] : undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoPath: row.logo_path,
    status: row.status,
  };
});

/**
 * Resolves the tenant for a request. The slug only identifies WHICH tenant is
 * requested; access requires (1) an authenticated user, (2) an active
 * membership in that organization, (3) the organization to be active. The
 * membership row is read through RLS with the user's own session.
 */
export const resolveTenant = cache(async (slug: string): Promise<TenantResolution> => {
  const tenant = await getTenantPublicInfo(slug);
  if (!tenant) return { kind: "not_found" };
  if (tenant.status !== "active") return { kind: "suspended", tenant };

  const user = await getSessionUser();
  if (!user) return { kind: "unauthenticated", tenant };

  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "role, status, organizations!inner(id, name, slug, legal_name, tax_id, logo_path, status)",
    )
    .eq("organization_id", tenant.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) return { kind: "forbidden", tenant, user };
  const org = membership.organizations;
  return {
    kind: "ok",
    context: {
      user,
      role: membership.role,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        legalName: org.legal_name,
        taxId: org.tax_id,
        logoPath: org.logo_path,
        status: org.status,
      },
    },
  };
});

/** For server actions / route handlers: returns the context or throws. */
export async function requireTenantContext(slug: string): Promise<TenantContext> {
  const resolution = await resolveTenant(slug);
  switch (resolution.kind) {
    case "ok":
      return resolution.context;
    case "unauthenticated":
      throw new AppError("unauthenticated");
    case "suspended":
      throw new AppError("organization_suspended");
    case "not_found":
      throw new AppError("not_found");
    default:
      throw new AppError("forbidden");
  }
}

/**
 * Resolves the caller's membership for an organization id (used by API routes
 * where the organization is derived from the target record, never from input).
 */
export async function getMembershipForOrganization(
  organizationId: string,
): Promise<{ user: SessionUser; role: MemberRole } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role, organizations!inner(status)")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!data || data.organizations.status !== "active") return null;
  return { user, role: data.role };
}
