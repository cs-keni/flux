import { test, expect } from '@playwright/test';

test('fluid sim visual regression — deterministic replay', async ({ page }) => {
  await page.goto('/?SIM_HEADLESS=true');

  // Wait for all REPLAY_TOTAL_FRAMES to complete.
  // Timeout is generous: synchronous GL on ANGLE/software-GL stalls ~250ms per
  // ping-pong FBO swap × 60 frames ≈ 15s total. We give 40s headroom.
  await page.waitForSelector('html[data-sim-ready="true"]', { timeout: 40_000 });

  const canvas = page.locator('#canvas');
  await expect(canvas).toHaveScreenshot('fluid-baseline.png', {
    threshold: 0.1,        // D11: per-pixel color tolerance (YIQ space, 0–1)
    maxDiffPixelRatio: 0.02,
  });
});
