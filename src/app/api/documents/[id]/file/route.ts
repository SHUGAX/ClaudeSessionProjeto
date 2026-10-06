import { apiHandler, json } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { loadAuthorizedDocument } from "@/lib/documents/access";
import { AppError } from "@/lib/observability/errors";

const SIGNED_URL_TTL_SECONDS = 120;

/**
 * Returns a short-lived signed URL for the original file. The URL is created
 * with the USER's session, so storage RLS (membership of the organization in
 * the object path) is enforced in addition to the application check.
 */
export const GET = apiHandler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { doc, supabase, user } = await loadAuthorizedDocument(id, "viewDocuments");
    if (doc.status === "uploading") throw new AppError("not_found");
    const download = new URL(request.url).searchParams.get("download") === "1";

    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(
        doc.storage_path,
        SIGNED_URL_TTL_SECONDS,
        download ? { download: doc.original_filename } : undefined,
      );
    if (error || !data) throw new AppError("not_found");

    if (download) {
      await recordAudit({
        organizationId: doc.organization_id,
        actorUserId: user.id,
        action: "document.viewed",
        entityType: "document",
        entityId: doc.id,
        metadata: { download: true },
      });
    }
    return json({
      url: data.signedUrl,
      mimeType: doc.mime_type,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  },
  { mutating: false },
);
