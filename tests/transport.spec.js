import { test, expect } from '@playwright/test';

test('real Firebase HTTP fallback can load through the production content policy', async ({ page }) => {
  await page.route('https://controle-chaparia-default-rtdb.firebaseio.com/**', route => route.fulfill({
    contentType: 'application/javascript', body: 'parent.__firebasePollLoaded = true;'
  }));
  await page.goto('/Controle-Chaparia/transport-probe.html');
  await expect.poll(() => page.evaluate(() => !!window.__firebasePollLoaded), { timeout: 5000 }).toBe(true);
  expect(await page.evaluate(() => window.__cspViolations || [])).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__syncError)).toContain('demorou mais');
  await page.evaluate(() => window.__stopProbe());
});

test('logging out while the real SDK is still connecting cancels the loading deadline', async ({ page }) => {
  await page.route('https://controle-chaparia-default-rtdb.firebaseio.com/**', route => route.fulfill({
    contentType: 'application/javascript', body: 'parent.__firebasePollLoaded = true;'
  }));
  await page.goto('/Controle-Chaparia/transport-probe.html');
  await expect.poll(() => page.evaluate(() => !!window.__firebasePollLoaded)).toBe(true);
  await page.evaluate(() => window.__stopProbe());
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__syncError)).toBeUndefined();
});
