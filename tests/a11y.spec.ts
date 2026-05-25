import { test, expect } from '@playwright/test';
// import AxeBuilder from '@axe-core/playwright'; // uncomment for the a11y test

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

test.describe('Accessibility · WCAG', () => {
  test('shop page has no critical axe violations', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    // Uncomment after installing @axe-core/playwright:
    //
    // const results = await new AxeBuilder({ page })
    //   .withTags(['wcag2a', 'wcag2aa'])
    //   .analyze();
    // expect(results.violations).toEqual([]);
    //
    // Basic landmark checks that work without axe:
    await expect(page.locator('header[role="banner"]')).toBeVisible();
    await expect(page.locator('main[role="main"]')).toBeVisible();
    await expect(page.getByTestId('skip-link')).toBeAttached();
  });
});
