import { PDFDocument, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { findQrCodes } from "@/lib/documents/qr-reader";

const PAYLOAD =
  "A:123456789*B:999999990*C:PT*D:FT*E:N*F:20260115*G:FT A/123*H:CSDF7T5H-123*I1:PT*I7:100.00*I8:23.00*N:23.00*O:123.00*Q:aBcD*R:9999";

async function pdfWithQr(pages = 1) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const png = await pdf.embedPng(await QRCode.toBuffer(PAYLOAD, { margin: 2, width: 300 }));
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Fatura sintética — página ${i + 1}`, { x: 40, y: 800, size: 12, font });
    if (i === pages - 1) page.drawImage(png, { x: 40, y: 40, width: 90, height: 90 });
  }
  return pdf.save();
}

describe("findQrCodes", () => {
  it("reads the AT QR code from the last page of a PDF", async () => {
    expect(await findQrCodes(await pdfWithQr(2), "application/pdf")).toEqual([PAYLOAD]);
  }, 30_000);

  it("reads the QR code from PNG and JPEG images", async () => {
    const png = await QRCode.toBuffer(PAYLOAD, { margin: 4, width: 600 });
    expect(await findQrCodes(new Uint8Array(png), "image/png")).toEqual([PAYLOAD]);
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(png);
    const canvas = createCanvas(1400, 1000);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4f1ea";
    ctx.fillRect(0, 0, 1400, 1000);
    ctx.drawImage(img, 700, 400, 400, 400);
    const jpeg = canvas.toBuffer("image/jpeg", 85);
    expect(await findQrCodes(new Uint8Array(jpeg), "image/jpeg")).toEqual([PAYLOAD]);
  }, 30_000);

  it("returns nothing for documents without QR codes", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    expect(await findQrCodes(await pdf.save(), "application/pdf")).toEqual([]);
    expect(await findQrCodes(new TextEncoder().encode("garbage"), "image/png")).toEqual([]);
  }, 30_000);
});
