import "server-only";
import { headers } from "next/headers";
import { sha256Hex } from "./crypto";

/**
 * Client IP as reported by the platform proxy (Vercel sets x-forwarded-for).
 * Only a hash is ever stored (data minimisation).
 */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return sha256Hex(`ip:${ip}`).slice(0, 32);
}

/**
 * Rejects cross-site mutating requests to route handlers: the Origin header must
 * be the request host itself (same-origin). Server Actions have an equivalent
 * built-in check in Next.js.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
