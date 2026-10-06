import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/security/request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST-only sign out (GET would allow cross-site logout via image tags). */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
