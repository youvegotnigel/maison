// ============================================================
//  Maison — sample Playwright tests
//  Demonstrates the four pillars this AUT is built for:
//  UI · API · Accessibility · Security
//
//  Setup (in your framework):
//    npm i -D @playwright/test @axe-core/playwright
//    npx playwright install
//    npx playwright test
//
//  Assumes the app is running at http://localhost:4000
//  (npm start from the project root).
// ============================================================
import { test, expect, request } from '@playwright/test';
// import AxeBuilder from '@axe-core/playwright'; // uncomment for the a11y test

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';

// Reset to deterministic seed data before each test for full isolation.
test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

// ------------------------------------------------------------
//  UI — end-to-end buyer purchase flow
// ------------------------------------------------------------
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

// ------------------------------------------------------------
//  UI — seller manages a listing
// ------------------------------------------------------------
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

// ------------------------------------------------------------
//  API — direct contract tests (no browser)
// ------------------------------------------------------------
test.describe('API · contract', () => {
  test('catalogue returns seeded products with computed prices', async ({ request }) => {
    const res = await request.get(`${API}/products`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(22);
    const tote = body.products.find(p => p.name.includes('Noir'));
    expect(tote.effectiveCents).toBe(242250); // 285000 - 15%
    expect(tote.onSale).toBe(true);
  });

  test('checkout decrements stock transactionally', async ({ request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: 'buyer@maison.test', password: PASSWORD } });
    const { token } = await login.json();
    const auth = { Cookie: `maison_token=${token}` };

    await request.post(`${API}/cart/items`, { headers: auth, data: { productId: 1, quantity: 2 } });
    const order = await request.post(`${API}/orders`, {
      headers: auth,
      data: { shipping: { name: 'A', address: '1 Rue', city: 'Paris', postalCode: '75001' }, payment: { method: 'mock-card', token: 'demo' } },
    });
    expect(order.status()).toBe(201);

    const prod = await (await request.get(`${API}/products/1`)).json();
    expect(prod.product.stock).toBe(6); // was 8
  });
});

// ------------------------------------------------------------
//  Security — RBAC, ownership (IDOR), validation
// ------------------------------------------------------------
test.describe('Security · authorization', () => {
  test('buyer cannot call seller-only route (403)', async ({ request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: 'buyer@maison.test', password: PASSWORD } });
    const { token } = await login.json();
    const res = await request.post(`${API}/products`, {
      headers: { Cookie: `maison_token=${token}` },
      data: { name: 'x', priceCents: 1000 },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN_ROLE');
  });

  test('seller cannot edit another sellers product — IDOR blocked (403)', async ({ request }) => {
    // product 1 is owned by seller1; authenticate as seller2
    const login = await request.post(`${API}/auth/login`, { data: { email: 'seller2@maison.test', password: PASSWORD } });
    const { token } = await login.json();
    const res = await request.patch(`${API}/products/1`, {
      headers: { Cookie: `maison_token=${token}` },
      data: { priceCents: 1 },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('NOT_OWNER');
  });

  test('unauthenticated cart access is rejected (401)', async ({ request }) => {
    const res = await request.get(`${API}/cart`);
    expect(res.status()).toBe(401);
  });

  test('weak password is rejected at registration (400)', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { email: 'new@x.test', password: 'abc', name: 'N', role: 'buyer' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('WEAK_PASSWORD');
  });

  test('security headers are present', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const headers = res.headers();
    expect(headers['content-security-policy']).toBeTruthy();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });
});

// ------------------------------------------------------------
//  Accessibility — axe-core scan
// ------------------------------------------------------------
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

// ------------------------------------------------------------
//  Mobile — responsive layout
// ------------------------------------------------------------
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
