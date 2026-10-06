import "server-only";
import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/observability/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_LOGO_BYTES = 1024 * 1024;

function detectLogoType(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/**
 * Stores a tenant logo in the public "organization-logos" bucket. SVG is not
 * accepted (script injection risk). The caller must have authorized the user.
 */
export async function uploadOrganizationLogo(organizationId: string, file: File): Promise<string> {
  if (file.size === 0 || file.size > MAX_LOGO_BYTES) throw new AppError("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectLogoType(bytes);
  if (!type) throw new AppError("unsupported_file");

  const admin = createSupabaseAdminClient();
  const path = `${organizationId}/logo-${randomBytes(8).toString("hex")}.${type}`;
  const contentType = type === "jpg" ? "image/jpeg" : `image/${type}`;
  const { error } = await admin.storage.from("organization-logos").upload(path, bytes, { contentType, upsert: false });
  if (error) throw new AppError("storage_error", error.message);

  const { data: previous } = await admin.from("organizations").select("logo_path").eq("id", organizationId).single();
  await admin.from("organizations").update({ logo_path: path }).eq("id", organizationId);
  if (previous?.logo_path) await admin.storage.from("organization-logos").remove([previous.logo_path]);
  return path;
}
