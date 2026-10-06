import "server-only";
import { can } from "@/lib/auth/permissions";
import { AppError } from "@/lib/observability/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/types";
import { getMembershipForOrganization } from "@/lib/tenancy/context";
import type { SessionUser } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Capability = keyof typeof can;

/**
 * Loads a document AS THE USER (RLS decides visibility) and checks the role
 * capability in the document's own organization. The organization is derived
 * from the record, never from client input. Unknown and foreign documents are
 * indistinguishable (404) to avoid leaking their existence.
 */
export async function loadAuthorizedDocument(documentId: string, capability: Capability) {
  if (!UUID.test(documentId)) throw new AppError("not_found");
  const supabase = await createSupabaseServerClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select(
      "id, organization_id, storage_path, mime_type, file_sha256, status, processing_status, document_type, category_id, original_filename, file_size, updated_at",
    )
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!doc) throw new AppError("not_found");

  const membership = await getMembershipForOrganization(doc.organization_id);
  if (!membership) throw new AppError("not_found");
  if (!can[capability](membership.role)) throw new AppError("forbidden");

  return { doc, supabase, user: membership.user as SessionUser, role: membership.role as MemberRole };
}
