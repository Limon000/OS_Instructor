import { test, expect } from "@playwright/test";

test.describe("Off-topic guard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    // Select Mode A to enter chat
    await page.waitForSelector('[aria-label*="Mode A"]', { timeout: 30_000 });
    await page.click('[aria-label*="Mode A"]');
    await page.waitForSelector('[role="log"]', { timeout: 60_000 });
    // Wait for mode response to finish streaming
    await page.waitForFunction(
      () => !document.querySelector(".streaming-cursor"),
      { timeout: 60_000 }
    );
  });

  test("off-topic input shows Yes/No overlay and disables chat input", async ({ page }) => {
    const input = page.locator("#chat-input");
    await input.fill("What is the capital of France?");
    await input.press("Enter");

    // Wait for overlay
    await expect(
      page.locator('[role="group"][aria-label="Off-topic response options"]')
    ).toBeVisible({ timeout: 30_000 });

    // Chat input should be disabled
    await expect(input).toBeDisabled();
  });

  test("clicking No dismisses overlay and re-enables input", async ({ page }) => {
    const input = page.locator("#chat-input");
    await input.fill("Teach me Python please");
    await input.press("Enter");

    await page.waitForSelector('[aria-label="No, continue the OS course (Escape)"]', {
      timeout: 30_000,
    });
    await page.click('[aria-label="No, continue the OS course (Escape)"]');

    // Overlay gone, input re-enabled
    await expect(
      page.locator('[role="group"][aria-label="Off-topic response options"]')
    ).not.toBeVisible();
    await expect(input).toBeEnabled({ timeout: 5_000 });
  });

  test("Escape key dismisses overlay", async ({ page }) => {
    const input = page.locator("#chat-input");
    await input.fill("Tell me a joke");
    await input.press("Enter");

    await page.waitForSelector('[role="group"][aria-label="Off-topic response options"]', {
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");

    await expect(
      page.locator('[role="group"][aria-label="Off-topic response options"]')
    ).not.toBeVisible();
  });
});
