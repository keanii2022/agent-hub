import { expect, test } from "@playwright/test";

test("the hub page says Agent Hub", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Agent Hub" })).toBeVisible();
});
