import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const PASSWORD = process.env.SEED_PASSWORD ?? "Demo-Password-2026";

export async function login(page: Page, email: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Palavra-passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function expectOnTenant(page: Page, slug: string) {
  await expect(page).toHaveURL(new RegExp(`/t/${slug}(/|$)`));
}

/** Direct database access for assertions (test-only; uses the stack superuser URL). */
export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for e2e database assertions");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
