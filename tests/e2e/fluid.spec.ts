import { test, expect } from '@playwright/test';

test('fluid sim visual regression — deterministic replay', async ({ page }) => {
  await page.goto('/?SIM_HEADLESS=true');

  // Wait for all REPLAY_TOTAL_FRAMES to complete
  await page.waitForSelector('html[data-sim-ready="true"]', { timeout: 15_000 });

  const canvas = page.locator('#canvas');
  await expect(canvas).toHaveScreenshot('fluid-baseline.png', {
    threshold: 0.1,        // D11: per-pixel color tolerance (YIQ space, 0–1)
    maxDiffPixelRatio: 0.02,
  });
});
