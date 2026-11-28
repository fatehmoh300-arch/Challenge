import { test, expect } from '@playwright/test';

test.describe('CHALLENGE core routes smoke check', () => {
  test('home route responds without server error', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  for (const route of ['/dashboard', '/daily', '/competition', '/calendar', '/stats', '/review', '/settings']) {
    test(`route ${route} renders or redirects cleanly without 500 error`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
    });
  }
});

test.describe('CHALLENGE interactive & runtime checks', () => {
  test('home page renders non-empty content without uncaught page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);
    const text = await page.locator('body').innerText();
    expect(text.trim().length).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
});
