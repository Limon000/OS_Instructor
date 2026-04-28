import { test, expect } from "@playwright/test";

test.describe("Greeting flow", () => {
  test("fresh load shows 3 mode cards", async ({ page }) => {
    // Clear session storage so we always get a fresh greeting
    await page.goto("/");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    // Wait for the greeting to load
    await page.waitForSelector('[role="group"][aria-label="Choose a learning mode"]', {
      timeout: 30_000,
    });

    const cards = page.locator('[role="group"][aria-label="Choose a learning mode"] button');
    await expect(cards).toHaveCount(3);
  });

  test("clicking Mode A dismisses cards and shows a response", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    await page.waitForSelector('[aria-label*="Mode A"]', { timeout: 30_000 });
    await page.click('[aria-label*="Mode A"]');

    // Mode cards should disappear
    await expect(
      page.locator('[role="group"][aria-label="Choose a learning mode"]')
    ).not.toBeVisible({ timeout: 60_000 });

    // An assistant message should appear
    const messages = page.locator('[role="log"] >> text=Limon').first();
    await expect(messages).toBeVisible({ timeout: 60_000 });
  });
});
