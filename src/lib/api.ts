import "server-only";
import { NextResponse } from "next/server";
import { AppError, toAppError } from "@/lib/observability/errors";
import { isSameOriginRequest } from "@/lib/security/request";

/** Wraps a route handler: same-origin check for mutations + safe error mapping. */
export function apiHandler<Ctx>(
  handler: (request: Request, context: Ctx) => Promise<Response>,
  options: { mutating?: boolean } = { mutating: true },
) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    try {
      if (options.mutating !== false && !isSameOriginRequest(request)) {
        throw new AppError("forbidden", "cross_origin");
      }
      return await handler(request, context);
    } catch (error) {
      const appError = toAppError(error);
      return NextResponse.json(
        { error: appError.code, reason: appError.code === "internal" ? undefined : appError.message },
        { status: appError.status, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
}
