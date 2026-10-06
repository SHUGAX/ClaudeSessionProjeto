import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/observability/logger";
import { safeEqual } from "@/lib/security/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled maintenance (e.g. Vercel Cron, daily). Protected by CRON_SECRET.
 *  - refreshes alerts for every active tenant (due soon / overdue change daily)
 *  - removes abandoned uploads (records still "uploading" after 24h)
 */
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: alerts, error: alertsError } = await admin.rpc("refresh_alerts", { p_org: undefined });
  if (alertsError) logger.error("cron_refresh_alerts_failed", { code: alertsError.code });

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: abandoned } = await admin
    .from("documents")
    .select("id, organization_id, storage_path")
    .eq("status", "uploading")
    .lt("created_at", cutoff)
    .limit(500);
  let removed = 0;
  if (abandoned?.length) {
    await admin.storage.from("documents").remove(abandoned.map((d) => d.storage_path));
    const { count } = await admin
      .from("documents")
      .delete({ count: "exact" })
      .in("id", abandoned.map((d) => d.id))
      .eq("status", "uploading");
    removed = count ?? 0;
  }

  logger.info("cron_maintenance_done", { alertsUpserted: alerts ?? 0, abandonedUploadsRemoved: removed });
  return NextResponse.json({ ok: true, alertsUpserted: alerts ?? 0, abandonedUploadsRemoved: removed });
}
