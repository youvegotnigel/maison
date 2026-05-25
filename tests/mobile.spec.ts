import { test, expect } from '@playwright/test';

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

test.describe('Mobile · responsive layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('shop page has no horizontal overflow', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('cart page has no horizontal overflow', async ({ page }) => {
    await page.goto(BASE + '#/login');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await page.getByTestId('login-email').fill('buyer@maison.test');
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');
    await page.goto(BASE + '#/product/1');
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('add-to-cart').click();
    await page.goto(BASE + '#/cart');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('hamburger button is visible and nav links are hidden by default', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.getByTestId('nav-toggle')).toBeVisible();
    await expect(page.getByTestId('nav-shop')).not.toBeVisible();
  });

  test('hamburger opens and closes the nav', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    // open
    await page.getByTestId('nav-toggle').click();
    await expect(page.getByTestId('nav-shop')).toBeVisible();
    await expect(page.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'true');
    // close
    await page.getByTestId('nav-toggle').click();
    await expect(page.getByTestId('nav-shop')).not.toBeVisible();
    await expect(page.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  test('can navigate to shop via the mobile menu', async ({ page }) => {
    await page.goto(BASE + '#/login');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-shop').click();
    await expect(page.getByTestId('nav-shop')).not.toBeVisible();
    await expect(page.getByTestId('catalogue')).toBeVisible();
  });

  test('buyer can complete purchase on mobile', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    // Sign in via hamburger menu
    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-login').click();
    await page.getByTestId('login-email').fill('buyer@maison.test');
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');

    // Search
    await page.getByTestId('search-input').fill('tote');
    await page.getByTestId('search-submit').click();
    await expect(page.getByTestId('product-card')).toHaveCount(1);

    // Open product, add to cart
    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('qty-incr').click();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('2');

    // Navigate to cart via hamburger
    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-cart').click();
    await expect(page.getByTestId('summary-subtotal')).toHaveText('$4,845.00');
    await page.getByTestId('checkout-button').click();

    // Fill shipping and place order
    await page.getByTestId('ship-address').fill('1 Rue de Rivoli');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-reference')).toContainText('ORD-');
  });
});

test.describe('Mobile · new buyer registration', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('new buyer registers and completes purchase on mobile', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    await page.getByTestId('register-first-name').fill('Sophie');
    await page.getByTestId('register-last-name').fill('Laurent');
    await page.getByTestId('register-email').fill('sophie.mobile@test.maison');
    await page.getByTestId('register-password').fill('NewBuyer123!');
    await page.getByTestId('register-confirm-password').fill('NewBuyer123!');
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');

    // Add product to cart
    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Navigate to cart via hamburger
    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-cart').click();
    await page.getByTestId('checkout-button').click();

    await page.getByTestId('ship-address').fill('15 Rue de la Paix');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-reference')).toContainText('ORD-');
  });

  test('register page has no horizontal overflow on mobile', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});
