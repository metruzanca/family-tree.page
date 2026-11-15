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

  // File nodes get the same info panel as people.
  await page.getByRole("button", { name: /Search people and files/ }).click();
  const fileSearch = page.getByRole("dialog", { name: "Search the tree" });
  await fileSearch.getByPlaceholder(/Name, nickname/).fill("portrait");
  await fileSearch.getByRole("button", { name: /portrait\.png/ }).click();
  await expect(page.getByText("Attached to")).toBeVisible();
  await expect(page.getByRole("button", { name: "View full size" })).toBeVisible();
  await page.getByRole("button", { name: "View full size" }).click();
  await expect(page.getByRole("dialog", { name: "portrait.png" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();
  await page.mouse.click(24, 700);

  // Cursor is a pointer only over nodes, and dragging does not open a panel.
  await page.waitForTimeout(1200);
  const nodePoint = await page.evaluate(() => {
    const graph = (window as any).__rootsGraph;
    const node = graph.graphData().nodes.find((candidate: any) => candidate.person?.firstName === "Ada");
    const point = graph.graph2ScreenCoords(node.x, node.y);
    return { x: point.x, y: point.y };
  });
  await page.mouse.move(nodePoint.x, nodePoint.y, { steps: 6 });
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.querySelector(".graph-canvas canvas") as HTMLCanvasElement).style.cursor,
      ),
    )
    .toBe("pointer");
  await page.mouse.move(24, 720, { steps: 6 });
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.querySelector(".graph-canvas canvas") as HTMLCanvasElement).style.cursor,
      ),
    )
    .toBe("default");

  const beforeDrag = await page.evaluate(() => {
    const graph = (window as any).__rootsGraph;
    const node = graph.graphData().nodes.find((candidate: any) => candidate.person?.firstName === "Ada");
    return { x: node.x, y: node.y, level: node.level };
  });
  await page.mouse.move(nodePoint.x, nodePoint.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(nodePoint.x + 80, nodePoint.y + 220, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const afterDrag = await page.evaluate(() => {
    const graph = (window as any).__rootsGraph;
    const node = graph.graphData().nodes.find((candidate: any) => candidate.person?.firstName === "Ada");
    return { x: node.x, y: node.y, level: node.level };
  });
  expect(afterDrag.level).toBe(beforeDrag.level);
  expect(Math.abs(afterDrag.x - beforeDrag.x)).toBeGreaterThan(5);
  await expect(page.url()).not.toContain("person=");
});
