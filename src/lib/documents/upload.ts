import "server-only";
import { randomUUID } from "node:crypto";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { AppError } from "@/lib/observability/errors";
import { logger } from "@/lib/observability/logger";
import { sha256Hex } from "@/lib/security/crypto";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/lib/supabase/types";
import type { TenantContext } from "@/lib/tenancy/context";
import { loadAuthorizedDocument } from "./access";
import {
  ALLOWED_TYPES,
  buildStoragePath,
  detectMimeType,
  MAX_UPLOAD_BYTES,
  mimeFromExtension,
  sanitizeFilename,
} from "./file-types";

export interface UploadIntent {
  documentId: string;
  storagePath: string;
  signedUrl: string;
  token: string;
}

/**
 * Step 1: authorize, check plan limits, create the document record and issue a
 * short-lived signed upload URL for a server-chosen storage path. The browser
 * uploads the bytes directly to private storage (no size limits of serverless
 * functions, and no public URL is ever created).
 */
export async function createUploadIntent(
  ctx: TenantContext,
  input: { filename: string; size: number; documentType: DocumentType },
): Promise<UploadIntent> {
  if (!can.uploadDocuments(ctx.role)) throw new AppError("forbidden");
  if (
    !(await rateLimit(
      `upload:${ctx.user.id}`,
      RATE_LIMITS.uploadIntent.max,
      RATE_LIMITS.uploadIntent.windowSeconds,
    ))
  ) {
    throw new AppError("rate_limited");
  }

  const claimedMime = mimeFromExtension(input.filename);
  if (!claimedMime) throw new AppError("unsupported_file");
  if (!Number.isFinite(input.size) || input.size <= 0)
    throw new AppError("invalid_input", "empty_file");
  if (input.size > MAX_UPLOAD_BYTES) throw new AppError("file_too_large");

  const admin = createSupabaseAdminClient();
  const { data: limits } = await admin.rpc("organization_limits", { p_org: ctx.organization.id });
  const l = limits?.[0];
  if (l?.max_documents_per_month != null && l.documents_this_month >= l.max_documents_per_month) {
    throw new AppError("limit_reached", "documents_limit");
  }
  if (
    l?.max_storage_bytes != null &&
    Number(l.storage_bytes) + input.size > Number(l.max_storage_bytes)
  ) {
    throw new AppError("limit_reached", "storage_limit");
  }

  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("organization_settings")
    .select("default_currency")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  const documentId = randomUUID();
  const storagePath = buildStoragePath(ctx.organization.id, documentId, claimedMime);

  // Inserted AS THE USER: RLS checks the role; a trigger forces system fields.
  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    organization_id: ctx.organization.id,
    document_type: input.documentType,
    original_filename: sanitizeFilename(input.filename),
    storage_path: storagePath,
    currency: settings?.default_currency ?? "EUR",
  });
  if (insertError) {
    logger.warn("document_insert_failed", { code: insertError.code });
    throw new AppError(insertError.code === "42501" ? "forbidden" : "internal");
  }

  const { data: signed, error: signError } = await admin.storage
    .from("documents")
    .createSignedUploadUrl(storagePath);
  if (signError || !signed) {
    await admin.from("documents").delete().eq("id", documentId).eq("status", "uploading");
    throw new AppError("storage_error", signError?.message);
  }

  return { documentId, storagePath, signedUrl: signed.signedUrl, token: signed.token };
}

/**
 * Step 2: verify what was actually uploaded (size, magic bytes), compute the
 * SHA-256 and mark the document as uploaded. Invalid files are removed and the
 * aborted record deleted (it never became a business document).
 */
export async function finalizeUpload(documentId: string) {
  const { doc, user } = await loadAuthorizedDocument(documentId, "uploadDocuments");
  if (doc.status !== "uploading")
    return { documentId, status: doc.status, duplicateOf: null as string | null };

  const admin = createSupabaseAdminClient();
  const discard = async () => {
    await admin.storage.from("documents").remove([doc.storage_path]);
    await admin
      .from("documents")
      .delete()
      .eq("id", doc.id)
      .eq("organization_id", doc.organization_id)
      .eq("status", "uploading");
  };

  const { data: blob, error } = await admin.storage.from("documents").download(doc.storage_path);
  if (error || !blob) {
    await discard();
    throw new AppError("storage_error", "upload_not_found");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) {
    await discard();
    throw new AppError("invalid_input", "empty_file");
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    await discard();
    throw new AppError("file_too_large");
  }
  const realMime = detectMimeType(bytes);
  if (!realMime || !(realMime in ALLOWED_TYPES)) {
    await discard();
    throw new AppError("unsupported_file");
  }

  const sha256 = sha256Hex(bytes);
  const { data: identical } = await admin
    .from("documents")
    .select("id")
    .eq("organization_id", doc.organization_id)
    .eq("file_sha256", sha256)
    .neq("id", doc.id)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  const { error: updateError } = await admin
    .from("documents")
    .update({
      status: "uploaded",
      mime_type: realMime,
      file_size: bytes.byteLength,
      file_sha256: sha256,
      possible_duplicate_of: identical?.id ?? null,
      updated_by: user.id,
    })
    .eq("id", doc.id)
    .eq("organization_id", doc.organization_id)
    .eq("status", "uploading");
  if (updateError) throw new AppError("internal", updateError.message);

  await admin.rpc("increment_usage", { p_org: doc.organization_id, p_documents_uploaded: 1 });
  await recordAudit({
    organizationId: doc.organization_id,
    actorUserId: user.id,
    action: "document.uploaded",
    entityType: "document",
    entityId: doc.id,
    newValues: {
      original_filename: doc.original_filename,
      mime_type: realMime,
      file_size: bytes.byteLength,
    },
    metadata: { sha256, exactDuplicateOf: identical?.id ?? null },
  });

  return { documentId, status: "uploaded", duplicateOf: identical?.id ?? null };
}
