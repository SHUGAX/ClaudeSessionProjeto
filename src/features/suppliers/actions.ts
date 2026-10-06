"use server";

import { z } from "zod";
import { diffValues, recordAudit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { logger } from "@/lib/observability/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null));

const supplierSchema = z.object({
  tenant: z.string().min(3).max(63),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(300),
  legalName: optional(300),
  taxId: optional(40),
  taxCountry: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "invalid_country"),
  email: optional(320).refine(
    (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "auth.invalidEmail",
  ),
  phone: optional(50),
  address: optional(500),
  iban: optional(50).transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null)),
  notes: optional(2000),
  defaultCategoryId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success),
});

export type SupplierFormState = { error?: string; success?: string; id?: string } | undefined;

export async function saveSupplierAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message.includes(".")
        ? parsed.error.issues[0].message
        : "errors.invalid_input",
    };
  const input = parsed.data;
  const ctx = await requireTenantContext(input.tenant);
  if (!can.manageSuppliers(ctx.role)) return { error: "errors.forbidden" };

  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;
  const values = {
    name: input.name,
    legal_name: input.legalName,
    tax_id: input.taxId,
    tax_country: input.taxCountry,
    email: input.email,
    phone: input.phone,
    address: input.address,
    iban: input.iban,
    notes: input.notes,
    default_category_id: input.defaultCategoryId,
  };

  if (input.id) {
    const { data: before } = await supabase
      .from("suppliers")
      .select(
        "name, legal_name, tax_id, tax_country, email, phone, address, iban, notes, default_category_id",
      )
      .eq("id", input.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!before) return { error: "errors.not_found" };
    const { error } = await supabase
      .from("suppliers")
      .update(values)
      .eq("id", input.id)
      .eq("organization_id", orgId);
    if (error) {
      logger.warn("supplier_update_failed", { code: error.code });
      return {
        error:
          error.code === "23505"
            ? "suppliers.duplicateTaxId"
            : error.code === "23503"
              ? "errors.invalid_input"
              : "errors.internal",
      };
    }
    const diff = diffValues(before, values);
    if (diff) {
      await recordAudit({
        organizationId: orgId,
        actorUserId: ctx.user.id,
        action: "supplier.updated",
        entityType: "supplier",
        entityId: input.id,
        oldValues: diff.oldValues,
        newValues: diff.newValues,
      });
    }
    return { success: "suppliers.updated", id: input.id };
  }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...values, organization_id: orgId, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error || !data) {
    logger.warn("supplier_create_failed", { code: error?.code });
    return { error: error?.code === "23505" ? "suppliers.duplicateTaxId" : "errors.internal" };
  }
  await recordAudit({
    organizationId: orgId,
    actorUserId: ctx.user.id,
    action: "supplier.created",
    entityType: "supplier",
    entityId: data.id,
    newValues: values,
  });
  return { success: "suppliers.created", id: data.id };
}
