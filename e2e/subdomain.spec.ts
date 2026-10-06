import { expect, test } from "@playwright/test";
import { PASSWORD } from "./helpers";

/**
 * Production topology (wildcard subdomains). Opt-in: start the app with
 *   NEXT_PUBLIC_TENANT_ROUTING=subdomain NEXT_PUBLIC_ROOT_DOMAIN=example.test:3000
 *   APP_URL=http://app.example.test:3000 AUTH_COOKIE_DOMAIN=.example.test
 * and run with E2E_SUBDOMAIN_ROOT=example.test:3000 E2E_BASE_URL=http://app.example.test:3000
 */
const root = process.env.E2E_SUBDOMAIN_ROOT;
const host = root?.split(":")[0];

test.describe("subdomain routing", () => {
  test.skip(!root, "set E2E_SUBDOMAIN_ROOT to run");
  test.use({ launchOptions: { args: [`--host-resolver-rules=MAP *.${host} 127.0.0.1`] } });

  test("central login redirects to the tenant subdomain; other subdomains stay closed", async ({ page }) => {
    await page.goto(`http://app.${root}/login`);
    await page.getByLabel("Email").fill("ana@empresa-a.test");
    await page.getByLabel("Palavra-passe").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(`http://empresa-a.${root}/`);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await page.getByRole("link", { name: "Documentos" }).first().click();
    await expect(page).toHaveURL(`http://empresa-a.${root}/documents`);

    await page.goto(`http://empresa-b.${root}/documents`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();

    await page.goto(`http://app.${root}/t/empresa-a/suppliers`);
    await expect(page).toHaveURL(`http://empresa-a.${root}/suppliers`);
  });
});
