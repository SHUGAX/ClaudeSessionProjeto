import type { MemberRole } from "@/lib/supabase/types";

/**
 * Role → capability mapping. UI and server code must use these helpers rather
 * than comparing role strings. Database RLS policies mirror these rules
 * (see supabase/migrations/*_security.sql).
 */
const RANK: Record<MemberRole, number> = { viewer: 0, member: 1, manager: 2, admin: 3, owner: 4 };

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export const can = {
  viewDocuments: (_role: MemberRole) => true,
  uploadDocuments: (role: MemberRole) => roleAtLeast(role, "member"),
  editDocuments: (role: MemberRole) => roleAtLeast(role, "member"),
  validateDocuments: (role: MemberRole) => roleAtLeast(role, "member"),
  archiveDocuments: (role: MemberRole) => roleAtLeast(role, "member"),
  createSuppliers: (role: MemberRole) => roleAtLeast(role, "member"),
  manageSuppliers: (role: MemberRole) => roleAtLeast(role, "manager"),
  manageCategories: (role: MemberRole) => roleAtLeast(role, "manager"),
  manageUsers: (role: MemberRole) => roleAtLeast(role, "admin"),
  manageOrganization: (role: MemberRole) => roleAtLeast(role, "admin"),
  viewAuditLog: (role: MemberRole) => roleAtLeast(role, "admin"),
  viewUsage: (role: MemberRole) => roleAtLeast(role, "admin"),
  manageOwners: (role: MemberRole) => role === "owner",
} as const;

/** Roles that `actor` may assign to others. Nobody can create platform admins here. */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  if (actor === "owner") return ["owner", "admin", "manager", "member", "viewer"];
  if (actor === "admin") return ["admin", "manager", "member", "viewer"];
  return [];
}

/** Whether `actor` may change/remove a membership that currently has `target` role. */
export function canManageMember(actor: MemberRole, target: MemberRole): boolean {
  if (!can.manageUsers(actor)) return false;
  if (target === "owner") return actor === "owner";
  return true;
}
