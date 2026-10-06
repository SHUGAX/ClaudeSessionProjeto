import pg from "pg";

/** Clears login/upload rate-limit buckets so repeated local runs are deterministic. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for e2e tests (see docs/TESTING.md)");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("delete from public.rate_limits");
  } finally {
    await client.end();
  }
}
