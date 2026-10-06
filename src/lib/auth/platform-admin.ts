import "server-only";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/observability/errors";
import { getSessionUser, isPlatformAdmin, type SessionUser } from "./session";

/**
 * Platform (SaaS) administrators are listed in public.platform_admins, which
 * end users cannot write. The admin area uses the service role ONLY after this
 * check, and never exposes tenant document contents.
 */
export async function requirePlatformAdminPage(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await isPlatformAdmin())) notFound();
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("unauthenticated");
  if (!(await isPlatformAdmin())) throw new AppError("forbidden");
  return user;
}
