import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignableRoles, can, canManageMember } from "@/lib/auth/permissions";
import { buildStoragePath, detectMimeType, mimeFromExtension, sanitizeFilename } from "@/lib/documents/file-types";
import { safeRedirectTarget } from "@/lib/security/redirect";
import { resolveHost } from "@/lib/tenancy/host";
import { isValidSlug, slugify, slugSchema } from "@/lib/tenancy/slug";

describe("resolveHost", () => {
  const root = "example.com";
  it.each([
    ["example.com", { kind: "central" }],
    ["app.example.com", { kind: "central" }],
    ["www.example.com", { kind: "central" }],
    ["admin.example.com", { kind: "admin" }],
    ["api.example.com", { kind: "central" }],
    ["empresa-a.example.com", { kind: "tenant", slug: "empresa-a" }],
    ["EMPRESA-A.Example.com:443", { kind: "tenant", slug: "empresa-a" }],
    ["a.b.example.com", { kind: "invalid" }],
    ["-bad.example.com", { kind: "invalid" }],
    ["my-app.vercel.app", { kind: "central" }],
    ["example.com.evil.net", { kind: "central" }],
  ])("%s → %o", (host, expected) => {
    expect(resolveHost(host, root)).toEqual(expected);
  });

  it("supports a root domain with port (local development)", () => {
    expect(resolveHost("empresa-a.localhost:3000", "localhost:3000")).toEqual({ kind: "tenant", slug: "empresa-a" });
  });
});

describe("slugs", () => {
  it("validates DNS-safe, non-reserved slugs", () => {
    expect(isValidSlug("empresa-teste")).toBe(true);
    expect(isValidSlug("admin")).toBe(false);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("Abc")).toBe(false);
    expect(slugSchema.safeParse("www").success).toBe(false);
  });
  it("slugifies Portuguese names", () => {
    expect(slugify("Pizzaria São João, Lda.")).toBe("pizzaria-sao-joao-lda");
  });
});

describe("safeRedirectTarget (open redirect protection)", () => {
  const root = "example.com";
  it.each([
    ["/documents?x=1", "/documents?x=1"],
    ["https://empresa-a.example.com/x", "https://empresa-a.example.com/x"],
    ["https://example.com/", "https://example.com/"],
  ])("allows %s", (input, expected) => {
    expect(safeRedirectTarget(input, root)).toBe(expected);
  });
  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "https://example.com.evil.com/",
    "javascript:alert(1)",
    "https://user:pass@example.com/",
    "ftp://example.com",
    null,
    "",
  ])("rejects %s", (input) => {
    expect(safeRedirectTarget(input, root)).toBeNull();
  });
});

describe("file validation", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it("detects real file types from magic bytes", () => {
    expect(detectMimeType(new TextEncoder().encode("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectMimeType(bytes(0x49, 0x49, 0x2a, 0x00))).toBe("image/tiff");
  });
  it("rejects disguised files", () => {
    expect(detectMimeType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectMimeType(new TextEncoder().encode("MZ\x90\x00 executable"))).toBeNull();
  });
  it("maps extensions conservatively", () => {
    expect(mimeFromExtension("Fatura.PDF")).toBe("application/pdf");
    expect(mimeFromExtension("scan.jpeg")).toBe("image/jpeg");
    expect(mimeFromExtension("evil.pdf.exe")).toBeNull();
    expect(mimeFromExtension("noext")).toBeNull();
  });
  it("sanitises display file names and never uses them in storage keys", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\fat<ura>.pdf")).toBe("fatura.pdf");
    expect(sanitizeFilename("   ")).toBe("documento");
    const org = "11111111-1111-4111-8111-111111111111";
    const doc = "22222222-2222-4222-8222-222222222222";
    expect(buildStoragePath(org, doc, "application/pdf")).toBe(`organizations/${org}/documents/${doc}/original.pdf`);
    expect(() => buildStoragePath("../x", doc, "application/pdf")).toThrow();
  });
});

describe("permissions", () => {
  it("maps roles to capabilities", () => {
    expect(can.uploadDocuments("viewer")).toBe(false);
    expect(can.uploadDocuments("member")).toBe(true);
    expect(can.validateDocuments("member")).toBe(true);
    expect(can.manageSuppliers("member")).toBe(false);
    expect(can.manageSuppliers("manager")).toBe(true);
    expect(can.manageUsers("manager")).toBe(false);
    expect(can.manageUsers("admin")).toBe(true);
  });
  it("admins cannot grant or manage owners", () => {
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("member")).toEqual([]);
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("owner", "owner")).toBe(true);
  });
});

describe("tenant URLs", () => {
  const original = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "example.com";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("builds subdomain URLs", async () => {
    process.env.NEXT_PUBLIC_TENANT_ROUTING = "subdomain";
    const { tenantPath, tenantUrl } = await import("@/lib/tenancy/urls");
    expect(tenantPath("empresa-a", "/documents")).toBe("/documents");
    expect(tenantUrl("empresa-a", "/documents", "https://app.example.com")).toBe("https://empresa-a.example.com/documents");
  });

  it("builds path URLs", async () => {
    process.env.NEXT_PUBLIC_TENANT_ROUTING = "path";
    const { tenantPath, tenantUrl } = await import("@/lib/tenancy/urls");
    expect(tenantPath("empresa-a", "/")).toBe("/t/empresa-a");
    expect(tenantUrl("empresa-a", "/documents", "http://localhost:3000")).toBe("http://localhost:3000/t/empresa-a/documents");
  });
});
