import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { createUploadIntent } from "@/lib/documents/upload";
import { AppError } from "@/lib/observability/errors";
import { DOCUMENT_TYPES } from "@/lib/supabase/types";
import { requireTenantContext } from "@/lib/tenancy/context";

const bodySchema = z.object({
  // Identifies WHICH tenant; membership is verified server-side.
  tenant: z.string().min(3).max(63),
  filename: z.string().min(1).max(500),
  size: z.number().int().positive(),
  documentType: z.enum(DOCUMENT_TYPES as [string, ...string[]]).default("invoice"),
});

export const POST = apiHandler(async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError("invalid_input");
  const ctx = await requireTenantContext(parsed.data.tenant);
  const intent = await createUploadIntent(ctx, {
    filename: parsed.data.filename,
    size: parsed.data.size,
    documentType: parsed.data.documentType as (typeof DOCUMENT_TYPES)[number],
  });
  return json(intent, { status: 201 });
});
