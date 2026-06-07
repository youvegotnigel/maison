# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Maison** is a luxury e-commerce demo application built as an **Application Under Test (AUT)** for Playwright automation testing. It exercises five testing pillars: UI, Mobile, API, Accessibility, and Security.

The entire application runs in a **single Node process**—Express server hosting both a JSON API and a vanilla JavaScript SPA frontend on port 4000. No external database (uses in-memory SQLite by default), no build step for the SPA, and no internet dependency.

## Quick Start

```bash
npm install          # installs root + server dependencies
npm start            # builds server TypeScript, starts app on http://localhost:4000
```

Requirements: **Node.js 24.0+** (uses `node:sqlite` built-in module).

### Docker

```bash
# Pull and run published image
docker run --rm -p 4000:4000 youvegotnigel/maison:latest

# Or build locally
docker build -t maison:latest .
docker run --rm -p 4000:4000 maison:latest
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Build server TypeScript and start the app |
| `npm run build:server` | Compile TypeScript server only |
| `npm run build:web` | Compile TypeScript web frontend only |
| `npm run build` | Compile both server and web |
| `npm run lint` | Run ESLint on all code |
| `npm run typecheck` | Type-check server and test files |
| `npm test` | Run all five Playwright test suites (requires app running) |
| `npm run test:ui` | UI end-to-end tests only |
| `npm run test:mobile` | Mobile responsive layout tests only |
| `npm run test:api` | API contract and catalogue tests only |
| `npm run test:security` | RBAC, IDOR, auth header tests only |
| `npm run test:a11y` | Accessibility (WCAG landmarks) tests only |
| `npm run test:smoke` | Quick ~30 API assertions (no Playwright, no browser) |

### Running Tests Locally

**Terminal 1: Start the app**
```bash
npm start
```

**Terminal 2: Run tests**
```bash
npm test                      # all suites
npm run test:ui               # UI only
npm run test:mobile           # mobile only
npx playwright test tests/ui.spec.ts --grep "buyer can search" # single test pattern
npx playwright test --ui      # interactive Playwright test picker
```

### TypeScript Development

- **Server**: strict TypeScript with ES2022 target, CommonJS modules compiled to `/server/dist`
- **Web**: ES2022 with DOM libs, outputs to `/web/dist/src`
- Watch mode: `cd server && npm run dev` (auto-recompiles on file changes)

**Config files**:
- `/server/tsconfig.json` — server-specific config
- `/web/tsconfig.json` — web frontend config
- `/tsconfig.json` — root config for tests and `verify.ts`

## Architecture

### High-Level Flow

```
Browser (Vanilla JS SPA) ──fetch──> Express API ──> SQLite (in-memory, seeded)
                         (/api/v1/*)               at boot
         + static host
```

### Directory Structure

```
maison/
├── server/src/
│   ├── index.ts           # Express app: security headers, CORS, rate-limit,
│   │                        API routing, static host setup
│   ├── db.ts              # SQLite schema, seed data (22 products, 3 users,
│   │                        2 discounts), image + certificate generators
│   ├── auth.ts            # JWT creation, authentication middleware, RBAC
│   ├── pricing.ts         # Discount math, product serialization, effective
│   │                        price calculation (single source of truth)
│   └── routes/
│       ├── auth.ts        # POST /auth/register, /login, /logout; GET /me
│       ├── products.ts    # GET /products, CRUD for sellers, discounts,
│       │                    images, certificates
│       └── cart.ts        # GET /cart, POST /items, DELETE /items/:id,
│                            transactional checkout, order history
├── web/src/
│   ├── app.ts             # SPA router (hash-based), state management,
│   │                        view rendering for all pages
│   └── api.ts             # Thin fetch wrapper, ApiError class, API client
│                            (imported as `api` in tests & app)
├── web/dist/
│   ├── index.html         # Entry point (SPA mounts to #app)
│   ├── styles.css         # Luxury design system (Cormorant + Jost fonts)
│   └── src/{app.js, api.js}  # Compiled JavaScript (no bundler)
├── tests/
│   ├── ui.spec.ts         # Buyer purchase, seller listings
│   ├── mobile.spec.ts     # Responsive layout, hamburger nav
│   ├── api.spec.ts        # Catalogue, search, transactional checkout
│   ├── security.spec.ts   # RBAC boundaries, IDOR checks, auth headers
│   └── a11y.spec.ts       # WCAG landmark checks (axe-core scaffold)
└── verify.ts              # Standalone smoke test (~30 API/security checks,
                             spawns server, no Playwright required)
```

## Key Architectural Patterns

### 1. Pricing & Product Serialization

**Single source of truth**: `/server/src/pricing.ts`

All product JSON responses go through `serializeProduct()`, which:
- Looks up active discounts
- Calculates `effectiveCents` (discounted price)
- Sets `onSale` boolean
- Includes seller name, images, certificate availability

This ensures consistent pricing across all API endpoints.

### 2. Authentication & Authorization

- **JWT tokens** signed in `auth.ts`, stored in `httpOnly` cookies (`maison_token`)
- **Middleware**:
  - `authenticate` — reads token from header or cookie, attaches to `req.user` (optional)
  - `requireAuth` — blocks unauthenticated requests
  - `requireRole(role)` — blocks requests from wrong role
- **Roles**: `buyer` or `seller`
- **Error handling**: all failures return `{ error: { code, message } }` with stable machine-readable `code`

### 3. Database & Seeding

**In-memory SQLite by default** (`node:sqlite` built-in module):
- `MAISON_DB_FILE` env var to persist to disk
- Deterministic seed data on every boot (same 22 products, 3 users, 2 discounts)
- `POST /api/v1/_reset` rebuilds seed instantly (for test isolation)
- Foreign keys & WAL mode enabled

Tables: `users`, `products`, `product_images`, `discounts`, `carts`, `cart_items`, `orders`, `order_items`, `certificates`

### 4. Frontend: Vanilla JS SPA with Hash Routing

`/web/src/app.ts`:
- No build step, no framework, no bundler
- Hash-routed (`#/products`, `#/seller`, `#/buyer`, etc.)
- Global state object: `window.__MAISON__` mirrors user, cart, categories
- `document.body[data-app-ready="true"]` set after mount (test readiness signal)

### 5. Testing First Design

Built-in test hooks:
- **`data-testid` attributes** on every interactive element (never rely on text, CSS, position)
- **Deterministic seed data** — exact product prices, user emails
- **Reset endpoint** — `POST /api/v1/_reset` for per-test isolation
- **Seed info endpoint** — `GET /api/v1/seed-info` documents demo accounts
- **State introspection** — `window.__MAISON__` for debugging
- **Server-side enforcement** — pricing, stock, auth all API-enforced, never client-trusted

## Demo Accounts

All share password `Password123!`:

| Email | Role | Date of Birth |
|-------|------|---------------|
| `buyer@maison.test` | buyer | 1990-06-10 |
| `seller@maison.test` | seller | 1980-03-15 |
| `seller2@maison.test` | seller | 1975-09-22 |

Get from `GET /api/v1/seed-info` programmatically.

## API Overview

All responses wrapped in `{ ... }` object. Errors: `{ error: { code, message } }`.

### Public Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/health` | Liveness check |
| `GET` | `/api/v1/seed-info` | Demo accounts |
| `POST` | `/api/v1/_reset` | Rebuild seed (test-only, gated by `MAISON_ALLOW_RESET` env) |
| `POST` | `/auth/register` | Create account (`role`, `dateOfBirth: YYYY-MM-DD` required, age ≥ 18) |
| `POST` | `/auth/login` | Authenticate, set JWT cookie |
| `GET` | `/products` | Catalogue (`q`, `category`, `sort`, `minPrice`, `maxPrice` params) |
| `GET` | `/products/:id` | Single product details |
| `GET` | `/products/categories` | Distinct product categories |

### Authenticated Endpoints

**Buyer-only**:
- `GET /cart` — current cart
- `POST /cart/items` — add/update line item
- `DELETE /cart/items/:itemId` — remove item
- `DELETE /cart` — clear cart
- `POST /orders` — transactional checkout (decrements stock)
- `GET /orders` — order history
- `GET /orders/:reference` — single order

**Seller-only**:
- `GET /products/seller/mine` — user's listings
- `POST /products` — create listing
- `PATCH /products/:id` — update own product
- `POST /products/:id/images` — add image URL
- `PUT /products/:id/discount` — set discount (percentage or fixed)
- `DELETE /products/:id/discount` — remove discount
- `POST /products/:id/certificate` — issue certificate of authenticity

**Any authenticated**:
- `GET /auth/me` — current user (includes `dateOfBirth`)
- `POST /auth/logout` — clear session

## Configuration

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | Server port |
| `PORT_VULN` | `4001` | Vulnerable dev server port (branch `dev/vuln-scanner-target` only) |
| `MAISON_ORIGIN` | `http://localhost:4000` | CORS origin |
| `MAISON_JWT_SECRET` | `maison-demo-secret-do-not-use-in-prod` | JWT signing key |
| `MAISON_DB_FILE` | `:memory:` | SQLite path (`:memory:` = in-memory) |
| `MAISON_ALLOW_RESET` | enabled | Set to `false` to disable `/_reset` endpoint |

## CI/CD

**GitHub Actions** (`.github/workflows/`):
- **`playwright.yml`**: On push/PR to `master`, runs linting, type-check, then all 5 test suites in parallel
- **`docker-publish.yml`**: On push to `master` or tag `v*.*.*`, builds and pushes multi-arch Docker image (amd64 + arm64)

**Release process**:
```bash
git tag v1.5.0    # must match version in root package.json
git push origin v1.5.0
```
Publishes `1.5.0`, `1.5`, and `latest` tags on Docker Hub.

Also update the static Docker Hub badge at the top of `README.md` to match the new version:
`https://img.shields.io/badge/Docker%20Hub-v<version>-blue?logo=docker`
(The badge is static rather than dynamic to avoid Shields.io rate-limit errors from Docker Hub's API.)

## Security Notes (Demo-Appropriate)

- Passwords hashed with bcrypt
- JWT in `httpOnly`, `SameSite=Lax` cookie
- Role checked server-side on every protected route
- Ownership checked on every seller write (IDOR boundary)
- Security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- Rate limiting on auth endpoints (brute-force protection)
- Input validated and sanitized server-side
- Payment mocked (no real funds, no card storage)
- SQL queries parameterized (see `db.prepare(...).all(...params)` pattern)

### Vulnerable Dev Server

Branch `dev/vuln-scanner-target` ships a second entry point (`server/src/index.vuln.ts`) with intentional SQL injection on `POST /auth/login` for security scanner validation. Never use in production. Bind to `127.0.0.1:4001` only (env `PORT_VULN`).

## Common Tasks

### Add a New Product Field

1. Add column to `users` or `products` table in `/server/src/db.ts` (in `initSchema()`)
2. Add to TypeScript interface (`DbProduct`, `DbUser`)
3. If product-related: update `serializeProduct()` in `/server/src/pricing.ts`
4. Update API route handlers in `/server/src/routes/`
5. Update frontend type in `/web/src/app.ts` (e.g., `interface Product`)

### Add a New API Endpoint

1. Create route in `/server/src/routes/` (or add to existing file)
2. Import and mount in `/server/src/index.ts` under `const api = express.Router()`
3. Use `requireAuth()` or `requireRole(role)` for access control
4. Return structured errors via `fail(res, status, code, message)`
5. Add to API client in `/web/src/api.ts`
6. Write tests in `/tests/api.spec.ts`, `/tests/security.spec.ts` if auth-related

### Add a New Test

1. Create in `/tests/` (or add to existing `.spec.ts`)
2. Use Playwright test syntax: `test('description', async ({ page, request }) => { ... })`
3. All tests call `POST /api/v1/_reset` in `beforeEach` for isolation
4. Use `data-testid` selectors: `page.getByTestId('nav-login')`
5. Run: `npx playwright test tests/yourfile.spec.ts`

### Debug a Test

```bash
npm start                                    # terminal 1
npx playwright test tests/ui.spec.ts --debug # terminal 2, step through
# or
npx playwright test --ui                     # interactive test picker
```

Browser DevTools: `page.pause()` in test code pauses execution.

## Linting & Type Checking

- **ESLint**: `npm run lint` (rules in `eslint.config.js`)
  - Rules: no unused vars (error), no explicit `any` (warn), no require of CommonJS
  - Ignores: `/server/dist/**`, `/web/dist/**`, `node_modules/`
- **TypeScript**: `npm run typecheck` (strict mode on both server and web)

Both run in CI before tests. Fix before commit:
```bash
npm run lint -- --fix
npm run typecheck
```

## Package Structure

**Root** (`/package.json`):
- Entry: `npm start` (builds server, starts app)
- ESLint config applies to all code
- TypeScript config for tests + root verify.ts
- `postinstall` hook: installs server dependencies

**Server** (`/server/package.json`):
- Dependencies: `express`, `jsonwebtoken`, `bcryptjs`, `cookie-parser`, `node:sqlite` (built-in)
- Build: `tsc` → `/server/dist/`
- Entry points: `dist/index.js` (production), `dist/index.vuln.js` (dev-only injection target)

**Web** (`/web/`):
- Source: TypeScript in `/web/src/`
- Build: `tsc` → `/web/dist/src/`
- No bundler; served as-is by Express static middleware
- CSS-in-HTML (no CSS build)

## Notes for Contributors

- **Always use parameterized queries** (`db.prepare().get(...params)` not string interpolation)
- **Test IDs before CSS**: `data-testid` is stability layer, CSS classes are cosmetic
- **Prices in cents** (integers, never floats) everywhere
- **SPA routing is hash-based** (#-routes), not server-side paths (keeps it static-hostable)
- **Seed data is immutable** across test runs—edit `/server/src/db.ts` to change products, users, discounts
- **No external APIs**—all data is local, deterministic, fast
