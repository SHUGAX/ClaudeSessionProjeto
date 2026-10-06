import { expect, test } from "@playwright/test";
import { login, withDb } from "./helpers";

test("platform admin onboards a company; invited admin activates account and lands on the tenant", async ({
  page,
  browser,
}) => {
  await withDb(async (db) => {
    await db.query("delete from organizations where slug = 'empresa-teste'");
    await db.query("delete from auth.users where email = 'admin@empresa-teste.example'");
  });

  await login(page, "admin@docuflow.test");
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/organizations/new");
  await page.getByLabel("Nome da empresa").fill("Empresa Teste");
  await expect(page.getByLabel("Identificador (subdomínio)")).toHaveValue("empresa-teste");
  await page.getByLabel("Email do administrador inicial").fill("admin@empresa-teste.example");
  await page.getByRole("button", { name: "Criar empresa e enviar convite" }).click();
  await expect(
    page.getByText("Empresa criada. Convite enviado para admin@empresa-teste.example."),
  ).toBeVisible();
  const link = await page.locator("input[readonly]").first().inputValue();
  expect(link).toMatch(/\/invite\//);

  // The invited administrator chooses their own password (never emailed).
  const context = await browser.newContext();
  const invited = await context.newPage();
  await invited.goto(link);
  await expect(invited.getByText(/convidado para se juntar a Empresa Teste/)).toBeVisible();
  await invited.getByLabel("Nome completo").fill("Admin Teste");
  await invited.getByLabel("Nova palavra-passe").fill("Uma-Palavra-Segura-1");
  await invited.getByLabel("Confirmar palavra-passe").fill("Uma-Palavra-Segura-1");
  await invited.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(invited).toHaveURL(/\/t\/empresa-teste/);
  await expect(invited.getByRole("heading", { name: "Painel" })).toBeVisible();
  await expect(invited.getByText("Ainda não há documentos")).toBeVisible();

  // The invitation is single-use.
  await invited.goto(link);
  await expect(
    invited.getByText("Este convite é inválido, expirou ou já foi utilizado."),
  ).toBeVisible();
  await context.close();
});
