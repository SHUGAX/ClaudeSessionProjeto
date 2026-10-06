import { apiHandler, json } from "@/lib/api";
import { loadAuthorizedDocument } from "@/lib/documents/access";
import { runExtractionPipeline } from "@/lib/documents/pipeline";
import { createPipelineDeps } from "@/lib/documents/repository";
import { AppError } from "@/lib/observability/errors";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// AI extraction can take a while for multi-page documents.
export const maxDuration = 120;

export const POST = apiHandler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { doc, user } = await loadAuthorizedDocument(id, "editDocuments");

    if (doc.status === "validated" || doc.status === "archived" || doc.status === "uploading") {
      throw new AppError("conflict", "invalid_status");
    }
    if (
      !(await rateLimit(
        `extract:${user.id}`,
        RATE_LIMITS.extraction.max,
        RATE_LIMITS.extraction.windowSeconds,
      ))
    ) {
      throw new AppError("rate_limited");
    }

    const admin = createSupabaseAdminClient();
    const { data: limits } = await admin.rpc("organization_limits", { p_org: doc.organization_id });
    const l = limits?.[0];
    if (l?.max_ai_calls_per_month != null && l.ai_calls_this_month >= l.max_ai_calls_per_month) {
      throw new AppError("limit_reached", "ai_limit");
    }

    const outcome = await runExtractionPipeline(
      {
        id: doc.id,
        organizationId: doc.organization_id,
        storagePath: doc.storage_path,
        mimeType: doc.mime_type,
        fileSha256: doc.file_sha256,
        status: doc.status,
        documentType: doc.document_type,
        categoryId: doc.category_id,
      },
      user.id,
      createPipelineDeps(),
    );
    return json(outcome);
  },
);
