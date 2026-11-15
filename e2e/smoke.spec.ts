import { expect, test } from "@playwright/test";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7pQAAAAASUVORK5CYII=",
  "base64",
);

test("a new account can create a tree, add relatives, and upload a portrait", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `e2e-${suffix}@roots.local`;
  const password = "roots-e2e-12345";

  await page.goto("/register");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/trees");

  await page.getByRole("button", { name: "New tree" }).click();
  await page.getByLabel("Tree name").fill(`E2E Family ${suffix}`);
  await page.getByRole("button", { name: "Create tree" }).click();
  await page.waitForURL(/\/trees\/[0-9a-f-]{36}$/);
  await expect(page.getByText("An empty branch")).toBeVisible();

  await page.getByRole("button", { name: "Add the first person" }).click();
  const addPersonDialog = page.getByRole("dialog", { name: "Add a person" });
  await addPersonDialog.getByLabel("First name").fill("Ada");
  await addPersonDialog.getByLabel("Last name").fill("Lovelace");
  await addPersonDialog.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();

  await page.getByRole("button", { name: "Add relative" }).first().click();
  await page.getByRole("button", { name: /Child/ }).click();
  await page.getByRole("button", { name: "New person" }).click();
  const relativeDialog = page.getByRole("dialog", { name: /Connect someone to Ada/ });
  await relativeDialog.getByLabel("First name").fill("Byron");
  await relativeDialog.getByLabel("Last name").fill("Lovelace");
  await relativeDialog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Byron Lovelace" })).toBeVisible();

  await page.getByRole("button", { name: /Search people and files/ }).click();
  const searchDialog = page.getByRole("dialog", { name: "Search the tree" });
  await searchDialog.getByRole("button", { name: /Ada Lovelace/ }).click();
  await page.getByRole("button", { name: "Add files" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });

  await expect(page.getByText(/file added/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByAltText(/portrait|Ada Lovelace/i).first()).toBeVisible();
});
