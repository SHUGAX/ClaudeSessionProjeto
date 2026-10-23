import "server-only";
import jsQR from "jsqr";
import { logger } from "@/lib/observability/logger";
import { looksLikeAtQr } from "./at-qrcode";

/**
 * Finds QR codes in an uploaded original (PDF pages or photos) on the server.
 * Pages/images are rasterised with @napi-rs/canvas (prebuilt, no system
 * dependencies) and decoded with jsQR. Returns the decoded payloads, AT invoice
 * codes first. Never throws: QR reading is best-effort.
 */
const MAX_IMAGE_SIDE = 2000;
const PDF_SCALES = [2.5, 4];
const BUDGET_MS = 20_000;

type Raster = { data: Uint8ClampedArray; width: number; height: number };

function decode(raster: Raster): string | null {
  const result = jsQR(raster.data, raster.width, raster.height, {
    inversionAttempts: "dontInvert",
  });
  return result?.data?.trim() || null;
}

async function rasteriseImage(bytes: Uint8Array, maxSide: number): Promise<Raster | null> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(Buffer.from(bytes));
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width,
    height,
  };
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const g = globalThis as { pdfjsWorker?: unknown };
  // Runs the pdf.js worker on the main thread (explicit import keeps it in the bundle trace).
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return pdfjs;
}

async function scanPdf(bytes: Uint8Array, deadline: number): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const { createCanvas } = await import("@napi-rs/canvas");
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const found: string[] = [];
  try {
    const pdf = await task.promise;
    // The QR code is normally on the last page (or the first for one-page documents).
    const pages = [...new Set([pdf.numPages, 1])].filter((n) => n >= 1).slice(0, 2);
    for (const scale of PDF_SCALES) {
      for (const pageNumber of pages) {
        if (Date.now() > deadline) return found;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const payload = decode({
          data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
          width: canvas.width,
          height: canvas.height,
        });
        page.cleanup();
        if (payload) {
          found.push(payload);
          if (looksLikeAtQr(payload)) return found;
        }
      }
    }
    return found;
  } finally {
    await task.destroy();
  }
}

export async function findQrCodes(bytes: Uint8Array, mimeType: string | null): Promise<string[]> {
  const started = Date.now();
  const deadline = started + BUDGET_MS;
  try {
    let found: string[] = [];
    if (mimeType === "application/pdf") {
      found = await scanPdf(bytes, deadline);
    } else if (mimeType === "image/jpeg" || mimeType === "image/png") {
      for (const side of [MAX_IMAGE_SIDE, 1200]) {
        const raster = await rasteriseImage(bytes, side);
        const payload = raster ? decode(raster) : null;
        if (payload) {
          found = [payload];
          break;
        }
        if (Date.now() > deadline) break;
      }
    }
    const sorted = [...new Set(found)].sort(
      (a, b) => Number(looksLikeAtQr(b)) - Number(looksLikeAtQr(a)),
    );
    logger.info("qr_scan_done", {
      found: sorted.length,
      at: sorted.some(looksLikeAtQr),
      ms: Date.now() - started,
    });
    return sorted;
  } catch (error) {
    logger.warn("qr_scan_failed", { error, ms: Date.now() - started });
    return [];
  }
}
