import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "organization.created"
  | "organization.updated"
  | "organization.suspended"
  | "organization.reactivated"
  | "settings.updated"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.deactivated"
  | "member.reactivated"
  | "member.removed"
  | "invitation.revoked"
  | "invitation.resent"
  | "document.uploaded"
  | "document.processing_started"
  | "document.extracted"
  | "document.extraction_failed"
  | "document.updated"
  | "document.validated"
  | "document.reopened"
  | "document.archived"
  | "document.unarchived"
  | "document.marked_paid"
  | "document.marked_unpaid"
  | "document.viewed"
  | "supplier.created"
  | "supplier.updated"
  | "category.created"
  | "category.updated"
  | "category.deleted";

export interface AuditEntry {
  organizationId: string | null;
  actorUserId: string | null;
  actorType?: "user" | "system" | "platform_admin";
  action: AuditAction;
  entityType:
    "organization" | "settings" | "member" | "invitation" | "document" | "supplier" | "category";
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends to the immutable audit log (service role; end users cannot write or
 * modify audit records). Failures are logged but never break the user action.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      organization_id: entry.organizationId,
      actor_user_id: entry.actorUserId,
      actor_type: entry.actorType ?? (entry.actorUserId ? "user" : "system"),
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      old_values: (entry.oldValues ?? null) as Json,
      new_values: (entry.newValues ?? null) as Json,
      metadata: (entry.metadata ?? {}) as { [key: string]: Json | undefined },
    });
    if (error) throw error;
  } catch (error) {
    logger.error("audit_write_failed", { action: entry.action, entityId: entry.entityId, error });
  }
}

/** Returns only the fields whose values changed, as {old, new} maps. */
export function diffValues<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { oldValues: Partial<T>; newValues: Partial<T> } | null {
  const oldValues: Partial<T> = {};
  const newValues: Partial<T> = {};
  for (const key of Object.keys(after) as Array<keyof T>) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValues[key] = a as T[keyof T];
      newValues[key] = b as T[keyof T];
    }
  }
  return Object.keys(newValues).length ? { oldValues, newValues } : null;
}
