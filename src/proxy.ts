import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/supabase/cookies";
import { resolveHost } from "@/lib/tenancy/host";

/**
 * Edge proxy (Next.js 16 "middleware"):
 *  1. Refreshes the Supabase session cookie.
 *  2. Maps the request host to an internal route:
 *       {slug}.root/...  → /t/{slug}/...
 *       admin.root/...   → /admin/...
 * Tenant resolution here is ROUTING ONLY. Authorization (membership + role) is
 * enforced in server code and by Row Level Security in the database.
 */

// Paths served identically on every host (never rewritten into a tenant).
const GLOBAL_PREFIXES = ["/api", "/auth", "/legal", "/invite", "/_next"];
const GLOBAL_FILES = new Set(["/pdf.worker.min.mjs", "/favicon.ico", "/icon.svg", "/robots.txt"]);
// Central account pages that also work on the admin host.
const CENTRAL_PAGES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/select-organization",
  "/no-access",
];

function isGlobalPath(pathname: string): boolean {
  return (
    GLOBAL_FILES.has(pathname) ||
    GLOBAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

export async function proxy(request: NextRequest) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const routing = process.env.NEXT_PUBLIC_TENANT_ROUTING ?? "path";
  const url = request.nextUrl.clone();
  const { pathname } = url;
  const host = request.headers.get("host");
  const hostContext =
    routing === "subdomain" ? resolveHost(host, rootDomain) : { kind: "central" as const };

  let rewriteTo: URL | null = null;
  let redirectTo: URL | null = null;

  if (hostContext.kind === "invalid") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (hostContext.kind === "tenant" && !isGlobalPath(pathname)) {
    if (pathname.startsWith("/t/") || pathname.startsWith("/admin")) {
      return new NextResponse("Not found", { status: 404 });
    }
    rewriteTo = new URL(
      `/t/${hostContext.slug}${pathname === "/" ? "" : pathname}${url.search}`,
      request.url,
    );
  } else if (
    hostContext.kind === "admin" &&
    !isGlobalPath(pathname) &&
    !pathname.startsWith("/admin") &&
    !CENTRAL_PAGES.includes(pathname)
  ) {
    rewriteTo = new URL(`/admin${pathname === "/" ? "" : pathname}${url.search}`, request.url);
  } else if (
    routing === "subdomain" &&
    hostContext.kind === "central" &&
    pathname.startsWith("/t/")
  ) {
    // Canonicalise path-style tenant URLs to the tenant subdomain.
    const [, , slug, ...rest] = pathname.split("/");
    if (slug) {
      const protocol = request.nextUrl.protocol;
      redirectTo = new URL(`${protocol}//${slug}.${rootDomain}/${rest.join("/")}${url.search}`);
    }
  }

  if (redirectTo) return NextResponse.redirect(redirectTo);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  let response = rewriteTo
    ? NextResponse.rewrite(rewriteTo, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookieOptions: sessionCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = rewriteTo
            ? NextResponse.rewrite(rewriteTo, { request: { headers: requestHeaders } })
            : NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, { ...options, ...sessionCookieOptions() });
          }
        },
      },
    });
    // Revalidates the JWT with Supabase Auth and refreshes it when needed.
    await supabase.auth.getClaims();
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|pdf.worker.min.mjs|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
