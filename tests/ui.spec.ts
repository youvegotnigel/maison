import { test, expect } from '@playwright/test';

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

test.describe('UI · buyer purchase flow', () => {
  test('buyer can search, add to cart, and check out', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    // Sign in
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
    await page.getByTestId('qty-incr').click(); // qty 2
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('2');

    // Cart -> checkout
    await page.getByTestId('nav-cart').click();
    await expect(page.getByTestId('summary-subtotal')).toHaveText('$4,845.00');
    await page.getByTestId('checkout-button').click();

    // Fill shipping and place order
    await page.getByTestId('ship-address').fill('1 Rue de Rivoli');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

    // Confirmation
    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-reference')).toContainText('ORD-');
  });
});

test.describe('UI · seller dashboard', () => {
  test('seller can publish a listing and apply a discount', async ({ page }) => {
    await page.goto(BASE);
    await page.getByTestId('nav-login').click();
    await page.getByTestId('login-email').fill('seller@maison.test');
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/#\/seller/);
    await page.getByTestId('np-name').fill('Test Atelier Piece');
    await page.getByTestId('np-price').fill('999.99');
    await page.getByTestId('np-stock').fill('5');
    await page.getByTestId('np-submit').click();

    await expect(page.getByTestId('listing-row').filter({ hasText: 'Test Atelier Piece' })).toBeVisible();
  });
});

test.describe('UI · new buyer registration and purchase', () => {
  test('new buyer registers with all fields, then completes a purchase', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    // Fill extended buyer registration form
    await page.getByTestId('register-first-name').fill('Sophie');
    await page.getByTestId('register-last-name').fill('Laurent');
    await page.getByTestId('register-email').fill('sophie.laurent@test.maison');
    await page.getByTestId('register-gender').selectOption('female');
    await page.getByTestId('register-phone').fill('+33 1 23 45 67 89');
    await page.getByTestId('register-password').fill('NewBuyer123!');
    await page.getByTestId('register-confirm-password').fill('NewBuyer123!');
    await page.getByTestId('register-submit').click();

    // Confirm registration and auto-login
    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');
    await expect(page.getByTestId('flash-success')).toContainText('Sophie Laurent');

    // Add first in-stock product to cart
    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Checkout
    await page.getByTestId('nav-cart').click();
    await page.getByTestId('checkout-button').click();
    await page.getByTestId('ship-address').fill('15 Rue de la Paix');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-reference')).toContainText('ORD-');
  });

  test('password mismatch shows inline error and does not submit', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    await page.getByTestId('register-first-name').fill('Sophie');
    await page.getByTestId('register-last-name').fill('Laurent');
    await page.getByTestId('register-email').fill('sophie2@test.maison');
    await page.getByTestId('register-password').fill('NewBuyer123!');
    await page.getByTestId('register-confirm-password').fill('Different999!');
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-error')).toContainText('Passwords do not match');
    // Still on register page — not logged in
    await expect(page.getByTestId('nav-login')).toBeVisible();
  });
});
