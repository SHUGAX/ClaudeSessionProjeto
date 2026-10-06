import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

/** Liveness/readiness probe. Reveals no configuration values. */
export async function GET() {
  let database: "ok" | "unconfigured" | "error" = "unconfigured";
  if (isSupabaseConfigured()) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      database = res.status < 500 ? "ok" : "error";
    } catch {
      database = "error";
    }
  }
  const healthy = database === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", database, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
