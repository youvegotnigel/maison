# AGENTS.md — Maison

Guidance for AI agents (and humans) working in this repository. Read this once before making
changes. It describes what the project is, how it is structured, how to build/run/test it, the
conventions you must follow, and the gotchas that will bite you if you don't.

---

## 1. What this project is

**Maison** is a two-sided luxury e-commerce marketplace (buyers + sellers). It is **not** a real
production storefront — it exists as a deliberately realistic **Application Under Test (AUT)** for a
Playwright automation framework. Its whole reason to exist is to be *testable* across five pillars:

> **UI · Mobile · API · Accessibility · Security**

Any change you make must keep the app working **and** keep it testable across those pillars. If you
add a feature, you generally also add the data-testids and the Playwright coverage for it.

Key properties that make it ideal as an AUT:

- **Single Node process, single port.** One Express server serves both the JSON API and the static
  SPA on `http://localhost:4000`. No reverse proxy, no separate frontend dev server.
- **No external dependencies at runtime.** No external database (uses the built-in `node:sqlite`),
  no internet calls, no image hosting (product images are generated inline as SVG data-URIs).
- **Deterministic seed data.** The DB is re-seeded to a known state on boot and via a test-only
  reset endpoint, so tests can assert on exact values (e.g. "catalogue returns 22 products").

---

## 2. Tech stack & requirements

- **Runtime:** Node.js **≥ 24** (hard requirement — relies on the built-in `node:sqlite` module).
- **Language:** TypeScript (strict mode) everywhere — server, web, and tests.
- **Backend:** Express 4, `jsonwebtoken` (JWT auth), `bcryptjs` (password hashing),
  `cookie-parser`. DB is `node:sqlite` (`DatabaseSync`).
- **Frontend:** Vanilla TypeScript SPA — **no framework**, no bundler. Hand-rolled hash router,
  `innerHTML` templating, plain `fetch`. Compiled with `tsc` to `web/dist/`.
- **Tests:** Playwright (`@playwright/test`), `@axe-core/playwright` for accessibility.
- **Lint:** ESLint 9 flat config + `typescript-eslint`.
- **Container:** Multi-stage Dockerfile on `node:24-alpine`.
- **CI:** GitHub Actions — lint+typecheck gate, then one job per test pillar.

There is **no build step for production assets beyond `tsc`** and no CSS preprocessor — `styles.css`
is plain hand-written CSS.

---

## 3. Repository layout

```
maison/
├── server/                     # Backend: API + static host (its own package.json)
│   ├── package.json            # server deps (express, jwt, bcryptjs, cookie-parser)
│   ├── tsconfig.json           # NodeNext module resolution → emits to dist/
│   └── src/
│       ├── index.ts            # App entry: middleware, route mounting, static host, listen()
│       ├── index.vuln.ts       # ⚠️ INTENTIONALLY VULNERABLE variant (security testing only)
│       ├── db.ts               # node:sqlite schema, deterministic seed, SVG image generator
│       ├── auth.ts             # JWT sign/verify, authenticate, requireAuth, requireRole, fail()
│       ├── pricing.ts          # serializeProduct (canonical product JSON shape), money(), discounts
│       ├── types.d.ts          # Express Request augmentation (req.user, req.tokenInvalid)
│       └── routes/
│           ├── auth.ts         # /auth: register, login, logout, me
│           ├── auth.vuln.ts    # ⚠️ INTENTIONALLY VULNERABLE auth (SQLi demo)
│           ├── products.ts     # /products: public catalogue + seller-owned CRUD
│           └── cart.ts         # /cart (buyer) + ordersRouter (/orders, buyer)
│
├── web/                        # Frontend SPA
│   ├── tsconfig.json           # compiles src/ → dist/src/
│   ├── src/
│   │   ├── app.ts              # SPA: hash router, views, all data-testids live here
│   │   └── api.ts              # fetch wrapper; exposes window.MaisonAPI for test introspection
│   └── dist/                   # Built output (index.html, styles.css, compiled JS) — SERVED AS-IS
│
├── tests/                      # Playwright specs, one per pillar
│   ├── ui.spec.ts              # buyer/seller UI flows
│   ├── mobile.spec.ts          # 375×812 viewport, overflow/responsive checks
│   ├── api.spec.ts             # API contract tests
│   ├── security.spec.ts        # authz/IDOR/headers/SQLi
│   └── a11y.spec.ts            # WCAG landmarks (axe-core wiring is present, commented)
│
├── docs/                       # Supplementary docs (superpowers)
├── verify.ts                   # Standalone smoke test (npm run test:smoke), run with tsx
├── playwright.config.ts        # baseURL, single worker, auto-starts the server (webServer)
├── package.json                # root: orchestrates server+web build, defines test scripts
├── tsconfig.json               # root tsconfig for tests/ + config files
├── eslint.config.js
├── Dockerfile
├── README.md                   # user-facing run/deploy docs
└── TEST_AUTOMATION_GAPS.md     # known testing gaps / backlog
```

---

## 4. Build, run, and test

All commands run from the repo root unless noted. Root scripts orchestrate the `server/` subpackage.

### Install
```bash
npm install          # also runs server/ install via postinstall
```

### Run
```bash
npm start            # builds server + serves app & API at http://localhost:4000
```
- App UI:    http://localhost:4000
- API base:  http://localhost:4000/api/v1
- Health:    http://localhost:4000/api/v1/health  → `{"status":"ok"}`
- Demo accounts are printed to the console on boot (see §6).

### Build / typecheck / lint
```bash
npm run build        # build:server (tsc) + build:web (tsc)
npm run build:server
npm run build:web
npm run typecheck    # tsc --noEmit for both server and web
npm run lint         # eslint .
```

### Test
```bash
npm test             # all Playwright specs
npm run test:ui
npm run test:mobile
npm run test:api
npm run test:security
npm run test:a11y
npm run test:smoke   # verify.ts via tsx — fast end-to-end sanity check
```
`playwright.config.ts` has a `webServer` block, so Playwright will **build and start the server
automatically** (and reuse an already-running one). You usually don't need to start it manually
before running tests. Tests run with a **single worker, no retries, not parallel** — keep it that
way (shared in-memory DB means parallel runs would clobber each other).

### Docker
```bash
docker build -t maison:latest .
docker run --rm -p 4000:4000 maison:latest
```
Note the Dockerfile copies the **prebuilt** `web/dist/` into the image. If you change frontend code,
run `npm run build:web` and commit the `web/dist/` output (see §9 gotchas).

---

## 5. Architecture & request lifecycle

### Server boot (`server/src/index.ts`)
1. `seed()` runs at import time → fresh deterministic DB in memory.
2. Express app: `express.json({ limit: '2mb' })`, `cookieParser()`.
3. **Security headers** middleware (CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
   `Referrer-Policy`, `Permissions-Policy`). `x-powered-by` is disabled.
4. **CORS** for the single known origin (`MAISON_ORIGIN`), credentials allowed.
5. **Rate limiter** (in-memory, 50 req/min/IP) applied to `/auth/login` and `/auth/register`.
6. `authenticate` runs globally — it *attaches* `req.user` if a valid token is present but does
   **not** reject when absent. Use `requireAuth` / `requireRole` on routes that need it.
7. Routes mounted under `/api/v1`. Unknown `/api/*` paths → structured 404.
8. Static frontend served from `web/dist`; `GET *` falls back to `index.html` (SPA routing).
9. Central error handler emits the consistent error envelope.

### API surface (all under `/api/v1`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | – | liveness |
| GET | `/seed-info` | – | documents demo accounts/password for testers |
| POST | `/_reset` | – | **test-only**; re-seeds. Disabled if `MAISON_ALLOW_RESET=false` |
| POST | `/auth/register` | – | buyer or seller; validates email/password/DOB(≥18)/role |
| POST | `/auth/login` | – | returns `{ token, user }` + sets `maison_token` cookie |
| POST | `/auth/logout` | – | clears cookie |
| GET | `/auth/me` | auth | current user |
| GET | `/products` | – | catalogue; query: `q, category, sort, minPrice, maxPrice` |
| GET | `/products/categories` | – | distinct published categories |
| GET | `/products/:id` | – | single product |
| GET | `/products/:id/certificate` | – | certificate of authenticity, or 404 `CERTIFICATE_NOT_FOUND` |
| POST | `/products/:id/certificate` | seller (owner) | (re)issue certificate, idempotent; 403 `FORBIDDEN_NOT_OWNER` |
| GET | `/products/seller/mine` | seller | seller's own listings |
| POST | `/products` | seller | create listing |
| PATCH | `/products/:id` | seller (owner) | update fields |
| POST | `/products/:id/images` | seller (owner) | add image url/data-URI |
| PUT | `/products/:id/discount` | seller (owner) | set percentage/fixed discount |
| DELETE | `/products/:id/discount` | seller (owner) | remove discount |
| GET | `/cart` | buyer | current cart |
| POST | `/cart/items` | buyer | add/set quantity (validates stock) |
| DELETE | `/cart/items/:itemId` | buyer | remove line |
| DELETE | `/cart` | buyer | clear cart |
| GET | `/orders` | buyer | order history |
| GET | `/orders/:reference` | buyer (owner) | single order |
| POST | `/orders` | buyer | checkout from cart (transactional stock decrement) |

### Frontend (`web/src/app.ts` + `api.ts`)
- **Hash router** (`#/`, `#/product/:id`, `#/login`, `#/cart`, `#/orders`, `#/seller`, …). Views
  render via `innerHTML` template strings into the `#app` container.
- `web/src/api.ts` is a thin `fetch` wrapper that throws `ApiError` (with `code`, `status`,
  `payload`) on non-2xx, and exposes `window.MaisonAPI` for test introspection.
- App readiness is signalled with `document.body[data-app-ready="true"]` — tests wait on this.
- The current user is mirrored on a `[data-testid="current-user"][data-role="..."]` element.

---

## 6. Data model & seed (`server/src/db.ts`)

Tables: `users`, `products`, `product_images`, `discounts`, `certificates`, `carts`, `cart_items`,
`orders`, `order_items`. Foreign keys ON, WAL journal mode. **Money is always stored as integer cents**
(`price_cents`, `total_cents`, `unit_price_cents`) — never floats.

DB location: in-memory (`:memory:`) by default; set `MAISON_DB_FILE` to persist to disk.

**Deterministic seed (do not change values without updating the tests that assert on them):**
- Password for all seeded accounts: **`Password123!`**
- Accounts:
  - `seller@maison.test` (seller) — owns seed products 1–11
  - `seller2@maison.test` (seller) — owns seed products 12+
  - `buyer@maison.test` (buyer)
- **22 seed products.** Product index 0 ("Noir Saffiano Tote") has a 15% discount; index 4
  ("Onyx Leather Derby") has a 20000-cent fixed discount. `api.spec.ts` asserts these exact numbers
  (e.g. tote `effectiveCents === 242250`).
- **Certificates** are seeded for every product owned by `seller@maison.test` (seller1, products
  1–11); products owned by seller2 (12+) have none (drives the GET 404). Fields are deterministic
  and product-derived: `serial_no = MAISON-AC-<id padded to 4>`, `issuer = 'Maison Atelier'`,
  `material` from category, `issued_at = '2024-01-01'`. POST re-issue is idempotent (not `now()`).

Images: `placeholderImage(label, hue)` returns an inline SVG data-URI — no external hosting.

---

## 7. Conventions you MUST follow

These are the patterns the codebase already uses. Match them exactly for consistency and to keep
tests/scanners happy.

1. **Error envelope.** All errors go through `fail(res, status, CODE, message)` from `auth.ts`,
   producing `{ "error": { "code": "...", "message": "..." } }`. Use a `SCREAMING_SNAKE_CASE` code.
   Frontend `ApiError` and security tests read `error.code`.
2. **Money in integer cents.** Never introduce floating-point currency. Format for display with
   `money()` in `pricing.ts`.
3. **Parameterized SQL only** in production code (`db.prepare(...).run/get/all(params)`). Never build
   SQL by string concatenation/interpolation. (The `*.vuln.ts` files break this *on purpose* — see §8.)
4. **AuthZ via helpers.** Protect routes with `requireAuth` or `requireRole('buyer'|'seller')`.
   For seller-owned resources, also verify ownership (`row.seller_id === req.user.sub`) and return
   `403 NOT_OWNER` — see `getOwnedProduct` in `routes/products.ts`. Don't leak existence as 404 vs
   403 inconsistently; follow the existing pattern.
5. **Canonical product shape.** Always return products through `serializeProduct()`. If you add a
   product field, add it there so every endpoint stays consistent.
6. **Validation up front.** Validate inputs and `return fail(...)` early, mirroring the existing
   `register`/product-create handlers (type checks, `Number.isInteger`, ranges, regexes).
7. **Frontend data-testids.** Every interactive/asserted element gets a stable
   `data-testid`. New UI without testids is effectively untestable here — always add them and prefer
   `getByTestId` in specs. Also escape user-controlled strings with the existing `esc()` helper when
   injecting into `innerHTML` (prevents XSS and keeps the security pillar honest).
8. **Determinism.** Don't introduce randomness, timestamps, or network calls that tests would assert
   on. The order `reference` uses time+random and is treated as opaque by tests — keep new
   non-deterministic outputs out of assertion paths.
9. **TypeScript strict.** No new `any` (eslint warns); unused vars are an **error**. Keep the build
   green: `npm run typecheck && npm run lint`.
10. **Module style.** Server is `NodeNext` ESM — **import local files with the `.js` extension**
    (e.g. `import { db } from '../db.js'`) even though the source is `.ts`. Web/tests use `bundler`
    resolution.

---

## 8. The intentionally vulnerable variants (⚠️ important)

`server/src/index.vuln.ts` and `server/src/routes/auth.vuln.ts` are **deliberately insecure** (e.g.
SQL injection in login) and exist **only** to give the security pillar something to detect. They run
on a separate port (`PORT_VULN`, default 4001) via `npm run start:vuln` in the server package.

**Rules:**
- Do **not** "fix" the vulnerabilities in these files — that's the point of them.
- Do **not** copy their patterns into the real (`index.ts` / `routes/*.ts`) code paths.
- The production code paths must remain secure (parameterized queries, proper authz, headers).
- If you're unsure whether a file is the safe or vulnerable variant, check the filename for `.vuln`.

---

## 9. Gotchas / things that will trip you up

- **`web/dist/` is committed and served directly.** The server hosts `web/dist`, and the Dockerfile
  copies it in. After changing `web/src/`, you must run `npm run build:web` and commit the rebuilt
  `web/dist/` (including the compiled JS/maps), or the running app/container won't reflect your change.
- **In-memory DB is reset on every boot.** Don't expect data to persist between runs unless you set
  `MAISON_DB_FILE`. Tests rely on `POST /api/v1/_reset` in `beforeEach` to get a clean known state.
- **`_reset` can be disabled.** It's gated by `MAISON_ALLOW_RESET`; if `=false`, reset returns 403
  and the test suites that depend on it will fail. Leave it enabled in test environments.
- **Tests are single-worker by design.** The shared in-memory DB means you cannot safely parallelize.
  Don't bump `workers` in `playwright.config.ts`.
- **`.js` import extensions in server code** (NodeNext). Omitting them breaks the build at runtime.
- **Node ≥ 24 required** for `node:sqlite`. Older Node will fail to start.
- **Two `package.json` files.** Root orchestrates; `server/package.json` holds the actual runtime
  deps. Add backend deps in `server/`, not root.
- **a11y axe wiring is present but commented out** in `a11y.spec.ts`; `@axe-core/playwright` is
  installed. Uncomment to run full WCAG scans.
- **Not every CI job installs a browser.** The `test-ui`, `test-mobile`, `test-a11y`, and
  `test-security` jobs run `npx playwright install --with-deps chromium`; **`test-api` does not**
  (its pillar is purely `request`-based). If you add a browser-based (`page`) test to `api.spec.ts`,
  add the "Install Playwright browsers" step to the `test-api` job or CI fails with *"Executable
  doesn't exist … chrome-headless-shell"* — a failure you won't see locally if browsers are already
  installed. (This bit the security pillar when the certificate XSS test introduced the first
  `page`-based security test.)

---

## 10. How to add a feature (recommended workflow)

1. **Model the data** (if needed): add table/column + seed in `db.ts`. Keep seed deterministic and
   update any tests that count/assert seed values.
2. **Serialize** new product/user fields in `pricing.ts` / `publicUser` so the JSON shape stays
   canonical across endpoints.
3. **Add the API route** in the appropriate `routes/*.ts`, mounted under `/api/v1` in `index.ts`.
   Use `requireAuth`/`requireRole`, validate inputs, use `fail()` for errors, parameterized SQL only.
4. **Add the API client method** in `web/src/api.ts`, then the **UI/view** in `web/src/app.ts` with
   `data-testid`s and `esc()` for any user-controlled output.
5. **Rebuild the web bundle** (`npm run build:web`) and commit `web/dist/`.
6. **Add Playwright coverage** across the relevant pillars — at minimum API + UI; add security
   (authz/IDOR) for protected routes and a11y/mobile where it applies. Reset state in `beforeEach`.
   Coverage is **mandatory**, not optional — every new feature or bug fix lands with tests that
   actually exercise the new behaviour (happy path **and** the failure/authz/edge cases). A change
   that adds behaviour without tests is incomplete (see §13).
7. **Verify before claiming done:**
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
   Report the actual command output. Don't assert success without running it.
8. **Bump the version and release** per §13 — update the version in the root `package.json` using
   semver, then tag and push so the Docker image publishes for the new version.

---

## 11. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | server port |
| `MAISON_ORIGIN` | `http://localhost:${PORT}` | CORS allowed origin |
| `MAISON_JWT_SECRET` | demo fallback | JWT signing secret (set a real one outside demos) |
| `MAISON_DB_FILE` | `:memory:` | persist SQLite to a file instead of memory |
| `MAISON_ALLOW_RESET` | enabled | set `=false` to disable the `_reset` test endpoint |
| `MAISON_URL` | `http://localhost:4000` | base URL the Playwright specs target |
| `PORT_VULN` | `4001` | port for the intentionally-vulnerable variant |

---

## 12. CI

- **`.github/workflows/playwright.yml`** — `lint` job (npm ci → typecheck → lint) gates five
  parallel jobs (`test-ui`, `test-mobile`, `test-api`, `test-security`, `test-a11y`), each starting
  the app, waiting on `/api/v1/health`, running its pillar, and uploading reports. Runs on push/PR to
  `master`. Keep all of these green.
- **`.github/workflows/docker-publish.yml`** — builds and publishes the image to Docker Hub
  (multi-arch amd64/arm64) on push to `master` / version tags.

---

## 13. Definition of done: tests, versioning & Docker release

Every feature or bug fix is **only complete** when all three of the following are done. Treat this
as the checklist for "is this change shippable?"

### 13.1 Tests (mandatory)
- Add Playwright coverage for the new behaviour across the relevant pillars (at minimum API + UI;
  add security for protected/owned routes, a11y + mobile where they apply). See §10 step 6.
- Cover both the happy path **and** the failure modes (validation errors, 401/403/404, IDOR,
  output-escaping/XSS, parameterized SQL). A green build with no new tests is **not** done.
- Keep the full suite green: `npm run typecheck && npm run lint && npm test`.

### 13.2 Version bump (semver, root `package.json`)
Bump `version` in the **root** `package.json` according to the nature of the change:

| Change type | Bump | Example |
|---|---|---|
| Breaking change (removed/renamed route, changed response shape, incompatible behaviour) | **major** | `1.5.0 → 2.0.0` |
| New feature (new endpoint, new view, additive capability) | **minor** | `1.4.0 → 1.5.0` |
| Bug fix / docs / internal refactor (no new capability, backward compatible) | **patch** | `1.5.0 → 1.5.1` |

(`server/package.json` carries its own independent dependency version and is not the release
version — the **root** `package.json` version is the one that tracks releases.)

### 13.3 Docker release (tagged version)
The image is published by `.github/workflows/docker-publish.yml`, which runs on pushes to `master`
**and** on tags matching `v*.*.*` (emitting `{{version}}`, `{{major}}.{{minor}}`, and `latest`).
To release the new version:

```bash
# After the version bump is merged to master:
git checkout master && git pull
git tag v<new-version>          # e.g. git tag v1.5.0  — MUST match package.json
git push origin v<new-version>  # triggers the multi-arch Docker Hub publish
```

The git tag is the source of truth for the published image tag, so it **must** match the root
`package.json` version (prefixed with `v`). Pushing the tag is an outward-facing release — only do it
once the change is on `master` and the suite is green.

---

*Last reviewed against the codebase on 2026-06-07. If you change build commands, the data model,
seed values, the API surface, the security/vuln conventions, or the release/versioning process,
update this file in the same change.*
