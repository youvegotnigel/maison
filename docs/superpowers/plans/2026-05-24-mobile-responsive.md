# Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken mobile layouts, add a hamburger nav, and add a `Mobile · responsive layout` Playwright test suite — all without touching existing tests or config.

**Architecture:** Three files change: `styles.css` gets CSS fixes and hamburger styles, `app.js` gets the hamburger button + JS toggle logic added to `renderHeader()`, and `maison.spec.js` gets a new describe block using `test.use({ viewport })`. TDD throughout: write each test first, confirm it fails, implement the fix, confirm it passes, commit.

**Tech Stack:** Vanilla JS, CSS3 media queries, Playwright `@playwright/test`

---

## File Map

| File | Change |
|------|--------|
| `web/dist/styles.css` | Fix toolbar `min-width`, fix `cart-line` grid areas, add `.cart-layout` class + responsive rule, add `.nav-toggle` and `.nav--open` styles |
| `web/dist/src/app.js` | Add `<button data-testid="nav-toggle">` to `renderHeader()`; remove inline style from `cart-layout` divs; add hamburger JS toggle logic |
| `tests/maison.spec.js` | Add `Mobile · responsive layout` describe block with 5 tests |

---

## Task 1: Fix toolbar overflow

**Files:**
- Modify: `tests/maison.spec.js` (append to bottom)
- Modify: `web/dist/styles.css` line 184

- [ ] **Step 1: Append the mobile describe block stub + first test to `maison.spec.js`**

Add this to the very bottom of `tests/maison.spec.js`:

```js
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
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx playwright test --grep "shop page has no horizontal overflow"
```

Expected: FAIL — the toolbar `input[type="search"]` has `min-width: 260px` which forces a horizontal scroll on 375px viewports.

- [ ] **Step 3: Fix the toolbar CSS in `styles.css`**

Find line 184:
```css
.toolbar input[type="search"] { min-width: 260px; flex: 1; }
```

Replace with:
```css
.toolbar input[type="search"] { width: 100%; flex: 1 1 200px; }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx playwright test --grep "shop page has no horizontal overflow"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/maison.spec.js web/dist/styles.css
git commit -m "fix: remove toolbar min-width that caused mobile overflow; add shop overflow test"
```

---

## Task 2: Fix cart-line and cart-layout

**Files:**
- Modify: `tests/maison.spec.js` (add test inside the mobile describe block)
- Modify: `web/dist/styles.css` (cart-line grid areas + cart-layout class + responsive rule)
- Modify: `web/dist/src/app.js` lines 319 and 356 (remove inline style from cart-layout divs)

- [ ] **Step 1: Add the cart overflow test inside the mobile describe block**

Inside the `Mobile · responsive layout` describe block (after the shop overflow test), add:

```js
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx playwright test --grep "cart page has no horizontal overflow"
```

Expected: FAIL — the cart/checkout use an inline `grid-template-columns: 1fr 360px` with no mobile override, and the cart-line 5-column grid doesn't wrap correctly.

- [ ] **Step 3: Add `.cart-layout` CSS class to `styles.css`**

In `styles.css`, find the `/* ---------- Cart / table ---------- */` section (around line 169). After the `.cart-summary .total` rule, add:

```css
.cart-layout { display: grid; grid-template-columns: 1fr 360px; gap: 48px; align-items: start; }
```

- [ ] **Step 4: Fix the cart-line grid areas in `styles.css`**

Find the existing `@media (max-width: 560px)` block (at the bottom of the file):

```css
@media (max-width: 560px) {
  .cart-line { grid-template-columns: 60px 1fr; grid-auto-rows: auto; }
  .cart-line img { width: 60px; height: 60px; }
  .brand { font-size: 1.3rem; letter-spacing: 0.3em; }
  .container { padding: 0 18px; }
}
```

Replace with:

```css
@media (max-width: 560px) {
  .cart-line {
    grid-template-columns: 60px 1fr 1fr auto;
    grid-template-rows: auto auto;
    grid-template-areas:
      "img info  info   info"
      "img qty   price  remove";
    row-gap: 8px;
    column-gap: 10px;
  }
  .cart-line img { grid-area: img; width: 60px; height: 60px; }
  .cart-line > *:nth-child(2) { grid-area: info; }
  .cart-line > *:nth-child(3) { grid-area: qty; }
  .cart-line > *:nth-child(4) { grid-area: price; }
  .cart-line > *:nth-child(5) { grid-area: remove; }
  .brand { font-size: 1.3rem; letter-spacing: 0.3em; }
  .container { padding: 0 18px; }
}
```

- [ ] **Step 5: Add responsive breakpoint for `.cart-layout` in `styles.css`**

Inside the existing `@media (max-width: 900px)` block, add:

```css
  .cart-layout { grid-template-columns: 1fr; }
```

So the full 900px block becomes:

```css
@media (max-width: 900px) {
  .pdp { grid-template-columns: 1fr; gap: 32px; }
  .dash-grid { grid-template-columns: 1fr; gap: 32px; }
  .cart-layout { grid-template-columns: 1fr; }
  .nav { gap: 16px; }
  .nav a.hide-sm { display: none; }
}
```

- [ ] **Step 6: Remove inline styles from the two `cart-layout` divs in `app.js`**

In `pageCart()` (around line 319), find:
```js
        : `<div style="display:grid;grid-template-columns:1fr 360px;gap:48px;align-items:start" class="cart-layout">
```
Replace with:
```js
        : `<div class="cart-layout">
```

In `pageCheckout()` (around line 356), find:
```js
      <div style="display:grid;grid-template-columns:1fr 360px;gap:48px;align-items:start" class="cart-layout">
```
Replace with:
```js
      <div class="cart-layout">
```

- [ ] **Step 7: Run test to confirm it passes**

```bash
npx playwright test --grep "cart page has no horizontal overflow"
```

Expected: PASS

- [ ] **Step 8: Run the full suite to confirm nothing broke**

```bash
npx playwright test
```

Expected: All existing tests still pass.

- [ ] **Step 9: Commit**

```bash
git add tests/maison.spec.js web/dist/styles.css web/dist/src/app.js
git commit -m "fix: responsive cart-line grid and cart-layout for mobile; add cart overflow test"
```

---

## Task 3: Add hamburger button (HTML + CSS)

**Files:**
- Modify: `tests/maison.spec.js` (add test inside the mobile describe block)
- Modify: `web/dist/src/app.js` (add `<button data-testid="nav-toggle">` in `renderHeader()`)
- Modify: `web/dist/styles.css` (add nav-toggle and ≤480px nav rules)

- [ ] **Step 1: Add the hamburger visibility test inside the mobile describe block**

```js
  test('hamburger button is visible and nav links are hidden by default', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.getByTestId('nav-toggle')).toBeVisible();
    await expect(page.getByTestId('nav-shop')).not.toBeVisible();
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx playwright test --grep "hamburger button is visible"
```

Expected: FAIL — `nav-toggle` does not exist in the DOM.

- [ ] **Step 3: Add the nav-toggle button and testid to `renderHeader()` in `app.js`**

Find the `renderHeader()` function. Replace the `header.innerHTML = \`` assignment (lines 46–62) with:

```js
  header.innerHTML = `
    <div class="container">
      <div class="brand" data-testid="brand">MAISON<small>MAISON DE LUXE</small></div>
      <button class="nav-toggle" data-testid="nav-toggle" aria-expanded="false" aria-label="Open navigation">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav" data-testid="nav-mobile-menu" aria-label="Primary">
        <a href="#/" data-testid="nav-shop">Shop</a>
        ${u && u.role === 'seller' ? `<a href="#/seller" data-testid="nav-seller">Atelier</a>` : ''}
        ${u && u.role === 'buyer' ? `<a href="#/orders" data-testid="nav-orders" class="hide-sm">Orders</a>` : ''}
        ${u && u.role === 'buyer' ? `
          <a href="#/cart" class="cart-pill" data-testid="nav-cart" aria-label="Cart, ${cartCount} items">
            Cart <span class="cart-count" data-testid="cart-count">${cartCount}</span>
          </a>` : ''}
        ${u
          ? `<span class="tiny" data-testid="current-user" data-role="${esc(u.role)}">${esc(u.name)}</span>
             <a href="#" data-testid="logout-link">Logout</a>`
          : `<a href="#/login" data-testid="nav-login">Sign In</a>`}
      </nav>
    </div>`;
```

- [ ] **Step 4: Add `.nav-toggle` CSS to `styles.css`**

After the `/* ---------- Footer ---------- */` section, add a new section:

```css
/* ---------- Hamburger toggle ---------- */
.nav-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  padding: 10px;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
.nav-toggle span { display: block; height: 1px; background: var(--cream); transition: transform 0.2s, opacity 0.2s; }
.nav-toggle[aria-expanded="true"] span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.nav-toggle[aria-expanded="true"] span:nth-child(2) { opacity: 0; }
.nav-toggle[aria-expanded="true"] span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
```

- [ ] **Step 5: Add the ≤480px nav rules to `styles.css`**

After the existing `@media (max-width: 560px)` block, add:

```css
@media (max-width: 480px) {
  .nav-toggle { display: flex; }
  .masthead .container { position: relative; }
  .nav {
    position: absolute; top: 76px; left: 0; right: 0;
    flex-direction: column; align-items: stretch; gap: 0;
    max-height: 0; overflow: hidden; transition: max-height 0.3s ease;
    background: rgba(16,15,13,0.96); backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--line); z-index: 49;
  }
  /* Hide all nav children until menu opens */
  .nav > * { display: none; }
}
```

- [ ] **Step 6: Run test to confirm it passes**

```bash
npx playwright test --grep "hamburger button is visible"
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/maison.spec.js web/dist/styles.css web/dist/src/app.js
git commit -m "feat: add hamburger toggle button and hide mobile nav by default"
```

---

## Task 4: Add hamburger open/close JS logic

**Files:**
- Modify: `tests/maison.spec.js` (add test inside the mobile describe block)
- Modify: `web/dist/src/app.js` (add toggle JS + AbortController cleanup to `renderHeader()`)
- Modify: `web/dist/styles.css` (add `.nav--open` rules)

- [ ] **Step 1: Add the hamburger open/close test inside the mobile describe block**

```js
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx playwright test --grep "hamburger opens and closes"
```

Expected: FAIL — clicking the button doesn't show nav links (no toggle logic yet).

- [ ] **Step 3: Add JS toggle logic to `renderHeader()` in `app.js`**

After the `header.innerHTML = ...` assignment, replace the existing two-line event wiring (brand click + logout link) with:

```js
  header.querySelector('[data-testid="brand"]').onclick = () => { location.hash = '#/'; };

  const toggle = header.querySelector('[data-testid="nav-toggle"]');
  const nav = header.querySelector('[data-testid="nav-mobile-menu"]');

  function closeNav() {
    nav.classList.remove('nav--open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
  }

  toggle.onclick = () => {
    const isOpen = nav.classList.toggle('nav--open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  };

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeNav);
  });

  if (window.__navAbort) window.__navAbort.abort();
  window.__navAbort = new AbortController();
  const { signal } = window.__navAbort;

  document.addEventListener('click', (e) => {
    if (nav.classList.contains('nav--open') && !nav.contains(e.target) && !toggle.contains(e.target)) closeNav();
  }, { signal });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  }, { signal });

  const logoutLink = header.querySelector('[data-testid="logout-link"]');
  if (logoutLink) logoutLink.onclick = (e) => { e.preventDefault(); window.__logout(); };
```

- [ ] **Step 4: Add `.nav--open` CSS to `styles.css`**

Inside the `@media (max-width: 480px)` block added in Task 3, add after `.nav > * { display: none; }`:

```css
  .nav--open { max-height: 400px; padding: 8px 0; }
  .nav--open > * { display: flex; align-items: center; }
  .nav--open a, .nav--open .cart-pill {
    padding: 14px 28px; width: 100%; font-size: 0.88rem;
    border-bottom: 1px solid var(--line-soft); border-radius: 0; border-left: none; border-right: none; border-top: none;
  }
  .nav--open .cart-pill { gap: 10px; }
  .nav--open .tiny { padding: 10px 28px; font-size: 0.76rem; }
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
npx playwright test --grep "hamburger opens and closes"
```

Expected: PASS

- [ ] **Step 6: Run the full suite**

```bash
npx playwright test
```

Expected: All existing tests still pass (desktop viewport tests are unaffected by ≤480px rules).

- [ ] **Step 7: Commit**

```bash
git add tests/maison.spec.js web/dist/styles.css web/dist/src/app.js
git commit -m "feat: hamburger JS toggle with aria-expanded, outside-click and Escape close"
```

---

## Task 5: Add navigation-via-menu test

**Files:**
- Modify: `tests/maison.spec.js` (add test inside the mobile describe block)

- [ ] **Step 1: Add the navigation test inside the mobile describe block**

```js
  test('can navigate to shop via the mobile menu', async ({ page }) => {
    await page.goto(BASE + '#/login');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-shop').click();
    await expect(page.getByTestId('nav-shop')).not.toBeVisible();
    await expect(page.getByTestId('catalogue')).toBeVisible();
  });
```

- [ ] **Step 2: Run the test to confirm it passes**

```bash
npx playwright test --grep "can navigate to shop via the mobile menu"
```

Expected: PASS — clicking a nav link closes the menu (Task 4 wired this up) and the router renders the shop.

- [ ] **Step 3: Commit**

```bash
git add tests/maison.spec.js
git commit -m "test: add mobile menu navigation test"
```

---

## Task 6: Add full mobile buyer purchase flow test

**Files:**
- Modify: `tests/maison.spec.js` (add test inside the mobile describe block)

- [ ] **Step 1: Add the full mobile buyer test inside the mobile describe block**

```js
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
```

- [ ] **Step 2: Run the test to confirm it passes**

```bash
npx playwright test --grep "buyer can complete purchase on mobile"
```

Expected: PASS — all layout fixes and hamburger nav are in place from prior tasks.

- [ ] **Step 3: Run the complete suite one final time**

```bash
npx playwright test
```

Expected: All tests pass, including all 5 new mobile tests.

- [ ] **Step 4: Commit**

```bash
git add tests/maison.spec.js
git commit -m "test: add full mobile buyer purchase flow test"
```

---

## Self-Review

**Spec coverage:**
- ✅ Toolbar overflow fix → Task 1
- ✅ Cart-line mobile layout → Task 2
- ✅ Cart-layout responsive → Task 2
- ✅ Nav overflow guard at ≤480px → Task 3
- ✅ Hamburger button HTML + aria → Tasks 3–4
- ✅ JS toggle: click, link-click closes, outside-click closes, Escape closes → Task 4
- ✅ `data-testid="nav-toggle"` and `data-testid="nav-mobile-menu"` → Task 3
- ✅ Test 1 (hamburger visibility) → Task 3
- ✅ Test 2 (hamburger open/close) → Task 4
- ✅ Test 3 (navigate via menu) → Task 5
- ✅ Test 4 (cart overflow) → Task 2
- ✅ Test 5 (mobile buyer flow) → Task 6

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code blocks are complete.

**Type consistency:** No cross-task type dependencies — this is CSS/HTML/JS with no imported types.
