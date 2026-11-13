import { expect, test, type Page } from "@playwright/test";
import { FROZEN_HUB_MOMENT } from "../../e2e/frozen-hub";

const FOLDER = "docs/screenshots";

async function hideTheDevBadge(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test.use({ viewport: { width: 1100, height: 760 } });

test("the desk", async ({ page }) => {
  await page.goto("/desk");
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-desk-as-of", FROZEN_HUB_MOMENT);
  await expect(page.getByRole("main")).toHaveAttribute("data-log-as-of", FROZEN_HUB_MOMENT);
  await page.screenshot({ path: `${FOLDER}/desk.png` });
});

test("the build board", async ({ page }) => {
  await page.goto("/clipboard");
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-board-from", /./);
  await page.screenshot({ path: `${FOLDER}/build-board.png` });
});
