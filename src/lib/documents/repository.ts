import "server-only";
import { getExtractionProvider } from "@/lib/ai/provider";
import { recordAudit } from "@/lib/audit";
import { todayIso } from "@/lib/dates";
import type { Json } from "@/lib/supabase/database.types";
import { numericParam, toJson } from "@/lib/supabase/values";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { countIssues } from "./validation";
import { STALE_PROCESSING_MS } from "./status";
import { normalizeDocumentNumber } from "./duplicates";
import type { PipelineDeps } from "./pipeline";
import { normalizeTaxId } from "@/lib/validation/tax-id";

/**
 * Supabase implementation of the pipeline side effects. Runs with the service
 * role AFTER the caller has been authorized; every statement is explicitly
 * scoped by organization_id.
 */
export function createPipelineDeps(): PipelineDeps {
  const admin = createSupabaseAdminClient();

  return {
    provider: getExtractionProvider(),

    async claimForProcessing(doc, actorUserId) {
      const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
      const { data, error } = await admin
        .from("documents")
        .update({
          status: "processing",
          processing_status: "processing",
          processing_started_at: new Date().toISOString(),
          processing_error: null,
          updated_by: actorUserId,
        })
        .eq("id", doc.id)
        .eq("organization_id", doc.organizationId)
        .or(
          `status.in.(uploaded,failed,review_required),and(status.eq.processing,processing_started_at.lt.${staleBefore})`,
        )
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async downloadOriginal(doc) {
      const { data, error } = await admin.storage.from("documents").download(doc.storagePath);
      if (error || !data)
        throw new Error(`storage_download_failed: ${error?.message ?? "no data"}`);
      return new Uint8Array(await data.arrayBuffer());
    },

    async saveExtraction(doc, result, actorUserId) {
      const { data, error } = await admin
        .from("document_extractions")
        .insert({
          organization_id: doc.organizationId,
          document_id: doc.id,
          provider: result.provider,
          model: result.model,
          prompt_version: result.promptVersion,
          schema_version: result.schemaVersion,
          status: result.ok ? "success" : "error",
          raw_response: (result.raw ?? null) as Json,
          structured_data: result.ok ? (result.data as unknown as Json) : null,
          confidence: result.ok ? (result.data.confidence as unknown as Json) : null,
          error_code: result.ok ? null : result.errorCode,
          error_message: result.ok ? null : result.errorMessage.slice(0, 1000),
          processing_duration_ms: Math.max(0, Math.round(result.durationMs)),
          input_tokens: result.ok ? (result.usage?.inputTokens ?? null) : null,
          output_tokens: result.ok ? (result.usage?.outputTokens ?? null) : null,
          triggered_by: actorUserId,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("extraction_insert_failed");
      return data.id;
    },

    async listSuppliers(organizationId) {
      const { data, error } = await admin
        .from("suppliers")
        .select("id, name, tax_id, default_category_id")
        .eq("organization_id", organizationId)
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },

    async findDuplicateCandidates(organizationId, subject) {
      const filters: string[] = [];
      if (subject.fileSha256) filters.push(`file_sha256.eq.${subject.fileSha256}`);
      const number = normalizeDocumentNumber(subject.documentNumber);
      if (number) filters.push(`document_number_normalized.eq."${number.replace(/"/g, "")}"`);
      const taxId = normalizeTaxId(subject.supplierTaxId);
      if (taxId && subject.issueDate) {
        filters.push(
          `and(supplier_tax_id_normalized.eq."${taxId}",issue_date.eq.${subject.issueDate})`,
        );
      }
      if (subject.supplierId && subject.issueDate) {
        filters.push(
          `and(supplier_id.eq.${subject.supplierId},issue_date.eq.${subject.issueDate})`,
        );
      }
      if (filters.length === 0) return [];
      const { data, error } = await admin
        .from("documents")
        .select(
          "id, supplier_id, supplier_tax_id, document_number, issue_date, total, file_sha256, status",
        )
        .eq("organization_id", organizationId)
        .neq("id", subject.id)
        .neq("status", "archived")
        .or(filters.join(","))
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        supplierId: d.supplier_id,
        supplierTaxId: d.supplier_tax_id,
        documentNumber: d.document_number,
        issueDate: d.issue_date,
        total: d.total == null ? null : String(d.total),
        fileSha256: d.file_sha256,
        status: d.status,
      }));
    },

    async applyExtraction(doc, applied, actorUserId) {
      const { data } = applied;
      const { error } = await admin
        .from("documents")
        .update({
          status: "review_required",
          processing_status: "success",
          review_status: "needs_review",
          processing_error: null,
          current_extraction_id: applied.extractionId,
          document_type: data.documentType,
          supplier_id: applied.supplier?.id ?? null,
          supplier_name: data.supplier.name ?? applied.supplier?.name ?? null,
          supplier_tax_id: data.supplier.taxId,
          document_number: data.documentNumber,
          issue_date: data.issueDate,
          due_date: data.dueDate,
          currency: data.currency ?? "EUR",
          subtotal: numericParam(data.subtotal),
          tax_total: numericParam(data.taxTotal),
          total: numericParam(data.total),
          payment_reference: data.paymentReference,
          iban: data.iban,
          purchase_order: data.purchaseOrder,
          category_id: applied.categoryId,
          validation_issues: toJson(applied.issues),
          possible_duplicate_of: applied.possibleDuplicateOf,
          updated_by: actorUserId,
        })
        .eq("id", doc.id)
        .eq("organization_id", doc.organizationId);
      if (error) throw error;

      await admin
        .from("document_line_items")
        .delete()
        .eq("document_id", doc.id)
        .eq("organization_id", doc.organizationId);
      if (data.lineItems.length > 0) {
        const { error: liError } = await admin.from("document_line_items").insert(
          data.lineItems.slice(0, 500).map((li, position) => ({
            organization_id: doc.organizationId,
            document_id: doc.id,
            position,
            description: li.description,
            quantity: numericParam(li.quantity),
            unit_price: numericParam(li.unitPrice),
            tax_rate: numericParam(li.taxRate),
            tax_amount: numericParam(li.taxAmount),
            line_total: numericParam(li.lineTotal),
          })),
        );
        if (liError) throw liError;
      }
    },

    async markFailed(doc, _extractionId, errorCode, actorUserId) {
      await admin
        .from("documents")
        .update({
          status: "failed",
          processing_status: "error",
          processing_error: errorCode.slice(0, 100),
          updated_by: actorUserId,
        })
        .eq("id", doc.id)
        .eq("organization_id", doc.organizationId);
    },

    async recordValidationEvent(doc, issues, actorUserId) {
      const counts = countIssues(issues);
      await admin.from("document_validation_events").insert({
        organization_id: doc.organizationId,
        document_id: doc.id,
        source: "extraction",
        issues: toJson(issues),
        error_count: counts.errors,
        warning_count: counts.warnings,
        created_by: actorUserId,
      });
    },

    async audit(doc, action, actorUserId, metadata) {
      await recordAudit({
        organizationId: doc.organizationId,
        actorUserId,
        action,
        entityType: "document",
        entityId: doc.id,
        metadata,
      });
    },

    async incrementUsage(organizationId, usage) {
      await admin.rpc("increment_usage", {
        p_org: organizationId,
        p_ai_calls: usage.aiCalls,
        p_ai_failures: usage.aiFailures,
        p_documents_processed: usage.processed,
      });
    },

    async today(organizationId) {
      const { data } = await admin
        .from("organization_settings")
        .select("timezone")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return todayIso(data?.timezone ?? "Europe/Lisbon");
    },

    async afterProcessing(organizationId) {
      await admin.rpc("refresh_alerts", { p_org: organizationId });
    },
  };
}
