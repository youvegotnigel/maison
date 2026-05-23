# Maison - Luxury E-Commerce Demo

A two sided luxury marketplace built as an **Application Under Test (AUT)** for a Playwright
automation framework. It deliberately exercises four testing pillars: **UI, API, Accessibility,
and Security.**

Everything runs locally in a **single Node process.** The Express server hosts both the JSON
API and the static frontend on one port. No external database, no build step, no internet
dependency (product imagery is generated inline as SVG data-URIs).

---

## Quick start

```bash
cd maison
npm install          # installs the server dependencies
npm start            # serves app + API at http://localhost:4000
```

Open **http://localhost:4000**.

Requirements: **Node.js 22.5+** (uses the built-in `node:sqlite` module — no native build).

### Demo accounts (password `Password123!`)

| Email                 | Role   |
|-----------------------|--------|
| `buyer@maison.test`   | buyer  |
| `seller@maison.test`  | seller |
| `seller2@maison.test` | seller |

---

## Why it's automation-friendly

This app was built test-first. Concretely:

- **Stable `data-testid` hooks** on every interactive element and meaningful piece of state.
  Selectors never depend on text, CSS classes, or DOM position.
- **Deterministic seed data** — the same 8 products, 3 users, and 2 discounts on every boot.
  Tests can assert exact values (e.g. the Noir Tote is always `$2,422.50` after its 15% discount).
- **`POST /api/v1/_reset`** — rebuilds the seed state instantly for per-test isolation. Call it in
  a `beforeEach`. (In-memory SQLite, so it's fast.)
- **`GET /api/v1/seed-info`** — documents the demo accounts programmatically.
- **Consistent error envelope** — every failure returns `{ error: { code, message } }` with a
  stable machine-readable `code`, so negative-path assertions don't rely on message strings.
- **Readiness signal** — `document.body[data-app-ready="true"]` is set once the SPA has booted,
  so tests can wait deterministically instead of sleeping.
- **State introspection** — `window.__MAISON__` mirrors the current user and cart for debugging.
- **Server-side everything** — pricing, stock, and authorization are all enforced by the API,
  never trusted from the client. This makes the security tests meaningful.

---

## Architecture

```
Browser SPA  ──fetch──▶  Express API  ──▶  SQLite (in-memory)
(vanilla JS,             (/api/v1/*)        seeded on boot
 hash-routed)            + static host
```

```
maison/
├── package.json            # root: `npm start`, `npm run test:smoke`
├── verify.mjs              # standalone integration check (no Playwright needed)
├── server/
│   └── src/
│       ├── index.js        # server: security headers, CORS, rate-limit, routing, static host
│       ├── db.js           # schema + deterministic seed + image generator
│       ├── pricing.js      # discount math + product serialization (single source of truth)
│       ├── auth.js         # JWT signing, authenticate / requireAuth / requireRole
│       └── routes/
│           ├── auth.js     # register, login, logout, me
│           ├── products.js # catalogue, search, seller CRUD, images, discounts
│           └── cart.js     # cart + transactional checkout / orders
├── web/
│   └── dist/               # served as-is (no build step)
│       ├── index.html
│       ├── styles.css      # luxury design system
│       └── src/{app.js, api.js}   # SPA + API client
└── tests/
    └── maison.spec.js      # sample Playwright tests (UI/API/Security/A11y)
```

---

## API reference (`/api/v1`)

| Method & Path                      | Role   | Purpose                                  |
|------------------------------------|--------|------------------------------------------|
| `GET  /health`                     | Public | Liveness check                           |
| `GET  /seed-info`                  | Public | Demo accounts                            |
| `POST /_reset`                     | Public | Rebuild seed data (test isolation)       |
| `POST /auth/register`              | Public | Create account (`role: buyer\|seller`)   |
| `POST /auth/login`                 | Public | Authenticate, issue JWT cookie           |
| `POST /auth/logout`                | Any    | Clear session                            |
| `GET  /auth/me`                    | Auth   | Current user                             |
| `GET  /products`                   | Public | Catalogue (`q, category, sort, minPrice, maxPrice`) |
| `GET  /products/:id`               | Public | Single product                           |
| `GET  /products/categories`        | Public | Distinct categories                      |
| `GET  /products/seller/mine`       | Seller | The caller's own listings                |
| `POST /products`                   | Seller | Create a listing                         |
| `PATCH /products/:id`              | Seller | Update own product (price/stock/details) |
| `POST /products/:id/images`        | Seller | Add an image to an owned product         |
| `PUT  /products/:id/discount`      | Seller | Set a discount (`percentage`\|`fixed`)   |
| `DELETE /products/:id/discount`    | Seller | Remove a discount                        |
| `GET  /cart`                       | Buyer  | Read cart                                |
| `POST /cart/items`                 | Buyer  | Add/update line item                     |
| `DELETE /cart/items/:itemId`       | Buyer  | Remove a line item                       |
| `DELETE /cart`                     | Buyer  | Empty the cart                           |
| `POST /orders`                     | Buyer  | Checkout (transactional, decrements stock)|
| `GET  /orders`                     | Buyer  | Order history                            |
| `GET  /orders/:reference`          | Buyer  | Single order                             |

**Error codes** include: `INVALID_EMAIL`, `WEAK_PASSWORD`, `INVALID_ROLE`, `EMAIL_TAKEN`,
`INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN_ROLE`, `NOT_OWNER`, `PRODUCT_NOT_FOUND`,
`OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `INVALID_PRICE`, `INVALID_DISCOUNT_VALUE`, `EMPTY_CART`.

Prices are integer **cents** everywhere to avoid floating-point drift.

---

## Running the sample tests

```bash
npm start                                  # terminal 1
# terminal 2:
npm i -D @playwright/test @axe-core/playwright
npx playwright install
npx playwright test tests/maison.spec.js
```

The sample suite covers a buyer purchase journey, seller listing management, API contract checks,
the RBAC/IDOR security boundaries, and an accessibility scaffold (uncomment the `AxeBuilder` block
once `@axe-core/playwright` is installed).

### No-Playwright sanity check

```bash
npm run test:smoke      # spins up the server, runs ~30 API/static/security assertions, exits
```

---

## Security notes (demo-appropriate)

- Passwords hashed with bcrypt; JWT in an `httpOnly`, `SameSite=Lax` cookie.
- Role checked server-side on every protected route; ownership checked on every seller write
  (the IDOR boundary).
- Security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`.
- Rate limiting on auth endpoints. Input validated and sanitised server-side.
- Payment is **mocked** — no real funds, no card storage. `_reset` is open by default for testing;
  set `MAISON_ALLOW_RESET=false` to disable.

## Configuration (env vars)

| Variable               | Default                | Purpose                          |
|------------------------|------------------------|----------------------------------|
| `PORT`                 | `4000`                 | Server port                      |
| `MAISON_JWT_SECRET`    | dev default            | JWT signing secret               |
| `MAISON_DB_FILE`       | `:memory:`             | Set a path to persist the DB     |
| `MAISON_ALLOW_RESET`   | enabled                | Set to `false` to disable `_reset` |
