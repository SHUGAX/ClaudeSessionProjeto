import { expect, test } from "@playwright/test";
import QRCode from "qrcode";
import {
  createSyntheticInvoicePdf,
  syntheticAtQrPayload,
  type SyntheticInvoice,
} from "../scripts/lib/synthetic-invoice";
import { expectOnTenant, login } from "./helpers";

test("AT QR code: read on upload (even if AI fails), found by scan, chat answers", async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-6);
  const invoice: SyntheticInvoice = {
    supplierName: "Fornecedor QR E2E, Lda.",
    supplierTaxId: "509999992",
    customerName: "Empresa A Demonstração, Lda.",
    customerTaxId: "123456789",
    number: `FT QR/${suffix}`,
    issueDate: "2026-09-20",
    dueDate: "2026-10-20",
    lines: [
      { description: "Serviço (sintético)", quantity: "1", unitPrice: "300.00", taxRate: "23" },
    ],
  };
  const atcud = `QRE2E${suffix}-1`;
  // The AI provider fails on purpose: fiscal data must come from the QR code.
  const pdf = await createSyntheticInvoicePdf(invoice, {
    marker: "MOCK_AI_FAIL",
    atQr: { atcud },
  });

  await login(page, "ana@empresa-a.test");
  await expectOnTenant(page, "empresa-a");
  await page.goto("/t/empresa-a/upload");
  await page.getByTestId("file-input").setInputFiles({
    name: "fatura-qr.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf),
  });
  const item = page.getByTestId("upload-item").first();
  await expect(item.getByText("Pronto para revisão")).toBeVisible({ timeout: 60_000 });
  await item.getByRole("link", { name: "Rever" }).click();
  await expect(page.getByRole("heading", { name: invoice.number })).toBeVisible();
  await expect(page.getByText(`ATCUD ${atcud}`)).toBeVisible();
  await expect(page.getByLabel("Total", { exact: true })).toHaveValue("369,00");

  // Scan a photo of the paper QR code from the "Ler QR" page.
  await page.getByRole("link", { name: "Ler QR" }).first().click();
  const png = await QRCode.toBuffer(syntheticAtQrPayload(invoice, atcud), { width: 400 });
  await page.getByTestId("qr-photo-input").setInputFiles({
    name: "qr.png",
    mimeType: "image/png",
    buffer: png,
  });
  const result = page.getByTestId("scan-result");
  await expect(result.getByText("Documento encontrado")).toBeVisible({ timeout: 20_000 });
  await expect(result.getByText(invoice.number)).toBeVisible();

  // Multi-turn conversation about the scanned document.
  await result.getByRole("button", { name: "Quanto é o IVA?" }).click();
  await expect(page.getByTestId("doc-chat-answer").first()).toContainText("69,00");
  await page.getByLabel(/Ex\.: Quando vence/).fill("Já está paga?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByTestId("doc-chat-answer")).toHaveCount(2);
  await expect(page.getByTestId("doc-chat-answer").last()).toContainText("Ainda não");
});
