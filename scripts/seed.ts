/**
 * Development seed (SYNTHETIC DATA ONLY).
 *   pnpm seed            → creates demo users, two tenants, suppliers, documents
 *   pnpm seed --reset    → removes the demo tenants/users first
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local).
 * Refuses to run against non-local Supabase URLs unless SEED_ALLOW_REMOTE=1.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  createSyntheticInvoicePdf,
  invoiceTotals,
  syntheticNif,
  type SyntheticInvoice,
} from "./lib/synthetic-invoice";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) &&
  process.env.SEED_ALLOW_REMOTE !== "1"
) {
  throw new Error(
    `Refusing to seed a non-local Supabase (${url}). Set SEED_ALLOW_REMOTE=1 if you really mean it.`,
  );
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Demo-Password-2026";

const USERS = [
  { key: "platform", email: "admin@docuflow.test", name: "Administrador Plataforma" },
  { key: "ownerA", email: "ana@empresa-a.test", name: "Ana Martins" },
  { key: "viewerA", email: "carla@empresa-a.test", name: "Carla Sousa" },
  { key: "ownerB", email: "bruno@empresa-b.test", name: "Bruno Costa" },
  { key: "multi", email: "duarte@consultor.test", name: "Duarte Lopes" },
] as const;

const TENANTS = [
  {
    slug: "empresa-a",
    name: "Empresa A Demo",
    legal: "Empresa A Demonstração, Lda.",
    taxSeed: 1001,
  },
  {
    slug: "empresa-b",
    name: "Empresa B Demo",
    legal: "Empresa B Demonstração, S.A.",
    taxSeed: 2002,
  },
] as const;

function check<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as NonNullable<T>;
}

async function findUserId(email: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

async function reset() {
  for (const t of TENANTS) {
    const { data: org } = await db
      .from("organizations")
      .select("id")
      .eq("slug", t.slug)
      .maybeSingle();
    if (!org) continue;
    const { data: docs } = await db
      .from("documents")
      .select("storage_path")
      .eq("organization_id", org.id);
    if (docs?.length) await db.storage.from("documents").remove(docs.map((d) => d.storage_path));
    // Owners are protected by a trigger while the organization exists; deleting the org cascades.
    check(await db.from("organizations").delete().eq("id", org.id), `delete ${t.slug}`);
  }
  for (const u of USERS) {
    const id = await findUserId(u.email);
    if (id) await db.auth.admin.deleteUser(id);
  }
  console.log("demo data removed");
}

async function ensureUser(email: string, name: string): Promise<string> {
  const existing = await findUserId(email);
  if (existing) return existing;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, preferred_language: "pt-PT" },
  });
  if (error || !data.user) throw new Error(`create user ${email}: ${error?.message}`);
  return data.user.id;
}

async function main() {
  if (process.argv.includes("--reset")) await reset();

  const ids: Record<string, string> = {};
  for (const u of USERS) ids[u.key] = await ensureUser(u.email, u.name);
  await db.from("platform_admins").upsert({ user_id: ids.platform! });

  const { data: plan } = await db.from("plans").select("id").eq("code", "standard").single();

  for (const [index, t] of TENANTS.entries()) {
    const { data: existing } = await db
      .from("organizations")
      .select("id")
      .eq("slug", t.slug)
      .maybeSingle();
    if (existing) {
      console.log(`tenant ${t.slug} already exists — skipping (use --reset to recreate)`);
      continue;
    }
    const org = check(
      await db
        .from("organizations")
        .insert({
          name: t.name,
          legal_name: t.legal,
          slug: t.slug,
          tax_id: syntheticNif(t.taxSeed),
          plan_id: plan?.id ?? null,
          created_by: ids.platform!,
        })
        .select("id")
        .single(),
      `create ${t.slug}`,
    );
    await db.from("organization_settings").insert({ organization_id: org.id });

    const owner = index === 0 ? ids.ownerA! : ids.ownerB!;
    const members = [
      { user_id: owner, role: "owner" as const },
      { user_id: ids.multi!, role: "member" as const },
      ...(index === 0 ? [{ user_id: ids.viewerA!, role: "viewer" as const }] : []),
    ];
    check(
      await db.from("organization_members").insert(
        members.map((m) => ({
          ...m,
          organization_id: org.id,
          joined_at: new Date().toISOString(),
        })),
      ),
      "members",
    );

    const categories = check(
      await db
        .from("categories")
        .insert(
          ["Eletricidade", "Telecomunicações", "Material de escritório", "Serviços"].map(
            (name) => ({ organization_id: org.id, name }),
          ),
        )
        .select("id, name"),
      "categories",
    );
    const cat = (name: string) => categories.find((c) => c.name === name)?.id ?? null;

    const supplierDefs = [
      {
        name: `Energia Exemplo ${index ? "Norte" : "Sul"}, S.A.`,
        tax: syntheticNif(3000 + index),
        category: "Eletricidade",
      },
      {
        name: `Telecom Fictícia ${index ? "B" : "A"}, Lda.`,
        tax: syntheticNif(4000 + index),
        category: "Telecomunicações",
      },
      {
        name: "Papelaria Imaginária, Lda.",
        tax: syntheticNif(5000 + index),
        category: "Material de escritório",
      },
    ];
    const suppliers = check(
      await db
        .from("suppliers")
        .insert(
          supplierDefs.map((s) => ({
            organization_id: org.id,
            name: s.name,
            tax_id: s.tax,
            tax_country: "PT",
            default_category_id: cat(s.category),
            created_by: owner,
          })),
        )
        .select("id, name, tax_id, default_category_id"),
      "suppliers",
    );

    const docCount = index === 0 ? 6 : 3;
    for (let i = 0; i < docCount; i++) {
      const supplier = suppliers[i % suppliers.length]!;
      const month = String(((i * 2) % 9) + 1).padStart(2, "0");
      const invoice: SyntheticInvoice = {
        supplierName: supplier.name,
        supplierTaxId: supplier.tax_id!,
        customerName: t.legal,
        customerTaxId: syntheticNif(t.taxSeed),
        number: `FT ${2026}${index ? "B" : "A"}/${100 + i}`,
        issueDate: `2026-${month}-10`,
        dueDate: `2026-${month}-${i % 2 ? "25" : "28"}`,
        lines: [
          {
            description: "Serviço mensal (sintético)",
            quantity: "1",
            unitPrice: String(40 + i * 17.5),
            taxRate: "23",
          },
          {
            description: "Taxa adicional (sintética)",
            quantity: "2",
            unitPrice: "3.25",
            taxRate: "23",
          },
        ],
      };
      const totals = invoiceTotals(invoice);
      const bytes = await createSyntheticInvoicePdf(invoice);
      const id = randomUUID();
      const path = `organizations/${org.id}/documents/${id}/original.pdf`;
      check(
        await db.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" }),
        "upload",
      );
      const validated = i < docCount - 1;
      check(
        await db.from("documents").insert({
          id,
          organization_id: org.id,
          document_type: "invoice",
          status: validated ? "validated" : "review_required",
          processing_status: "success",
          review_status: validated ? "validated" : "needs_review",
          original_filename: `fatura-${invoice.number.replace(/\W+/g, "-").toLowerCase()}.pdf`,
          storage_path: path,
          mime_type: "application/pdf",
          file_size: bytes.byteLength,
          file_sha256: createHash("sha256").update(bytes).digest("hex"),
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          supplier_tax_id: supplier.tax_id,
          document_number: invoice.number,
          issue_date: invoice.issueDate,
          due_date: invoice.dueDate,
          currency: "EUR",
          subtotal: totals.subtotal as unknown as number,
          tax_total: totals.tax as unknown as number,
          total: totals.total as unknown as number,
          category_id: supplier.default_category_id,
          uploaded_by: owner,
          updated_by: owner,
          validated_by: validated ? owner : null,
          validated_at: validated ? new Date().toISOString() : null,
        }),
        "document",
      );
    }
    await db.rpc("refresh_alerts", { p_org: org.id });
    console.log(`tenant ${t.slug}: ${suppliers.length} suppliers, ${docCount} documents`);
  }

  console.log("\nDemo accounts (password: %s)", DEMO_PASSWORD);
  for (const u of USERS) console.log(`  ${u.email.padEnd(26)} ${u.name}`);
  console.log("\nSYNTHETIC DATA ONLY — never seed real customer documents.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
