import { publicEnv } from "@/lib/env";

/** Public URL of a tenant logo (logos live in the public "organization-logos" bucket). */
export function logoPublicUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  if (!/^[0-9a-f-]{36}\/logo-[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(logoPath)) return null;
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/organization-logos/${logoPath}`;
}
