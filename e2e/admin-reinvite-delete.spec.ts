import { expect, test } from "@playwright/test";
import { login, withDb } from "./helpers";

test("platform admin re-invites a pending administrator and deletes the company", async ({
  page,
  browser,
}) => {
  const email = "admin@empresa-apagar.example";
  await withDb(async (db) => {
    await db.query("delete from organizations where slug = 'empresa-apagar'");
  });

  await login(page, "admin@docuflow.test");
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/organizations/new");
  await page.getByLabel("Nome da empresa").fill("Empresa Apagar");
  await page.getByLabel("Email do administrador inicial").fill(email);
  await page.getByRole("button", { name: "Criar empresa e enviar convite" }).click();
  await expect(page.getByText(`Empresa criada. Convite enviado para ${email}.`)).toBeVisible();
  const firstLink = await page.locator("input[readonly]").first().inputValue();

  const id = await withDb(async (db) => {
    const { rows } = await db.query("select id from organizations where slug = 'empresa-apagar'");
    return rows[0].id as string;
  });
  await page.goto(`/admin/organizations/${id}`);

  // Inviting the same email again while the first invitation is pending works.
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Convidar administrador" }).click();
  await expect(page.getByText(`Convite enviado para ${email}`).first()).toBeVisible();
  const secondLink = await page.locator("input[readonly][aria-label=URL]").first().inputValue();
  expect(secondLink).toMatch(/\/invite\//);
  expect(secondLink).not.toBe(firstLink);
  await expect(page.getByRole("cell", { name: "Revogado" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Pendente" })).toHaveCount(1);

  const context = await browser.newContext();
  const invited = await context.newPage();
  await invited.goto(firstLink);
  await expect(
    invited.getByText("Este convite é inválido, expirou ou já foi utilizado."),
  ).toBeVisible();
  await invited.goto(secondLink);
  await expect(invited.getByText(/convidado para se juntar a Empresa Apagar/)).toBeVisible();
  await context.close();

  // "Reenviar" shows a new link that stays visible after the list refreshes.
  await page.getByRole("button", { name: "Reenviar" }).click();
  await expect(page.getByRole("cell", { name: "Pendente" })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "Revogado" })).toHaveCount(2);
  await page.waitForTimeout(2_000);
  const resentLink = page.locator("td input[readonly][aria-label=URL]");
  await expect(resentLink).toBeVisible();
  expect(await resentLink.inputValue()).not.toBe(secondLink);

  // Deletion requires typing the identifier.
  const button = page.getByTestId("delete-organization");
  await expect(button).toBeDisabled();
  await page.getByLabel(/escreva o identificador da empresa/).fill("empresa-apagar");
  await button.click();
  await expect(page).toHaveURL(/\/admin\/organizations$/);
  const remaining = await withDb(async (db) => {
    const orgs = await db.query("select 1 from organizations where id = $1", [id]);
    const invitations = await db.query("select 1 from invitations where organization_id = $1", [
      id,
    ]);
    const audit = await db.query(
      "select 1 from audit_logs where action = 'organization.deleted' and entity_id = $1",
      [id],
    );
    return { orgs: orgs.rowCount, invitations: invitations.rowCount, audit: audit.rowCount };
  });
  expect(remaining).toEqual({ orgs: 0, invitations: 0, audit: 1 });
});
