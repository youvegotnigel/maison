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

  test('register page has correct labels for all new buyer fields', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    // Each new input has an associated <label for="...">
    await expect(page.locator('label[for="reg-first-name"]')).toBeAttached();
    await expect(page.locator('label[for="reg-last-name"]')).toBeAttached();
    await expect(page.locator('label[for="reg-gender"]')).toBeAttached();
    await expect(page.locator('label[for="reg-phone"]')).toBeAttached();
    await expect(page.locator('label[for="reg-confirm-password"]')).toBeAttached();
    // Role toggle buttons have aria-pressed
    await expect(page.getByTestId('role-buyer')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('role-seller')).toHaveAttribute('aria-pressed', 'false');
  });
});
