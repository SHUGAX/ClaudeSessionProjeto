import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * Creates a throw-away database, applies the Supabase shim + all migrations and
 * returns helpers to run SQL as a given end user (role "authenticated" with JWT
 * claims), exactly like PostgREST does.
 *
 * Configure with TEST_DATABASE_URL (a superuser connection to any database on
 * the server, e.g. postgresql://postgres:postgres@127.0.0.1:5432/postgres).
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export interface TestDb {
  admin: pg.Client;
  url: string;
  asUser<T>(userId: string | null, fn: (client: pg.Client) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const root = path.resolve(__dirname, "../..");

export async function createTestDatabase(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `rls_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const server = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await server.connect();
  await server.query(`create database ${name}`);
  await server.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(readFileSync(path.join(root, "tests/db/supabase-shim.sql"), "utf8"));
  const migrationsDir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await admin.query(readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  const userClient = new pg.Client({ connectionString: url.toString() });
  await userClient.connect();

  return {
    admin,
    url: url.toString(),
    async asUser(userId, fn) {
      await userClient.query("begin");
      try {
        const role = userId ? "authenticated" : "anon";
        const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
        await userClient.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
        await userClient.query(`set local role ${role}`);
        return await fn(userClient);
      } finally {
        await userClient.query("rollback");
      }
    },
    async close() {
      await userClient.end();
      await admin.end();
      const s = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await s.connect();
      await s.query(`drop database if exists ${name} with (force)`);
      await s.end();
    },
  };
}

export const IDS = {
  orgA: "aaaaaaaa-0000-4000-8000-000000000001",
  orgB: "bbbbbbbb-0000-4000-8000-000000000001",
  ownerA: "aaaaaaaa-1111-4000-8000-000000000001",
  adminA: "aaaaaaaa-1111-4000-8000-000000000002",
  viewerA: "aaaaaaaa-1111-4000-8000-000000000003",
  ownerB: "bbbbbbbb-1111-4000-8000-000000000001",
  platform: "cccccccc-1111-4000-8000-000000000001",
  outsider: "dddddddd-1111-4000-8000-000000000001",
  docA: "aaaaaaaa-2222-4000-8000-000000000001",
  docB: "bbbbbbbb-2222-4000-8000-000000000001",
  supplierA: "aaaaaaaa-3333-4000-8000-000000000001",
  supplierB: "bbbbbbbb-3333-4000-8000-000000000001",
  categoryB: "bbbbbbbb-4444-4000-8000-000000000001",
};

/** Two tenants with members, suppliers, documents and storage objects. */
export async function seedFixtures(db: TestDb) {
  const q = (sql: string, params: unknown[] = []) => db.admin.query(sql, params);
  for (const [id, email] of [
    [IDS.ownerA, "owner-a@test"],
    [IDS.adminA, "admin-a@test"],
    [IDS.viewerA, "viewer-a@test"],
    [IDS.ownerB, "owner-b@test"],
    [IDS.platform, "platform@test"],
    [IDS.outsider, "outsider@test"],
  ]) {
    await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }
  await q("insert into public.platform_admins (user_id) values ($1)", [IDS.platform]);
  await q(
    "insert into public.organizations (id, name, slug) values ($1, 'Org A', 'org-a'), ($2, 'Org B', 'org-b')",
    [IDS.orgA, IDS.orgB],
  );
  await q("insert into public.organization_settings (organization_id) values ($1), ($2)", [
    IDS.orgA,
    IDS.orgB,
  ]);
  await q(
    `insert into public.organization_members (organization_id, user_id, role) values
      ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'viewer'), ($5, $6, 'owner')`,
    [IDS.orgA, IDS.ownerA, IDS.adminA, IDS.viewerA, IDS.orgB, IDS.ownerB],
  );
  await q(
    "insert into public.categories (id, organization_id, name) values ($1, $2, 'Energia B')",
    [IDS.categoryB, IDS.orgB],
  );
  await q(
    "insert into public.suppliers (id, organization_id, name, tax_id) values ($1, $2, 'Fornecedor A', '123456789'), ($3, $4, 'Fornecedor B', '123456789')",
    [IDS.supplierA, IDS.orgA, IDS.supplierB, IDS.orgB],
  );
  for (const [id, org, supplier] of [
    [IDS.docA, IDS.orgA, IDS.supplierA],
    [IDS.docB, IDS.orgB, IDS.supplierB],
  ]) {
    const storagePath = `organizations/${org}/documents/${id}/original.pdf`;
    await q(
      `insert into public.documents (id, organization_id, status, original_filename, storage_path, supplier_id, document_number, total, mime_type)
       values ($1, $2, 'review_required', 'f.pdf', $3, $4, 'FT 1', 100, 'application/pdf')`,
      [id, org, storagePath, supplier],
    );
    await q("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
      storagePath,
    ]);
    await q(
      "insert into public.audit_logs (organization_id, action, entity_type, entity_id) values ($1, 'document.uploaded', 'document', $2), ($1, 'member.invited', 'invitation', null)",
      [org, id],
    );
  }
  await q(
    `insert into public.invitations (organization_id, email, role, token_hash, expires_at)
     values ($1, 'new@test', 'member', repeat('a', 64), now() + interval '7 days')`,
    [IDS.orgB],
  );
}
