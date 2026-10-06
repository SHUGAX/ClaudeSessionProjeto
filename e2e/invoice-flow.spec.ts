import { expect, test } from "@playwright/test";
import { createSyntheticInvoicePdf } from "../scripts/lib/synthetic-invoice";
import { expectOnTenant, login, withDb } from "./helpers";

test("upload → AI extraction → review → correct → validate → listed, audited", async ({ page }) => {
  const number = `FT E2E/${Date.now().toString().slice(-6)}`;
  const pdf = await createSyntheticInvoicePdf({
    supplierName: "Fornecedor Novo E2E, Lda.",
    supplierTaxId: "509999992",
    customerName: "Empresa A Demonstração, Lda.",
    customerTaxId: "123456789",
    number,
    issueDate: "2026-09-15",
    dueDate: "2026-10-15",
    lines: [{ description: "Consultoria (sintética)", quantity: "2", unitPrice: "150.00", taxRate: "23" }],
  });

  await login(page, "ana@empresa-a.test");
  await expectOnTenant(page, "empresa-a");
  await page.goto("/t/empresa-a/upload");
  await page.getByTestId("file-input").setInputFiles({ name: "fatura-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });

  const item = page.getByTestId("upload-item").first();
  await expect(item.getByText("Pronto para revisão")).toBeVisible({ timeout: 60_000 });
  await item.getByRole("link", { name: "Rever" }).click();

  // Review screen: original + extracted fields.
  await expect(page.getByRole("heading", { name: number })).toBeVisible();
  await expect(page.getByLabel("Nome do fornecedor")).toHaveValue("Fornecedor Novo E2E, Lda.");
  await expect(page.getByLabel("NIF do fornecedor")).toHaveValue("509999992");
  await expect(page.getByLabel("Total", { exact: true })).toHaveValue("369,00");
  await expect(page.getByLabel("Data do documento")).toHaveValue("2026-09-15");
  await expect(page.locator("canvas")).toBeVisible();

  // Human correction of one field, then validation.
  await page.getByLabel("Referência de pagamento").fill("REF-E2E-123");
  await page.getByTestId("validate-button").click();
  await expect(page.getByText("Validado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Validado por Ana Martins/)).toBeVisible();

  // Listed in documents.
  await page.goto(`/t/empresa-a/documents?q=${encodeURIComponent(number)}`);
  await expect(page.getByRole("link", { name: number })).toBeVisible();

  // Supplier created on validation.
  await page.goto("/t/empresa-a/suppliers");
  await expect(page.getByRole("link", { name: "Fornecedor Novo E2E, Lda." })).toBeVisible();

  // Audit trail: upload, AI extraction, manual correction, validation.
  const actions = await withDb(async (db) => {
    const { rows } = await db.query(
      `select a.action from audit_logs a join documents d on d.id = a.entity_id
       where d.document_number = $1 order by a.created_at`,
      [number],
    );
    return rows.map((r) => r.action as string);
  });
  expect(actions).toEqual(
    expect.arrayContaining(["document.uploaded", "document.processing_started", "document.extracted", "document.updated", "document.validated"]),
  );

  // Original is stored privately: no public access to the storage object.
  const storagePath = await withDb(async (db) => {
    const { rows } = await db.query("select storage_path from documents where document_number = $1", [number]);
    return rows[0].storage_path as string;
  });
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
  const publicRes = await page.request.get(publicUrl);
  expect(publicRes.ok()).toBe(false);
});

test("AI failure keeps the original and allows a retry", async ({ page }) => {
  const pdf = await createSyntheticInvoicePdf(
    {
      supplierName: "Falha Simulada, Lda.",
      supplierTaxId: "509999992",
      customerName: "Empresa A",
      customerTaxId: "123456789",
      number: `FT FAIL/${Date.now().toString().slice(-5)}`,
      issueDate: "2026-09-01",
      dueDate: "2026-09-30",
      lines: [{ description: "Item", quantity: "1", unitPrice: "10", taxRate: "23" }],
    },
    { marker: "MOCK_AI_FAIL" },
  );
  await login(page, "ana@empresa-a.test");
  await expectOnTenant(page, "empresa-a");
  await page.goto("/t/empresa-a/upload");
  await page.getByTestId("file-input").setInputFiles({ name: "falha.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  const item = page.getByTestId("upload-item").first();
  await expect(item.getByText(/extração falhou/)).toBeVisible({ timeout: 60_000 });
  await item.getByRole("link", { name: "Rever" }).click();
  await expect(page.getByText("A extração automática falhou")).toBeVisible();
  await expect(page.getByRole("button", { name: "Repetir extração IA" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("rejects files whose content is not an allowed type", async ({ page }) => {
  await login(page, "ana@empresa-a.test");
  await expectOnTenant(page, "empresa-a");
  await page.goto("/t/empresa-a/upload");
  await page
    .getByTestId("file-input")
    .setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  await expect(page.getByTestId("upload-item").first().getByText("Tipo de ficheiro não suportado.")).toBeVisible({ timeout: 30_000 });
});
