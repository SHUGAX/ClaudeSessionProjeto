/**
 * Upload policy. The browser-provided MIME type and file name are NEVER trusted:
 * the real type is detected from the file's magic bytes on the server.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // keep in sync with the storage bucket limit

export type AllowedMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/tiff";

export const ALLOWED_TYPES: Record<AllowedMimeType, { extensions: string[]; storageExt: string }> = {
  "application/pdf": { extensions: ["pdf"], storageExt: "pdf" },
  "image/jpeg": { extensions: ["jpg", "jpeg"], storageExt: "jpg" },
  "image/png": { extensions: ["png"], storageExt: "png" },
  "image/tiff": { extensions: ["tif", "tiff"], storageExt: "tiff" },
};

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/jpeg,image/png,image/tiff";

export function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

/** MIME type implied by the file extension (pre-check only; not trusted). */
export function mimeFromExtension(filename: string): AllowedMimeType | null {
  const ext = extensionOf(filename);
  for (const [mime, info] of Object.entries(ALLOWED_TYPES) as Array<[AllowedMimeType, (typeof ALLOWED_TYPES)[AllowedMimeType]]>) {
    if (info.extensions.includes(ext)) return mime;
  }
  return null;
}

/** Detects the real file type from its first bytes. */
export function detectMimeType(bytes: Uint8Array): AllowedMimeType | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  // PDF: "%PDF-" header, which the PDF specification allows within the first 1024 bytes.
  const pdfLimit = Math.min(1024, bytes.length - 5);
  for (let offset = 0; offset <= pdfLimit; offset++) {
    if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d], offset)) return "application/pdf";
  }
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x49, 0x49, 0x2a, 0x00]) || startsWith([0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  return null;
}

/**
 * Display-safe file name: strips paths, control characters and reserved
 * characters, limits length. The storage key never uses the user's name.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const limited = cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned;
  return limited || "documento";
}

/** Deterministic, traversal-proof storage key. */
export function buildStoragePath(organizationId: string, documentId: string, mime: AllowedMimeType): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(organizationId) || !uuid.test(documentId)) throw new Error("Invalid identifiers for storage path");
  return `organizations/${organizationId}/documents/${documentId}/original.${ALLOWED_TYPES[mime].storageExt}`;
}
