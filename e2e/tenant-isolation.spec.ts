import { expect, test } from "@playwright/test";
import { expectOnTenant, login, withDb } from "./helpers";

test.describe("authentication and tenant isolation", () => {
  test("unauthenticated tenant access redirects to the tenant-branded login", async ({ page }) => {
    await page.goto("/t/empresa-a/documents");
    await expect(page).toHaveURL(/\/t\/empresa-a\/login/);
    await expect(page.getByText("Empresa A Demo", { exact: true })).toBeVisible();
  });

  test("unknown tenant slug returns a safe 404", async ({ page }) => {
    const response = await page.goto("/t/nao-existe/documents");
    expect(response?.status()).toBe(404);
  });

  test("single-tenant user is redirected to their tenant after central login", async ({ page }) => {
    await login(page, "ana@empresa-a.test");
    await expectOnTenant(page, "empresa-a");
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  });

  test("multi-tenant user sees the organization selector", async ({ page }) => {
    await login(page, "duarte@consultor.test");
    await expect(page).toHaveURL(/\/select-organization/);
    await expect(page.getByText("Empresa A Demo")).toBeVisible();
    await expect(page.getByText("Empresa B Demo")).toBeVisible();
  });

  test("changing the tenant in the URL does not grant access", async ({ page }) => {
    await login(page, "ana@empresa-a.test");
    await expectOnTenant(page, "empresa-a");
    await page.goto("/t/empresa-b/documents");
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await expect(page.getByText("FT 2026B/100")).toHaveCount(0);
  });

  test("another tenant's document id is not accessible (page, API, signed URL)", async ({ page, request }) => {
    const foreignId = await withDb(async (db) => {
      const { rows } = await db.query(
        "select d.id from documents d join organizations o on o.id = d.organization_id where o.slug = 'empresa-b' limit 1",
      );
      return rows[0].id as string;
    });
    await login(page, "ana@empresa-a.test");
    await expectOnTenant(page, "empresa-a");

    // Through her own tenant path: not found.
    const res = await page.goto(`/t/empresa-a/documents/${foreignId}`);
    expect(res?.status()).toBe(404);

    // Through the API with her session: the signed URL is never issued.
    const api = await page.request.get(`/api/documents/${foreignId}/file`);
    expect(api.status()).toBe(404);
    const body = await api.json();
    expect(body.url).toBeUndefined();

    // Mutations from her session are refused as well.
    const processRes = await page.request.post(`/api/documents/${foreignId}/process`, {
      headers: { origin: "http://localhost:3000" },
    });
    expect(processRes.status()).toBe(404);

    // Anonymous request.
    const anon = await request.get(`/api/documents/${foreignId}/file`);
    expect(anon.status()).toBeGreaterThanOrEqual(400);
  });

  test("viewer role cannot upload", async ({ page }) => {
    await login(page, "carla@empresa-a.test");
    await expectOnTenant(page, "empresa-a");
    await page.goto("/t/empresa-a/upload");
    await expect(page.getByText("Não tem permissão para carregar documentos.")).toBeVisible();
  });
});
