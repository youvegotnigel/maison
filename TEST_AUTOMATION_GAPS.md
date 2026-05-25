# Test Automation Gaps — UI Components

Analysis of missing or incomplete UI components from a test automation perspective.
Each item notes whether it can be delivered as an **enhancement to an existing feature** or requires a **new feature**, and what test coverage it unlocks.

---

## How to read this list

| Column | Meaning |
|--------|---------|
| **Priority** | High / Medium / Low — based on how much test coverage is blocked without it |
| **Type** | Enhancement (existing page/feature) or New Feature (new route, API, or component) |
| **Testid needed** | Suggested `data-testid` attributes for the new elements |
| **Status** | `[ ]` = not started, `[x]` = done |

---

## High Priority

### 1. Inline (field-level) form validation errors
- [ ] **Priority:** High
- **Type:** Enhancement — Login form, Registration form, Checkout form
- **Problem:** Both login and registration expose only one form-level error message (`login-error`, `register-error`, `checkout-error`). There is no way to assert *which specific field* failed without parsing human-readable text strings.
- **What to add:** Per-field error `<span>` elements rendered beneath each input when validation fails.
- **Testids needed:** `field-error-email`, `field-error-password`, `field-error-confirm-password`, `field-error-first-name`, `field-error-last-name`, `field-error-phone`, `field-error-ship-name`, `field-error-ship-address`, `field-error-ship-city`, `field-error-ship-postal`, `field-error-card-number`
- **Test coverage unlocked:** "email already taken" vs "invalid email format"; password mismatch vs too short; checkout field-by-field required checks.

---

### 2. Skip link (accessibility — referenced in tests but not implemented)
- [ ] **Priority:** High
- **Type:** Enhancement — `index.html` / layout shell
- **Problem:** `a11y.spec.ts` asserts `page.getByTestId('skip-link')` exists but no skip link is rendered in `app.ts` or the HTML shell. The test will fail against a clean build.
- **What to add:** A visually-hidden `<a href="#main-content" data-testid="skip-link">Skip to main content</a>` as the first focusable element in `<body>`, and a matching `id="main-content"` on `<main>`.
- **Testids needed:** `skip-link`
- **Test coverage unlocked:** Keyboard-only navigation flow; WCAG 2.4.1 bypass block criterion.

---

### 3. Confirmation dialog for destructive actions
- [ ] **Priority:** High
- **Type:** Enhancement — Cart page, Seller dashboard
- **Problem:** "Clear cart" and "Remove item" execute immediately with no confirmation step. There is no way to test a cancel-destructive-action path, and a mis-click in production loses the entire cart.
- **What to add:** A reusable confirm dialog (reuse the existing `modal` infrastructure) triggered before `clear-cart` and `remove-item`. The dialog needs its own testids.
- **Testids needed:** `confirm-dialog`, `confirm-action`, `confirm-cancel`, `confirm-message`
- **Test coverage unlocked:** "user removes item then cancels"; "user clears cart then cancels"; modal keyboard trap / Escape-to-close.

---

### 4. Toast / notification dismiss button
- [ ] **Priority:** High
- **Type:** Enhancement — Flash message component (`flash-success`, `flash-error`)
- **Problem:** Flash messages appear but have no dismiss control. Tests cannot assert that a user dismissed a notification, and there is no way to test stacked or queued notifications.
- **What to add:** A `×` button inside each flash message; a `data-testid="flash-dismiss"` attribute; auto-dismiss after N seconds with a `data-testid="flash-timer"` progress bar (optional).
- **Testids needed:** `flash-dismiss`, `flash-message` (the text content node)
- **Test coverage unlocked:** "success toast appears and can be dismissed"; "error toast persists until dismissed"; toast queue ordering.

---

### 5. Cart item quantity controls
- [ ] **Priority:** High
- **Type:** Enhancement — Cart page (`/#/cart`)
- **Problem:** Quantity can only be set on the Product Detail Page before adding to cart. Once an item is in the cart, there is no way to adjust quantity — only remove entirely. This is a common user action with no test path.
- **What to add:** `+` / `−` controls on each `cart-line`, reusing the existing qty-control pattern from PDP.
- **Testids needed:** `line-qty-decr`, `line-qty-incr`, `line-qty-input` (scoped per `cart-line`)
- **Test coverage unlocked:** "increase qty in cart updates subtotal"; "decrease to 0 removes item"; stock limit enforcement in cart.

---

## Medium Priority

### 6. Active filter / search state chips
- [ ] **Priority:** Medium
- **Type:** Enhancement — Catalogue toolbar (`catalogue-toolbar`)
- **Problem:** When a user filters by category or searches, there is no visual indicator of the active filter state. The only way to assert the current filter is to read the `<select>` or `<input>` value directly. Tests cannot verify "user clears filter X" as a distinct action.
- **What to add:** A chip/pill strip below the toolbar showing active search term and active category, each with a remove `×` button.
- **Testids needed:** `active-filters`, `active-filter-search`, `active-filter-category`, `clear-filter-search`, `clear-filter-category`, `clear-all-filters`
- **Test coverage unlocked:** Filter badge count; "remove single filter preserves other"; "clear all resets catalogue to default".

---

### 7. Low-stock indicator on product card and PDP
- [ ] **Priority:** Medium
- **Type:** Enhancement — Product card (`product-card`), Product Detail Page
- **Problem:** Stock levels are tracked in the database but there is no UI element that communicates urgency (e.g., "Only 2 left!"). Tests cannot verify urgency copy or threshold logic.
- **What to add:** A conditional `<span data-testid="low-stock">Only N left</span>` rendered when stock ≤ some threshold (e.g., 5).
- **Testids needed:** `low-stock` (on both product card and PDP)
- **Test coverage unlocked:** "low-stock badge appears at threshold"; "badge disappears after restock"; buyer purchase reduces stock and triggers badge.

---

### 8. Checkout step progress indicator
- [ ] **Priority:** Medium
- **Type:** Enhancement — Checkout flow (Cart → Checkout → Confirmation)
- **Problem:** The three-step purchase flow has no visual stepper or breadcrumb. Tests cannot assert which step the user is currently on without relying on URL or page-specific content.
- **What to add:** A horizontal step indicator at the top of cart, checkout, and confirmation pages showing: Cart → Checkout → Confirmation, with the active step marked.
- **Testids needed:** `checkout-steps`, `step-cart`, `step-checkout`, `step-confirmation`, `step-active` (applied to the current step)
- **Test coverage unlocked:** "active step updates on navigation"; "back navigation returns to previous step"; accessibility: `aria-current="step"`.

---

### 9. Password strength meter
- [ ] **Priority:** Medium
- **Type:** Enhancement — Registration form
- **Problem:** Password validation rules are enforced on submit but there is no real-time feedback during typing. Tests cannot assert intermediate strength states or verify the meter reacts to input changes.
- **What to add:** A strength bar beneath `register-password` that updates on `input` events with discrete states (weak / fair / strong).
- **Testids needed:** `password-strength`, `password-strength-label` (text description), `password-strength-value` (aria value for screen readers)
- **Test coverage unlocked:** "weak password shows red bar"; "strong password enables submit"; ARIA `aria-valuenow` assertions.

---

### 10. Order detail page
- [ ] **Priority:** Medium
- **Type:** New Feature — Route `/#/orders/:reference`
- **Problem:** The orders list (`orders-list`) shows order rows but clicking an `order-row` goes nowhere. The API already has `GET /orders/:reference`. There is no UI to surface per-order details: line items, totals, shipping address.
- **What to add:** A detail view rendered at `/#/orders/:reference` using the existing API endpoint.
- **Testids needed:** `order-detail`, `order-detail-reference`, `order-detail-status`, `order-detail-lines`, `order-detail-line`, `order-detail-total`, `order-detail-shipping`, `back-to-orders`
- **Test coverage unlocked:** "click order row navigates to detail"; "detail shows correct line items"; "detail total matches orders list total".

---

### 11. 404 / error boundary page
- [ ] **Priority:** Medium
- **Type:** New Feature — SPA route fallback
- **Problem:** Navigating to an unknown hash route (e.g., `/#/does-not-exist`) renders a blank `<main>` with no content and no testable state. Tests cannot assert graceful degradation.
- **What to add:** A fallback render path in the router that displays a "Page not found" view when no route matches.
- **Testids needed:** `not-found`, `not-found-message`, `not-found-home-link`
- **Test coverage unlocked:** "unknown route shows 404 view"; "404 view has link back to shop"; "back button from 404 works".

---

### 12. Seller: delete product
- [ ] **Priority:** Medium
- **Type:** New Feature — Seller dashboard + API
- **Problem:** Sellers can create, edit price, edit stock, and set discounts on products but cannot delete a listing. The seller dashboard is missing a standard CRUD operation, and there is no test path for it.
- **What to add:** A delete button per `listing-row` that triggers a `confirm-dialog` (see item 3) before calling a new `DELETE /products/:id` endpoint.
- **Testids needed:** `delete-listing` (per row), reuses `confirm-dialog` testids from item 3
- **Test coverage unlocked:** "seller deletes product; it disappears from catalogue"; "buyer cannot see deleted product"; confirm dialog cancel leaves listing intact.

---

## Low Priority

### 13. Image loading placeholder / skeleton
- [ ] **Priority:** Low
- **Type:** Enhancement — Product card and PDP image
- **Problem:** Product images load without any intermediate state. In slow-network tests or CI environments, images may be absent when assertions run. There is no testable loading state.
- **What to add:** A skeleton `<div>` or `aria-busy` state on the image container until the image loads or errors.
- **Testids needed:** `product-image-placeholder`, `product-image-error`
- **Test coverage unlocked:** "image placeholder shown before load"; "broken image shows fallback"; visual regression baseline.

---

### 14. Catalogue pagination
- [ ] **Priority:** Low
- **Type:** New Feature — Catalogue + API (`GET /products`)
- **Problem:** All products are returned in a single response. Tests cannot cover large dataset navigation, page boundary edge cases, or items-per-page configuration. The API has no `limit`/`offset` support today.
- **What to add:** Server-side pagination on `GET /products` with `page` and `pageSize` query params; a pagination control strip in the catalogue UI.
- **Testids needed:** `pagination`, `pagination-prev`, `pagination-next`, `pagination-page` (per page button), `pagination-current`, `pagination-total`
- **Test coverage unlocked:** "next page loads different products"; "prev disabled on first page"; "next disabled on last page"; page query param reflected in URL.

---

### 15. Session expiry warning
- [ ] **Priority:** Low
- **Type:** New Feature — Auth / session management
- **Problem:** JWT tokens expire silently. The user is shown an error only after the next API call fails. There is no proactive warning or countdown, and no test path for "user re-authenticates before expiry".
- **What to add:** A banner or modal shown N minutes before the JWT expiry timestamp, with "Stay logged in" and "Log out" actions.
- **Testids needed:** `session-warning`, `session-warning-extend`, `session-warning-logout`, `session-warning-timer`
- **Test coverage unlocked:** "warning banner appears before expiry"; "extend refreshes token"; "logout from warning clears session".

---

### 16. User profile / account settings page
- [ ] **Priority:** Low
- **Type:** New Feature — Route `/#/account`
- **Problem:** Logged-in users have no way to view or update their own profile (name, email, phone, password). There is no test path for account self-service.
- **What to add:** A profile page accessible from the nav, backed by a new `GET /auth/me` display and `PATCH /auth/me` update endpoint.
- **Testids needed:** `account-form`, `account-first-name`, `account-last-name`, `account-email`, `account-phone`, `account-save`, `account-success`, `account-error`, `change-password-link`
- **Test coverage unlocked:** "user updates name; header reflects change"; "invalid email rejected"; "password change requires current password".

---

---

## Missing `data-testid` on Existing Elements

These are quick-fix gaps — existing elements that already render but lack a `data-testid`. Each requires a one-line change in `web/src/app.ts`.

---

### 17. Cart empty state — "Browse the shop" link
- [ ] **Priority:** High
- **Type:** Enhancement — Cart page (`pageCart`)
- **Problem:** The CTA link shown when the cart is empty has no testid. Tests cannot assert the empty-state action or click through to the shop.
- **Element:** `<a class="btn btn--ghost btn--sm" href="#/">Browse the shop</a>` (~line 675)
- **Testid needed:** `data-testid="browse-shop"`

---

### 18. Confirmation page — "Continue Shopping" link
- [ ] **Priority:** High
- **Type:** Enhancement — Confirmation page (`pageConfirmation`)
- **Problem:** The secondary CTA on the order confirmation screen has no testid. Tests cannot assert post-purchase flow navigation.
- **Element:** `<a class="btn btn--sm" href="#/">Continue Shopping</a>` (~line 777)
- **Testid needed:** `data-testid="continue-shopping"`

---

### 19. Product card — media/image link
- [ ] **Priority:** Medium
- **Type:** Enhancement — Product card (`productCard`)
- **Problem:** The clickable image wrapper on each product card has no testid. Tests can click via the card or product-name testids but cannot explicitly target the image link as a distinct action.
- **Element:** `<a href="#/product/${p.id}" class="card__media">` (~line 208)
- **Testid needed:** `data-testid="product-card-link"` (or scoped as `card__media-link`)

---

### 20. Orders list — order reference text
- [ ] **Priority:** Medium
- **Type:** Enhancement — Orders page (`pageOrders`)
- **Problem:** The reference string inside each `order-row` is wrapped in a `<strong>` with no testid. To assert the reference value, tests must use brittle structural selectors like `[data-testid="order-row"] strong`.
- **Element:** `<strong>${esc(o.reference)}</strong>` (~line 793)
- **Testid needed:** `data-testid="order-reference-text"`

---

### 21. Orders list — order status
- [ ] **Priority:** Medium
- **Type:** Enhancement — Orders page (`pageOrders`)
- **Problem:** Each `order-row` contains two `<span class="tiny">` elements. The status and the date/item-count span are indistinguishable by testid. Asserting order status requires fragile nth-child selectors.
- **Element:** `<span class="tiny" style="color:var(--gold)">${esc(o.status)}</span>` (~line 795)
- **Testid needed:** `data-testid="order-status"`

---

### 22. Orders list — order total per row
- [ ] **Priority:** Medium
- **Type:** Enhancement — Orders page (`pageOrders`)
- **Problem:** The total amount in each order row uses `<span class="price-now">` with no testid, making it impossible to assert a specific row's total without anchoring off the row's `data-reference` attribute.
- **Element:** `<span class="price-now">${money(o.totalCents)}</span>` (~line 796)
- **Testid needed:** `data-testid="order-total"`

---

### 23. Checkout summary — individual line items
- [ ] **Priority:** Medium
- **Type:** Enhancement — Checkout page (`pageCheckout`)
- **Problem:** The order summary sidebar in checkout renders each line as an unidentified `<div class="spread">`. Tests cannot assert that a specific product appears in the checkout summary.
- **Element:** Each `<div class="spread">` row inside `[data-testid="checkout-summary"]` (~line 730)
- **Testids needed:** `data-testid="checkout-line"` on each row; `data-testid="checkout-line-name"` and `data-testid="checkout-line-total"` on the inner spans

---

### 24. Confirmation page — individual order item rows
- [ ] **Priority:** Medium
- **Type:** Enhancement — Confirmation page (`pageConfirmation`)
- **Problem:** The order breakdown on the confirmation screen has no testids on individual item rows or their values. Tests cannot assert that a specific item appears on the confirmation.
- **Element:** Each `<div class="spread">` inside the `cart-summary` block (~line 773)
- **Testids needed:** `data-testid="confirmation-line"` on each row; `data-testid="confirmation-line-name"` and `data-testid="confirmation-line-total"` on the inner spans

---

### 25. Product detail — seller name
- [ ] **Priority:** Low
- **Type:** Enhancement — Product Detail Page (`pageProduct`)
- **Problem:** The "Sold by" paragraph has no testid. Tests cannot assert which seller a product belongs to, or verify that the seller name changes after a product update.
- **Element:** `<p class="tiny">Sold by ${esc(p.sellerName || 'Maison')}</p>` (~line 297)
- **Testid needed:** `data-testid="detail-seller"`

---

### 26. DOB picker — displayed date text
- [ ] **Priority:** Low
- **Type:** Enhancement — Registration form DOB picker (`buildDobPicker`)
- **Problem:** The span that shows the selected date uses a non-standard `data-dob-display-text` attribute instead of `data-testid`. Playwright's `getByTestId` will not find it; tests must use a custom selector.
- **Element:** `<span data-dob-display-text>Select date of birth</span>` (~line 364)
- **Testid needed:** `data-testid="dob-display-text"` (replace or add alongside `data-dob-display-text`)

---

### 27. Seller modals — modal type identifier
- [ ] **Priority:** Low
- **Type:** Enhancement — Seller dashboard modals (`openPriceModal`, `openStockModal`, `openDiscountModal`)
- **Problem:** All three seller modals share `data-testid="modal"` on the backdrop. Once a modal is open, tests cannot assert *which* modal is showing without reading the `<h3>` text. The inner `<div class="modal">` container also lacks a testid.
- **Elements:** `<div class="modal" role="dialog">` inside `showModal` (~line 878); modal `<h3>` titles in each of the three open* functions
- **Testids needed:** `data-testid="modal-price"`, `data-testid="modal-stock"`, `data-testid="modal-discount"` (on the inner `<div class="modal">`); `data-testid="modal-title"` on each `<h3>`

---

## Summary Table

| # | Component | Type | Priority | Status |
|---|-----------|------|----------|--------|
| 1 | Inline field-level validation errors | Enhancement | High | [ ] |
| 2 | Skip link | Enhancement | High | [ ] |
| 3 | Confirmation dialog (destructive actions) | Enhancement | High | [ ] |
| 4 | Toast dismiss button | Enhancement | High | [ ] |
| 5 | Cart item quantity controls | Enhancement | High | [ ] |
| 6 | Active filter / search chips | Enhancement | Medium | [ ] |
| 7 | Low-stock indicator | Enhancement | Medium | [ ] |
| 8 | Checkout step progress indicator | Enhancement | Medium | [ ] |
| 9 | Password strength meter | Enhancement | Medium | [ ] |
| 10 | Order detail page | New Feature | Medium | [ ] |
| 11 | 404 / error boundary page | New Feature | Medium | [ ] |
| 12 | Seller: delete product | New Feature | Medium | [ ] |
| 13 | Image loading placeholder | Enhancement | Low | [ ] |
| 14 | Catalogue pagination | New Feature | Low | [ ] |
| 15 | Session expiry warning | New Feature | Low | [ ] |
| 16 | User profile / account settings | New Feature | Low | [ ] |
| 17 | Cart empty state — "Browse the shop" link | Missing testid | High | [ ] |
| 18 | Confirmation — "Continue Shopping" link | Missing testid | High | [ ] |
| 19 | Product card — media/image link | Missing testid | Medium | [ ] |
| 20 | Orders list — order reference text | Missing testid | Medium | [ ] |
| 21 | Orders list — order status | Missing testid | Medium | [ ] |
| 22 | Orders list — order total per row | Missing testid | Medium | [ ] |
| 23 | Checkout summary — line items | Missing testid | Medium | [ ] |
| 24 | Confirmation — order item rows | Missing testid | Medium | [ ] |
| 25 | Product detail — seller name | Missing testid | Low | [ ] |
| 26 | DOB picker — displayed date text | Missing testid | Low | [ ] |
| 27 | Seller modals — modal type identifier | Missing testid | Low | [ ] |

---

*Generated 2026-05-25 against commit `7767d7b` (master).*
