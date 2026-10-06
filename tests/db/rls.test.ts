import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, IDS, seedFixtures, TEST_DATABASE_URL, type TestDb } from "./harness";

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb("Row Level Security — tenant isolation", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  const count = (user: string | null, sql: string, params: unknown[] = []) =>
    db.asUser(user, async (c) => (await c.query(sql, params)).rowCount ?? 0);

  const expectDenied = async (user: string | null, sql: string, params: unknown[] = []) => {
    await expect(db.asUser(user, (c) => c.query(sql, params))).rejects.toThrow(
      /permission denied|row-level security|not allowed|immutable|cannot|only|Invalid|must keep|system-managed/i,
    );
  };

  describe("documents", () => {
    it("a member sees only their organization's documents", async () => {
      const rows = await db.asUser(
        IDS.ownerA,
        async (c) => (await c.query("select organization_id from documents")).rows,
      );
      expect(rows.length).toBe(1);
      expect(rows.every((r) => r.organization_id === IDS.orgA)).toBe(true);
    });

    it("Organization A user cannot read an Organization B document by id", async () => {
      expect(await count(IDS.ownerA, "select * from documents where id = $1", [IDS.docB])).toBe(0);
    });

    it("cannot update another tenant's document", async () => {
      expect(
        await count(IDS.ownerA, "update documents set notes = 'x' where id = $1", [IDS.docB]),
      ).toBe(0);
    });

    it("cannot insert a document into another tenant", async () => {
      await expectDenied(
        IDS.ownerA,
        `insert into documents (id, organization_id, original_filename, storage_path)
         values (gen_random_uuid(), $1::uuid, 'x.pdf', 'organizations/' || $1::text || '/documents/' || gen_random_uuid() || '/original.pdf')`,
        [IDS.orgB],
      );
    });

    it("cannot move a document to another organization", async () => {
      await expectDenied(IDS.ownerA, "update documents set organization_id = $1 where id = $2", [
        IDS.orgB,
        IDS.docA,
      ]);
    });

    it("cannot reference another tenant's category or supplier (composite FKs)", async () => {
      await expect(
        db.asUser(IDS.ownerA, (c) =>
          c.query("update documents set category_id = $1 where id = $2", [IDS.categoryB, IDS.docA]),
        ),
      ).rejects.toThrow(/foreign key/);
      await expect(
        db.asUser(IDS.ownerA, (c) =>
          c.query("update documents set supplier_id = $1 where id = $2", [IDS.supplierB, IDS.docA]),
        ),
      ).rejects.toThrow(/foreign key/);
    });

    it("viewers cannot modify documents", async () => {
      expect(
        await count(IDS.viewerA, "update documents set notes = 'x' where id = $1", [IDS.docA]),
      ).toBe(0);
    });

    it("documents cannot be deleted by end users (archive only)", async () => {
      await expectDenied(IDS.ownerA, "delete from documents where id = $1", [IDS.docA]);
    });

    it("system-managed fields are protected (mass assignment)", async () => {
      await expectDenied(
        IDS.ownerA,
        "update documents set file_sha256 = repeat('b', 64) where id = $1",
        [IDS.docA],
      );
      await expectDenied(
        IDS.ownerA,
        "update documents set storage_path = 'organizations/x/evil' where id = $1",
        [IDS.docA],
      );
      await expectDenied(
        IDS.ownerA,
        "update documents set processing_status = 'success' where id = $1",
        [IDS.docA],
      );
      await expectDenied(IDS.ownerA, "update documents set validated_by = $1 where id = $2", [
        IDS.ownerB,
        IDS.docA,
      ]);
    });

    it("validation records the real validator and time", async () => {
      const row = await db.asUser(IDS.ownerA, async (c) => {
        await c.query("update documents set status = 'validated' where id = $1", [IDS.docA]);
        return (
          await c.query(
            "select validated_by, validated_at, review_status from documents where id = $1",
            [IDS.docA],
          )
        ).rows[0];
      });
      expect(row.validated_by).toBe(IDS.ownerA);
      expect(row.validated_at).not.toBeNull();
      expect(row.review_status).toBe("validated");
    });

    it("insert by a user is forced into the 'uploading' state with server-controlled fields", async () => {
      const row = await db.asUser(IDS.ownerA, async (c) => {
        const id = (await c.query("select gen_random_uuid() as id")).rows[0].id as string;
        await c.query(
          `insert into documents (id, organization_id, original_filename, storage_path, status, file_sha256, uploaded_by)
           values ($1, $2, 'a.pdf', $3, 'validated', repeat('c', 64), $4)`,
          [id, IDS.orgA, `organizations/${IDS.orgA}/documents/${id}/original.pdf`, IDS.ownerB],
        );
        return (
          await c.query("select status, file_sha256, uploaded_by from documents where id = $1", [
            id,
          ])
        ).rows[0];
      });
      expect(row).toEqual({ status: "uploading", file_sha256: null, uploaded_by: IDS.ownerA });
    });

    it("storage path must belong to the document's own organization", async () => {
      await expectDenied(
        IDS.ownerA,
        `insert into documents (id, organization_id, original_filename, storage_path)
         values (gen_random_uuid(), $1, 'a.pdf', 'organizations/' || $2 || '/documents/x/original.pdf')`,
        [IDS.orgA, IDS.orgB],
      );
    });

    it("line items RPC cannot touch another tenant's document", async () => {
      await expect(
        db.asUser(IDS.ownerA, (c) =>
          c.query("select replace_document_line_items($1, '[]'::jsonb)", [IDS.docB]),
        ),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("related tenant data", () => {
    it.each([
      ["suppliers", "select * from suppliers"],
      ["categories", "select * from categories"],
      ["organization_members", "select * from organization_members"],
      ["organizations", "select * from organizations"],
      ["audit_logs", "select * from audit_logs"],
      ["document_extractions", "select * from document_extractions"],
      ["document_line_items", "select * from document_line_items"],
      ["alerts", "select * from alerts"],
    ])("%s are scoped to the user's organization", async (_table, sql) => {
      const rows = await db.asUser(
        IDS.ownerA,
        async (c) => (await c.query(sql)).rows as Array<{ organization_id?: string; id?: string }>,
      );
      for (const row of rows) {
        expect(row.organization_id ?? row.id).toBe(IDS.orgA);
      }
    });

    it("anonymous requests cannot read tenant tables", async () => {
      await expectDenied(null, "select * from documents");
      await expectDenied(null, "select * from suppliers");
    });

    it("a user without membership sees nothing", async () => {
      expect(await count(IDS.outsider, "select * from documents")).toBe(0);
      expect(await count(IDS.outsider, "select * from organizations")).toBe(0);
    });

    it("platform admins get NO implicit access to tenant documents", async () => {
      expect(await count(IDS.platform, "select * from documents")).toBe(0);
    });

    it("profiles are visible only for co-members", async () => {
      const emails = await db.asUser(IDS.ownerA, async (c) =>
        (await c.query("select email from profiles order by email")).rows.map((r) => r.email),
      );
      expect(emails).toEqual(["admin-a@test", "owner-a@test", "viewer-a@test"]);
    });

    it("dashboard metrics of another tenant return nothing", async () => {
      const result = await db.asUser(
        IDS.ownerA,
        async (c) => (await c.query("select dashboard_metrics($1) as m", [IDS.orgB])).rows[0].m,
      );
      expect(result).toBeNull();
    });

    it("alerts cannot be refreshed for another tenant", async () => {
      await expectDenied(IDS.ownerA, "select refresh_alerts($1)", [IDS.orgB]);
    });
  });

  describe("storage", () => {
    it("members can read only their organization's original files", async () => {
      const names = await db.asUser(IDS.ownerA, async (c) =>
        (await c.query("select name from storage.objects")).rows.map((r) => r.name as string),
      );
      expect(names).toHaveLength(1);
      expect(names[0]).toContain(IDS.orgA);
    });

    it("end users cannot write or delete originals", async () => {
      await expectDenied(
        IDS.ownerA,
        "insert into storage.objects (bucket_id, name) values ('documents', $1)",
        [`organizations/${IDS.orgA}/documents/x/original.pdf`],
      );
      expect(await count(IDS.ownerA, "delete from storage.objects")).toBe(0);
      expect(await count(IDS.ownerA, "update storage.objects set name = 'x'")).toBe(0);
    });

    it("the documents bucket is private", async () => {
      const { rows } = await db.admin.query(
        "select public from storage.buckets where id = 'documents'",
      );
      expect(rows[0].public).toBe(false);
    });
  });

  describe("audit log", () => {
    it("is append-only and not writable by end users", async () => {
      await expectDenied(
        IDS.ownerA,
        "insert into audit_logs (organization_id, action, entity_type) values ($1, 'document.viewed', 'document')",
        [IDS.orgA],
      );
      await expectDenied(IDS.ownerA, "update audit_logs set action = 'x.y'");
      await expectDenied(IDS.ownerA, "delete from audit_logs");
      await expect(
        db.admin.query("update audit_logs set action = 'document.archived'"),
      ).rejects.toThrow(/append-only/);
    });

    it("viewers see document history but not administrative events", async () => {
      const types = await db.asUser(IDS.viewerA, async (c) =>
        (await c.query("select distinct entity_type from audit_logs")).rows.map(
          (r) => r.entity_type,
        ),
      );
      expect(types).toEqual(["document"]);
    });
  });

  describe("memberships and roles", () => {
    it("an admin cannot promote anyone to owner", async () => {
      await expectDenied(
        IDS.adminA,
        "update organization_members set role = 'owner' where user_id = $1",
        [IDS.viewerA],
      );
    });

    it("users cannot change their own membership", async () => {
      await expectDenied(
        IDS.adminA,
        "update organization_members set role = 'owner' where user_id = $1",
        [IDS.adminA],
      );
    });

    it("the last owner cannot be removed or demoted", async () => {
      await expect(
        db.admin.query("update organization_members set role = 'admin' where user_id = $1", [
          IDS.ownerB,
        ]),
      ).rejects.toThrow(/at least one active owner/);
    });

    it("viewers cannot manage members", async () => {
      expect(
        await count(
          IDS.viewerA,
          "update organization_members set role = 'admin' where user_id = $1",
          [IDS.adminA],
        ),
      ).toBe(0);
    });

    it("members cannot be inserted directly by users (invitation flow only)", async () => {
      await expectDenied(
        IDS.ownerA,
        "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')",
        [IDS.orgA, IDS.outsider],
      );
    });

    it("invitations (and their token hashes) are hidden from other tenants and non-admins", async () => {
      expect(await count(IDS.ownerA, "select * from invitations")).toBe(0);
      expect(await count(IDS.viewerA, "select * from invitations")).toBe(0);
    });
  });

  describe("organizations", () => {
    it("tenant admins cannot change plan, status, limits or slug", async () => {
      await expectDenied(
        IDS.ownerA,
        "update organizations set status = 'suspended' where id = $1",
        [IDS.orgA],
      );
      await expectDenied(IDS.ownerA, "update organizations set plan_id = null where id = $1", [
        IDS.orgA,
      ]);
      await expectDenied(IDS.ownerA, "update organizations set max_users = 999 where id = $1", [
        IDS.orgA,
      ]);
      await expectDenied(IDS.ownerA, "update organizations set slug = 'hijack' where id = $1", [
        IDS.orgA,
      ]);
    });

    it("tenant users cannot become platform admins", async () => {
      await expectDenied(IDS.ownerA, "insert into platform_admins (user_id) values ($1)", [
        IDS.ownerA,
      ]);
      const isAdmin = await db.asUser(
        IDS.ownerA,
        async (c) => (await c.query("select is_platform_admin() as a")).rows[0].a,
      );
      expect(isAdmin).toBe(false);
    });

    it("suspending an organization blocks its members at the database level", async () => {
      await db.admin.query("update organizations set status = 'suspended' where id = $1", [
        IDS.orgB,
      ]);
      try {
        expect(await count(IDS.ownerB, "select * from documents")).toBe(0);
      } finally {
        await db.admin.query("update organizations set status = 'active' where id = $1", [
          IDS.orgB,
        ]);
      }
    });

    it("reserved or malformed slugs are rejected", async () => {
      await expect(
        db.admin.query("insert into organizations (name, slug) values ('x', 'admin')"),
      ).rejects.toThrow(/check constraint/);
      await expect(
        db.admin.query("insert into organizations (name, slug) values ('x', 'Bad_Slug')"),
      ).rejects.toThrow(/check constraint/);
    });
  });

  describe("privileged functions", () => {
    it.each([
      "select check_rate_limit('k', 1, 60)",
      "select increment_usage('" + IDS.orgA + "'::uuid, 1, 0, 0, 0)",
      "select platform_stats()",
      "select * from organization_overview()",
    ])("are not executable by end users: %s", async (sql) => {
      await expectDenied(IDS.ownerA, sql);
    });
  });
});
