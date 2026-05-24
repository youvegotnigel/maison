# Mobile Responsive Design — Maison

**Date:** 2026-05-24
**Approach:** A — Targeted CSS fixes + JS hamburger menu + mobile Playwright tests

## Overview

Maison is a luxury e-commerce AUT (Automation Under Test) for Playwright. The app has partial mobile CSS but several broken layouts and no mobile test coverage. This spec adds full mobile responsiveness and a dedicated mobile Playwright test block without breaking the existing test suite.

## Files Changed

| File | Change |
|------|--------|
| `web/dist/styles.css` | CSS fixes for toolbar, cart-line, nav; hamburger styles |
| `web/dist/src/app.js` | Hamburger toggle button + JS open/close logic in `renderHeader()` |
| `tests/maison.spec.js` | New `Mobile · responsive layout` describe block |

## Section 1: CSS Fixes

### Toolbar overflow
- Remove `min-width: 260px` from `.toolbar input[type="search"]`
- Replace with `width: 100%; flex: 1 1 200px` so it shrinks below 375px without forcing horizontal scroll

### Cart line layout (≤560px)
- Replace 5-column grid (`80px 1fr auto auto auto`) with a 2-row `grid-template-areas` layout:
  - Row 1: thumbnail + product name/price
  - Row 2: qty controls + remove button
- Thumbnail: `60px × 60px`

### Nav overflow guard (≤480px)
- Hide all `nav a` links and cart pill with `display: none`
- Show hamburger toggle button instead
- Nav becomes a full-width slide-down panel when open

## Section 2: Hamburger Menu

### HTML (injected by `renderHeader()` in `app.js`)

```html
<button class="nav-toggle"
        data-testid="nav-toggle"
        aria-expanded="false"
        aria-label="Open navigation">
  <span></span><span></span><span></span>
</button>
<nav class="nav" data-testid="nav-mobile-menu" aria-label="Primary">
  <!-- existing nav links -->
</nav>
```

### JS behaviour
- Click `nav-toggle` → toggle `.nav--open` on `<nav>`, flip `aria-expanded`
- Click any link inside the nav → close menu
- Click outside the nav/toggle → close menu
- Press `Escape` → close menu

### CSS (added to `styles.css`)

```css
/* toggle button — hidden on desktop */
.nav-toggle { display: none; ... }

@media (max-width: 480px) {
  .nav-toggle { display: flex; flex-direction: column; gap: 5px; ... }
  .nav { max-height: 0; overflow: hidden; transition: max-height 0.3s ease;
         flex-direction: column; width: 100%; position: absolute; top: 76px;
         left: 0; right: 0; background: rgba(16,15,13,0.96); padding: 0; }
  .nav--open { max-height: 400px; padding: 16px 0; }
  .nav a { padding: 16px 28px; width: 100%; font-size: 0.9rem; }
  /* hide inline links + cart pill + user name at mobile */
  .masthead .nav a, .masthead .nav .cart-pill, .masthead .nav .tiny { display: none; }
  .nav--open a, .nav--open .cart-pill, .nav--open .tiny { display: flex; }
}
```

The toggle button uses three `<span>` children styled as horizontal bars (no SVG needed).

## Section 3: Mobile Playwright Tests

**Location:** New `test.describe` block at the bottom of `tests/maison.spec.js`

**Viewport:** `test.use({ viewport: { width: 375, height: 812 } })` — iPhone 13 dimensions, scoped to this describe block only. No changes to `playwright.config.js` or existing test projects.

### Tests

| # | Name | What it verifies |
|---|------|-----------------|
| 1 | Hamburger opens and closes nav | `nav-toggle` visible; click opens menu; links are visible; second click closes it |
| 2 | Navigation via mobile menu | Opens hamburger, clicks Shop link, menu closes, correct view renders |
| 3 | Buyer purchase flow on mobile | Full e2e (sign in → search → add to cart → checkout) at 375px |
| 4 | Cart page layout doesn't overflow | `document.body.scrollWidth <= 375` with item in cart |
| 5 | No horizontal overflow on shop page | `document.body.scrollWidth <= 375` on main shop page |

Tests 4 and 5 use `page.evaluate(() => document.body.scrollWidth)` to detect layout overflow in CI without screenshot comparison.

## Accessibility

- Hamburger button uses `aria-expanded` and `aria-label` — screen-reader friendly
- All nav links remain in the DOM (just hidden via CSS) — no content removed
- Tap targets inside open menu: `padding: 16px` minimum — meets 44px touch target guideline
- `data-testid="nav-toggle"` and `data-testid="nav-mobile-menu"` for Playwright reliability

## What Is NOT Changed

- `playwright.config.js` — existing `Desktop Chrome` project untouched
- Existing test describe blocks — no modifications
- Server code — no changes
- Overall visual design language — dark luxury aesthetic preserved at all sizes
