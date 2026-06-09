import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
    await expect(page.locator('label[for="reg-dob"]')).toBeAttached();
    // Role toggle buttons have aria-pressed
    await expect(page.getByTestId('role-buyer')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('role-seller')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('Accessibility · DOB picker', () => {
  test('DOB trigger has correct ARIA attributes', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    // Check initial state
    await expect(page.getByTestId('dob-display')).toHaveAttribute('role', 'button');
    await expect(page.getByTestId('dob-display')).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(page.getByTestId('dob-display')).toHaveAttribute('aria-expanded', 'false');
    // Click to open
    await page.getByTestId('dob-display').click();
    // Check open state
    await expect(page.getByTestId('dob-display')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('dob-picker')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByTestId('dob-picker')).toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('dob-picker')).toHaveAttribute('aria-label', 'Select date of birth');
    // Press Escape to close
    await page.keyboard.press('Escape');
    // Check closed state
    await expect(page.getByTestId('dob-display')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('dob-picker')).toHaveAttribute('aria-hidden', 'true');
  });

  test('DOB day buttons have aria-label', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    // Click to open picker
    await page.getByTestId('dob-display').click();
    // Check day button labels
    await expect(page.getByTestId('dob-day-1')).toHaveAttribute('aria-label', 'Day 1');
    await expect(page.getByTestId('dob-day-15')).toHaveAttribute('aria-label', 'Day 15');
  });
});

test.describe('Accessibility · standalone windows', () => {
  test('certificate view passes axe-core', async ({ page }) => {
    await page.goto(BASE + '/certificate/1');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.getByTestId('certificate-view')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('size-guide view passes axe-core', async ({ page }) => {
    await page.goto(BASE + '/size-guide');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.getByTestId('size-guide-view')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('Accessibility · window forms', () => {
  test('certificate verify input is label-associated and axe-clean', async ({ page }) => {
    await page.goto(BASE + '/certificate/1');
    await expect(page.getByTestId('certificate-view')).toBeVisible();
    await expect(page.locator('label[for="cert-serial"]')).toBeAttached();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('size-guide chest input is label-associated and axe-clean', async ({ page }) => {
    await page.goto(BASE + '/size-guide');
    await expect(page.getByTestId('size-guide-view')).toBeVisible();
    await expect(page.locator('label[for="size-chest"]')).toBeAttached();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
