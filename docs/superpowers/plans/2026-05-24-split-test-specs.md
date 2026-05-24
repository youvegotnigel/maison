# Split Test Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tests/maison.spec.js` with five focused spec files (ui, mobile, api, security, a11y), update npm scripts, add parallel GHA jobs, and update the README.

**Architecture:** Each new spec file is self-contained — it carries its own shared constants and `beforeEach` reset, so files can be run independently. `npm test` (no suffix) remains the run-all command by virtue of Playwright discovering all `*.spec.js` files in `./tests`. Five parallel GHA jobs each start the app fresh, run their suite, and upload a uniquely-named report artifact.

**Tech Stack:** Playwright (`@playwright/test`), Node 24, GitHub Actions

---

## File Map

| Action | Path |
|---|---|
| Create | `tests/ui.spec.js` |
| Create | `tests/mobile.spec.js` |
| Create | `tests/api.spec.js` |
| Create | `tests/security.spec.js` |
| Create | `tests/a11y.spec.js` |
| Delete | `tests/maison.spec.js` |
| Modify | `package.json` |
| Modify | `.github/workflows/playwright.yml` |
| Modify | `README.md` |

---

## Task 1: Create tests/ui.spec.js

**Files:**
- Create: `tests/ui.spec.js`

- [ ] **Step 1: Create the file**

```js
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

    await page.getByTestId('nav-login').click();
    await page.getByTestId('login-email').fill('buyer@maison.test');
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');

    await page.getByTestId('search-input').fill('tote');
    await page.getByTestId('search-submit').click();
    await expect(page.getByTestId('product-card')).toHaveCount(1);

    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('qty-incr').click();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('2');

    await page.getByTestId('nav-cart').click();
    await expect(page.getByTestId('summary-subtotal')).toHaveText('$4,845.00');
    await page.getByTestId('checkout-button').click();

    await page.getByTestId('ship-address').fill('1 Rue de Rivoli');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

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
```

- [ ] **Step 2: Run the suite to verify it passes**

```bash
npx playwright test tests/ui.spec.js
```

Expected: `2 passed`

---

## Task 2: Create tests/mobile.spec.js

**Files:**
- Create: `tests/mobile.spec.js`

- [ ] **Step 1: Create the file**

```js
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
    await page.getByTestId('nav-toggle').click();
    await expect(page.getByTestId('nav-shop')).toBeVisible();
    await expect(page.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'true');
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

    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-login').click();
    await page.getByTestId('login-email').fill('buyer@maison.test');
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');

    await page.getByTestId('search-input').fill('tote');
    await page.getByTestId('search-submit').click();
    await expect(page.getByTestId('product-card')).toHaveCount(1);

    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('qty-incr').click();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('2');

    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-cart').click();
    await expect(page.getByTestId('summary-subtotal')).toHaveText('$4,845.00');
    await page.getByTestId('checkout-button').click();

    await page.getByTestId('ship-address').fill('1 Rue de Rivoli');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-reference')).toContainText('ORD-');
  });
});
```

- [ ] **Step 2: Run the suite to verify it passes**

```bash
npx playwright test tests/mobile.spec.js
```

Expected: `6 passed`

---

## Task 3: Create tests/api.spec.js

**Files:**
- Create: `tests/api.spec.js`

- [ ] **Step 1: Create the file**

```js
import { test, expect } from '@playwright/test';

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

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
```

- [ ] **Step 2: Run the suite to verify it passes**

```bash
npx playwright test tests/api.spec.js
```

Expected: `2 passed`

---

## Task 4: Create tests/security.spec.js

**Files:**
- Create: `tests/security.spec.js`

- [ ] **Step 1: Create the file**

```js
import { test, expect } from '@playwright/test';

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

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
```

- [ ] **Step 2: Run the suite to verify it passes**

```bash
npx playwright test tests/security.spec.js
```

Expected: `5 passed`

---

## Task 5: Create tests/a11y.spec.js

**Files:**
- Create: `tests/a11y.spec.js`

- [ ] **Step 1: Create the file**

```js
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
```

- [ ] **Step 2: Run the suite to verify it passes**

```bash
npx playwright test tests/a11y.spec.js
```

Expected: `1 passed`

---

## Task 6: Update package.json and remove maison.spec.js

**Files:**
- Modify: `package.json`
- Delete: `tests/maison.spec.js`

- [ ] **Step 1: Update the scripts block in package.json**

Replace the existing `scripts` block with:

```json
"scripts": {
  "postinstall": "cd server && npm install",
  "start": "node server/src/index.js",
  "test:smoke": "node verify.mjs",
  "test": "playwright test",
  "test:open": "playwright test --ui",
  "test:debug": "playwright test --debug",
  "test:ui": "playwright test tests/ui.spec.js",
  "test:mobile": "playwright test tests/mobile.spec.js",
  "test:api": "playwright test tests/api.spec.js",
  "test:security": "playwright test tests/security.spec.js",
  "test:a11y": "playwright test tests/a11y.spec.js"
},
```

- [ ] **Step 2: Verify each per-suite script resolves to the right file**

```bash
npm run test:ui -- --list
npm run test:mobile -- --list
npm run test:api -- --list
npm run test:security -- --list
npm run test:a11y -- --list
```

Expected: each command lists only the tests from its target file (no cross-contamination).

- [ ] **Step 3: Delete tests/maison.spec.js**

```bash
rm tests/maison.spec.js
```

- [ ] **Step 4: Run the full suite to verify run-all works and test count is correct**

```bash
npm test -- --list
```

Expected: 16 tests listed total (2 UI + 6 Mobile + 2 API + 5 Security + 1 A11y). No `maison.spec.js` tests appear.

- [ ] **Step 5: Commit**

```bash
git add tests/ui.spec.js tests/mobile.spec.js tests/api.spec.js tests/security.spec.js tests/a11y.spec.js tests/maison.spec.js package.json
git commit -m "refactor: split maison.spec.js into five focused spec files

Add tests/ui.spec.js, mobile.spec.js, api.spec.js, security.spec.js,
a11y.spec.js. Remove monolith. Rename test:ui → test:open (Playwright
interactive mode); add per-suite test:ui/mobile/api/security/a11y scripts.
npm test continues to run all suites."
```

---

## Task 7: Rewrite .github/workflows/playwright.yml

**Files:**
- Modify: `.github/workflows/playwright.yml`

- [ ] **Step 1: Replace the file contents**

```yaml
name: Playwright Tests

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test-ui:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v5
      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Start app
        run: npm start &
      - name: Wait for app to be ready
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:4000/api/v1/health > /dev/null; then
              echo "App is up (attempt $i)"; exit 0
            fi
            echo "  attempt $i/30 — retrying in 1s"; sleep 1
          done
          echo "App never came up after 30s"; exit 1
      - name: Run UI tests
        run: npm run test:ui
      - name: Upload test report
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: playwright-report-ui
          path: playwright-report/
          retention-days: 30
      - name: Upload test results
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: test-results-ui
          path: test-results/
          retention-days: 30
          if-no-files-found: ignore
      - name: Stop app
        if: always()
        run: pkill -f "server/src/index.js" || true

  test-mobile:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v5
      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Start app
        run: npm start &
      - name: Wait for app to be ready
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:4000/api/v1/health > /dev/null; then
              echo "App is up (attempt $i)"; exit 0
            fi
            echo "  attempt $i/30 — retrying in 1s"; sleep 1
          done
          echo "App never came up after 30s"; exit 1
      - name: Run mobile tests
        run: npm run test:mobile
      - name: Upload test report
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: playwright-report-mobile
          path: playwright-report/
          retention-days: 30
      - name: Upload test results
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: test-results-mobile
          path: test-results/
          retention-days: 30
          if-no-files-found: ignore
      - name: Stop app
        if: always()
        run: pkill -f "server/src/index.js" || true

  test-api:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v5
      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Start app
        run: npm start &
      - name: Wait for app to be ready
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:4000/api/v1/health > /dev/null; then
              echo "App is up (attempt $i)"; exit 0
            fi
            echo "  attempt $i/30 — retrying in 1s"; sleep 1
          done
          echo "App never came up after 30s"; exit 1
      - name: Run API tests
        run: npm run test:api
      - name: Upload test report
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: playwright-report-api
          path: playwright-report/
          retention-days: 30
      - name: Upload test results
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: test-results-api
          path: test-results/
          retention-days: 30
          if-no-files-found: ignore
      - name: Stop app
        if: always()
        run: pkill -f "server/src/index.js" || true

  test-security:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v5
      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Start app
        run: npm start &
      - name: Wait for app to be ready
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:4000/api/v1/health > /dev/null; then
              echo "App is up (attempt $i)"; exit 0
            fi
            echo "  attempt $i/30 — retrying in 1s"; sleep 1
          done
          echo "App never came up after 30s"; exit 1
      - name: Run security tests
        run: npm run test:security
      - name: Upload test report
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: playwright-report-security
          path: playwright-report/
          retention-days: 30
      - name: Upload test results
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: test-results-security
          path: test-results/
          retention-days: 30
          if-no-files-found: ignore
      - name: Stop app
        if: always()
        run: pkill -f "server/src/index.js" || true

  test-a11y:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v5
      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Start app
        run: npm start &
      - name: Wait for app to be ready
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:4000/api/v1/health > /dev/null; then
              echo "App is up (attempt $i)"; exit 0
            fi
            echo "  attempt $i/30 — retrying in 1s"; sleep 1
          done
          echo "App never came up after 30s"; exit 1
      - name: Run accessibility tests
        run: npm run test:a11y
      - name: Upload test report
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: playwright-report-a11y
          path: playwright-report/
          retention-days: 30
      - name: Upload test results
        uses: actions/upload-artifact@v5
        if: always()
        with:
          name: test-results-a11y
          path: test-results/
          retention-days: 30
          if-no-files-found: ignore
      - name: Stop app
        if: always()
        run: pkill -f "server/src/index.js" || true
```

- [ ] **Step 2: Validate the YAML is well-formed**

```bash
npx js-yaml .github/workflows/playwright.yml > /dev/null && echo "YAML valid"
```

Expected: `YAML valid` (install js-yaml first if needed: `npm install -g js-yaml`)

Alternatively, use Python (available on macOS by default):

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/playwright.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/playwright.yml
git commit -m "ci: replace single job with 5 parallel per-suite jobs

Each suite (ui, mobile, api, security, a11y) runs in its own job with
its own app instance. Timeout 15 min per job. Artifacts named
playwright-report-<suite> and test-results-<suite>."
```

---

## Task 8: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the intro paragraph**

Find:
```
four testing pillars: **UI, API, Accessibility,
and Security.**
```

Replace with:
```
five testing pillars: **UI, Mobile, API, Accessibility,
and Security.**
```

- [ ] **Step 2: Update the architecture tree**

Find:
```
└── tests/
    └── maison.spec.js      # sample Playwright tests (UI/API/Security/A11y)
```

Replace with:
```
└── tests/
    ├── ui.spec.js          # UI end-to-end: buyer purchase flow, seller dashboard
    ├── mobile.spec.js      # Mobile: responsive layout, hamburger nav, purchase flow
    ├── api.spec.js         # API contract: catalogue, transactional checkout
    ├── security.spec.js    # Security: RBAC, IDOR, auth headers
    └── a11y.spec.js        # Accessibility: WCAG landmark checks (axe-core scaffold)
```

- [ ] **Step 3: Update the "Running the sample tests" section**

Find:
```bash
npm start                                  # terminal 1
# terminal 2:
npm i -D @playwright/test @axe-core/playwright
npx playwright install
npx playwright test tests/maison.spec.js
```

Replace with:
```bash
npm start                                  # terminal 1
# terminal 2:
npm i -D @playwright/test @axe-core/playwright
npx playwright install

npm test                   # run all five suites
npm run test:ui            # UI only
npm run test:mobile        # Mobile only
npm run test:api           # API only
npm run test:security      # Security only
npm run test:a11y          # Accessibility only
npm run test:open          # Playwright interactive UI (suite picker)
```

- [ ] **Step 4: Verify the README renders correctly**

```bash
# Quick sanity check: confirm the five test file names appear in the README
grep -E "ui\.spec|mobile\.spec|api\.spec|security\.spec|a11y\.spec" README.md
```

Expected: 5 lines, one per file.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README for five-pillar test split

Add Mobile as fifth pillar. Update architecture tree to list the five
spec files. Update test commands to show per-suite npm scripts."
```
