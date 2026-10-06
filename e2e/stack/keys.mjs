// Generates HS256 JWTs for the local test stack (anon + service_role), like the
// Supabase CLI demo keys. NEVER use these values outside local testing.
import { createHmac } from "node:crypto";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function sign(payload) {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}
const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 3600;
console.log(`ANON_KEY=${sign({ iss: "supabase-local", role: "anon", iat: now, exp })}`);
console.log(`SERVICE_KEY=${sign({ iss: "supabase-local", role: "service_role", iat: now, exp })}`);
