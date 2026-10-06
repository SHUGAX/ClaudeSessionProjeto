import { expect, test } from "@playwright/test";
import { expectOnTenant, login } from "./helpers";

test("assistant answers from validated data of the user's own tenant only", async ({ page }) => {
  await login(page, "ana@empresa-a.test");
  await expectOnTenant(page, "empresa-a");
  await page.goto("/t/empresa-a/assistant");

  await page.getByLabel(/Ex\.:/).fill("Quanto gastámos com a Telecom Fictícia A este ano?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  const answer = page.getByTestId("assistant-answer").last();
  await expect(answer).toContainText("Total validado com Telecom Fictícia A, Lda. este ano");
  await expect(answer).toContainText("Resposta calculada diretamente");

  // A supplier of the other tenant is unknown here.
  await page.getByLabel(/Ex\.:/).fill("Quanto gastámos com a Telecom Fictícia B este ano?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  await expect(page.getByTestId("assistant-answer").last()).toContainText(
    "Não encontrei o fornecedor",
  );
});
