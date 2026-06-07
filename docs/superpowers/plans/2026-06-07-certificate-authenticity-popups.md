# Certificate of Authenticity + Product Popups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an API-backed Certificate of Authenticity entity plus three multi-window open behaviours (new tab, popup, three-at-once) to the Product Detail view, with full five-pillar test coverage.

**Architecture:** A new `certificates` table (one row per product, idempotent by `product_id`) with deterministic, product-derived fields. Public `GET` + protected seller-owned `POST` routes on the existing products router. Frontend adds three triggers on Product Detail that open internal path-style SPA routes; the SPA `boot()` gains a path dispatcher that renders minimal standalone window views (own landmark, `lang`, single `<h1>`, root `data-testid`, deterministic `document.title`).

**Tech Stack:** Node ≥24 `node:sqlite`, Express 4, TypeScript (strict, NodeNext on server), vanilla TS SPA, Playwright + `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-06-07-certificate-authenticity-popups-design.md`

---

## Critical gotchas (read before starting)

- **`reuseExistingServer: true`** in `playwright.config.ts`: if a server is already listening on :4000, Playwright will NOT rebuild/restart it and your tests run against **stale code**. Before running any test task below, kill any running server: `lsof -ti:4000 | xargs kill 2>/dev/null; true`.
- **`web/dist/` is committed and served as-is.** After any `web/src/` change you MUST run `npm run build:web` and commit the rebuilt `web/dist/`.
- **Server uses NodeNext ESM** — import local files with the `.js` extension (e.g. `from '../db.js'`).
- **Parameterized SQL only** in production code. **Escape user-controlled output** with the existing `esc()` helper in the frontend.
- Tests reset state via `POST /api/v1/_reset` in `beforeEach` (already present in every spec).

---

## File structure

- **Modify** `server/src/db.ts` — `DbCertificate` interface, `certificates` table in `initSchema()`, deterministic helpers/constants, seed loop insert.
- **Modify** `server/src/pricing.ts` — `SerializedCertificate` interface + `serializeCertificate()`.
- **Modify** `server/src/routes/products.ts` — `GET /:id/certificate`, `POST /:id/certificate`.
- **Modify** `web/src/api.ts` — `certificate()`, `issueCertificate()` client methods.
- **Modify** `web/src/app.ts` — Product Detail triggers, `boot()` path dispatcher, standalone window renderers, `certificateSeal()` helper, `Certificate` interface.
- **Rebuild** `web/dist/` (committed).
- **Modify** `tests/api.spec.ts`, `tests/ui.spec.ts`, `tests/security.spec.ts`, `tests/a11y.spec.ts`, `tests/mobile.spec.ts`.

---

## Task 1: Write the failing API tests

**Files:**
- Modify: `tests/api.spec.ts`

- [ ] **Step 1: Append the certificate API test block**

Add at the end of `tests/api.spec.ts` (the `BASE`, `API`, `PASSWORD`, and `beforeEach` reset already exist at the top of the file):

```ts
test.describe('API · certificate', () => {
  async function login(request: any, email: string) {
    const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    const { token } = await res.json();
    return { Cookie: `maison_token=${token}` };
  }

  test('GET returns a seeded certificate for a seeded product', async ({ request }) => {
    const res = await request.get(`${API}/products/1/certificate`);
    expect(res.status()).toBe(200);
    const { certificate } = await res.json();
    expect(certificate.serialNo).toBe('MAISON-AC-0001');
    expect(certificate.issuer).toBe('Maison Atelier');
    expect(certificate.material).toBe('Full-grain leather'); // product 1 is a Bag
    expect(certificate.issuedAt).toBe('2024-01-01');
    expect(certificate.productName).toBe('Noir Saffiano Tote');
    expect(certificate.productId).toBe(1);
  });

  test('GET returns 404 CERTIFICATE_NOT_FOUND for a product with none', async ({ request }) => {
    // product 12 is owned by seller2 and is NOT seeded with a certificate
    const res = await request.get(`${API}/products/12/certificate`);
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('CERTIFICATE_NOT_FOUND');
  });

  test('POST issues a certificate for the owning seller (201) and is idempotent', async ({ request }) => {
    const auth = await login(request, 'seller@maison.test'); // owns product 1
    const first = await request.post(`${API}/products/1/certificate`, { headers: auth });
    expect(first.status()).toBe(201);
    const a = (await first.json()).certificate;
    expect(a.serialNo).toBe('MAISON-AC-0001');

    const second = await request.post(`${API}/products/1/certificate`, { headers: auth });
    expect(second.status()).toBe(201);
    const b = (await second.json()).certificate;
    expect(b.serialNo).toBe(a.serialNo);
    expect(b.issuedAt).toBe(a.issuedAt); // deterministic, not now()
  });

  test('POST returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.post(`${API}/products/1/certificate`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  });

  test('POST returns 403 FORBIDDEN_ROLE for a buyer', async ({ request }) => {
    const auth = await login(request, 'buyer@maison.test');
    const res = await request.post(`${API}/products/1/certificate`, { headers: auth });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN_ROLE');
  });

  test('POST returns 403 FORBIDDEN_NOT_OWNER for a non-owning seller (no IDOR)', async ({ request }) => {
    const auth = await login(request, 'seller2@maison.test'); // does NOT own product 1
    const res = await request.post(`${API}/products/1/certificate`, { headers: auth });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN_NOT_OWNER');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:api -- -g "certificate"
```

Expected: FAIL. GET returns the 404 SPA fallback / `PRODUCT_NOT_FOUND`-style miss and POST routes don't exist yet, so the certificate assertions fail.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/api.spec.ts
git commit -m "test: add failing certificate API tests"
```

---

## Task 2: Certificate table, helpers, and seed

**Files:**
- Modify: `server/src/db.ts`

- [ ] **Step 1: Add the `DbCertificate` interface**

After the `DbOrderItem` interface (around line 54), add:

```ts
export interface DbCertificate {
  id: number;
  product_id: number;
  serial_no: string;
  issuer: string;
  material: string;
  issued_at: string;
}
```

- [ ] **Step 2: Add the drop + create for `certificates` in `initSchema()`**

In `initSchema()`, add the drop near the other drops — it references `products`, so it must drop **before** `products`. Change the drop block so it reads (add the new line):

```sql
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS cart_items;
    DROP TABLE IF EXISTS carts;
    DROP TABLE IF EXISTS certificates;
    DROP TABLE IF EXISTS discounts;
    DROP TABLE IF EXISTS product_images;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS users;
```

Then add the `CREATE TABLE` immediately after the `discounts` table definition (it references `products`, already created above):

```sql
    CREATE TABLE certificates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL UNIQUE REFERENCES products(id),
      serial_no   TEXT NOT NULL,
      issuer      TEXT NOT NULL,
      material    TEXT NOT NULL,
      issued_at   TEXT NOT NULL
    );
```

- [ ] **Step 3: Add deterministic constants and helpers**

After the `SEED_PASSWORD` constant (around line 154), add:

```ts
// Deterministic certificate-of-authenticity values (asserted by tests).
export const CERTIFICATE_ISSUER = 'Maison Atelier';
export const CERTIFICATE_ISSUED_AT = '2024-01-01';

export function certificateSerial(productId: number): string {
  return 'MAISON-AC-' + String(productId).padStart(4, '0');
}

const CERTIFICATE_MATERIALS: Record<string, string> = {
  Bags: 'Full-grain leather',
  Watches: 'Stainless steel & sapphire',
  Jewellery: '18k gold',
  Footwear: 'Calfskin leather',
  Fragrance: 'Crystal flacon',
  Apparel: 'Natural fibre',
  Accessories: 'Mixed materials',
};

export function materialForCategory(category: string): string {
  return CERTIFICATE_MATERIALS[category] ?? 'Atelier-grade materials';
}
```

- [ ] **Step 4: Seed a certificate for every product owned by seller1**

In `seed()`, add a prepared insert alongside the other prepared statements (after `insDiscount`):

```ts
  const insCert = db.prepare(
    'INSERT INTO certificates (product_id, serial_no, issuer, material, issued_at) VALUES (?, ?, ?, ?, ?)'
  );
```

Inside the `SEED_PRODUCTS.forEach((p, i) => { ... })` loop, after the discount inserts, add:

```ts
    // Certificate for every product owned by the demo seller (seller1, indexes 0–10).
    if (owner === seller1) {
      insCert.run(pid, certificateSerial(pid), CERTIFICATE_ISSUER, materialForCategory(p.category), CERTIFICATE_ISSUED_AT);
    }
```

- [ ] **Step 5: Typecheck the server**

```bash
npm run build:server
```

Expected: builds with no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts
git commit -m "feat: add certificates table, deterministic helpers, and seed"
```

---

## Task 3: Serialize the certificate

**Files:**
- Modify: `server/src/pricing.ts`

- [ ] **Step 1: Import `DbCertificate`**

Change the first import line:

```ts
import { db, type DbProduct, type DbCertificate } from './db.js';
```

- [ ] **Step 2: Add the serialized interface**

After the `SerializedProduct` interface, add:

```ts
export interface SerializedCertificate {
  id: number;
  productId: number;
  productName: string;
  serialNo: string;
  issuer: string;
  material: string;
  issuedAt: string;
}
```

- [ ] **Step 3: Add `serializeCertificate()` with a lazy prepared statement**

At the end of the file (after `money()`), add:

```ts
// Lazy so it binds after the schema exists (seed() runs at boot, after import).
let certNameStmt: StatementSync | undefined;

export function serializeCertificate(row: DbCertificate): SerializedCertificate {
  if (!certNameStmt) certNameStmt = db.prepare('SELECT name FROM products WHERE id = ?');
  const prod = certNameStmt.get(row.product_id) as { name: string } | undefined;
  return {
    id: row.id,
    productId: row.product_id,
    productName: prod ? prod.name : '',
    serialNo: row.serial_no,
    issuer: row.issuer,
    material: row.material,
    issuedAt: row.issued_at,
  };
}
```

(`StatementSync` is already imported at the top of `pricing.ts`.)

- [ ] **Step 4: Typecheck**

```bash
npm run build:server
```

Expected: builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/pricing.ts
git commit -m "feat: add serializeCertificate to canonical pricing module"
```

---

## Task 4: Certificate API routes (makes Task 1 tests pass)

**Files:**
- Modify: `server/src/routes/products.ts`

- [ ] **Step 1: Extend imports**

Change the imports at the top of `routes/products.ts` to:

```ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db.js';
import type { DbProduct, DbCertificate } from '../db.js';
import { serializeProduct, serializeCertificate } from '../pricing.js';
import { fail, requireRole } from '../auth.js';
import { placeholderImage, certificateSerial, materialForCategory, CERTIFICATE_ISSUER, CERTIFICATE_ISSUED_AT } from '../db.js';
```

- [ ] **Step 2: Add the public GET route**

Add immediately after the public `router.get('/:id', ...)` handler (around line 42):

```ts
// Public: certificate of authenticity for a product (or 404 if none).
router.get('/:id/certificate', (req, res) => {
  const row = db.prepare('SELECT * FROM certificates WHERE product_id = ?')
    .get(Number(req.params.id)) as unknown as DbCertificate | undefined;
  if (!row) return fail(res, 404, 'CERTIFICATE_NOT_FOUND', 'No certificate exists for that product.');
  res.json({ certificate: serializeCertificate(row) });
});
```

- [ ] **Step 3: Add the protected POST route**

Add just before `export default router;` at the bottom of the file:

```ts
// Protected: (re)issue a certificate. Seller-only, owner-only, idempotent.
router.post('/:id/certificate', requireRole('seller'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?')
    .get(Number(req.params.id)) as unknown as DbProduct | undefined;
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
  if (product.seller_id !== req.user!.sub) {
    return fail(res, 403, 'FORBIDDEN_NOT_OWNER', 'You can only issue certificates for products you own.');
  }
  const serial = certificateSerial(product.id);
  const material = materialForCategory(product.category);
  db.prepare('DELETE FROM certificates WHERE product_id = ?').run(product.id);
  db.prepare('INSERT INTO certificates (product_id, serial_no, issuer, material, issued_at) VALUES (?, ?, ?, ?, ?)')
    .run(product.id, serial, CERTIFICATE_ISSUER, material, CERTIFICATE_ISSUED_AT);
  const row = db.prepare('SELECT * FROM certificates WHERE product_id = ?')
    .get(product.id) as unknown as DbCertificate;
  res.status(201).json({ certificate: serializeCertificate(row) });
});
```

- [ ] **Step 4: Run the API tests to verify they pass**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:api -- -g "certificate"
```

Expected: PASS — all six certificate tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/products.ts
git commit -m "feat: add certificate GET/POST routes with ownership enforcement"
```

---

## Task 5: API client methods

**Files:**
- Modify: `web/src/api.ts`

- [ ] **Step 1: Add the two methods**

In the `api` object, after the `product:` line (around line 55), add:

```ts
  certificate: (id: number | string) => request('GET', `/products/${id}/certificate`),
  issueCertificate: (id: number | string) => request('POST', `/products/${id}/certificate`),
```

- [ ] **Step 2: Typecheck the web bundle**

```bash
npm run build:web
```

Expected: builds with no errors.

- [ ] **Step 3: Commit (source only; dist rebuilt in Task 8)**

```bash
git add web/src/api.ts
git commit -m "feat: add certificate API client methods"
```

---

## Task 6: Product Detail triggers

**Files:**
- Modify: `web/src/app.ts` (`pageProduct`, around lines 286–333)

- [ ] **Step 1: Add the `Certificate` interface**

After the `Product` interface (around line 27), add:

```ts
interface Certificate {
  id: number;
  productId: number;
  productName: string;
  serialNo: string;
  issuer: string;
  material: string;
  issuedAt: string;
}
```

- [ ] **Step 2: Add the trigger row to the Product Detail template**

In `pageProduct`, locate the buyer-hint line inside the info column:

```ts
          ${!isBuyer ? `<p class="tiny" data-testid="buyer-hint" style="margin-top:18px">Sign in as a buyer to purchase.</p>` : ''}
```

Insert immediately **after** that line (still inside the `<div>` info column, before its closing `</div>`):

```ts
          <div class="row" data-testid="pdp-extras" style="margin-top:24px;gap:12px;flex-wrap:wrap">
            <a class="btn btn--ghost btn--sm" data-testid="certificate-link" target="_blank" href="/certificate/${p.id}">View Certificate of Authenticity</a>
            <button class="btn btn--ghost btn--sm" type="button" data-testid="size-guide-button">Size &amp; Fit Guide</button>
            <button class="btn btn--ghost btn--sm" type="button" data-testid="share-all-button">Share this piece</button>
          </div>
```

- [ ] **Step 3: Wire the popup handlers**

In `pageProduct`, after the closing `}` of the `if (p.inStock) { ... }` block (around line 333), add — these must always be attached, regardless of stock:

```ts
  app.querySelector<HTMLElement>('[data-testid="size-guide-button"]')!.onclick = () => {
    window.open('/size-guide', 'maison_size_guide', 'popup,width=480,height=640');
  };
  app.querySelector<HTMLElement>('[data-testid="share-all-button"]')!.onclick = () => {
    window.open(`/share/${p.id}/link`, 'maison_share_link', 'popup,width=480,height=560');
    window.open(`/share/${p.id}/email`, 'maison_share_email', 'popup,width=480,height=560');
    window.open(`/share/${p.id}/preview`, 'maison_share_preview', 'popup,width=480,height=560');
  };
```

(The certificate link is a plain `target="_blank"` anchor — no JS handler needed; it opens a new tab.)

- [ ] **Step 4: Typecheck**

```bash
npm run build:web
```

Expected: builds with no errors.

- [ ] **Step 5: Commit (source only)**

```bash
git add web/src/app.ts
git commit -m "feat: add certificate/size-guide/share triggers to product detail"
```

---

## Task 7: Standalone window views + boot dispatcher

**Files:**
- Modify: `web/src/app.ts` (`boot()` around lines 967–976, plus new helpers)

- [ ] **Step 1: Add the standalone view helpers and renderers**

Add this block immediately **above** the `// Boot` section comment (around line 964, before `async function boot()`):

```ts
// ============================================================
//  Standalone window/tab views (multi-window automation)
//  Opened via path-style internal routes served by the SPA
//  static fallback. Minimal chrome: own <main>, lang, one <h1>,
//  root data-testid, deterministic title. No session/cart.
// ============================================================
function mountStandalone(rootTestId: string, title: string, innerHTML: string): HTMLElement {
  document.documentElement.lang = 'en';
  document.title = title;
  document.body.innerHTML = `<main role="main" class="container" style="padding:48px 0">
    <div data-testid="${rootTestId}">${innerHTML}</div>
  </main>`;
  return document.body.querySelector<HTMLElement>(`[data-testid="${rootTestId}"]`)!;
}

function markReady(): void {
  document.body.setAttribute('data-app-ready', 'true');
}

// Deterministic inline-SVG authenticity seal (data-URI), styled like placeholderImage.
function certificateSeal(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="92" fill="#100f0d" stroke="#c8a96a" stroke-width="2"/>
    <circle cx="100" cy="100" r="74" fill="none" stroke="#c8a96a" stroke-width="1" opacity="0.6"/>
    <text x="100" y="92" font-family="Georgia, serif" font-size="42" fill="#c8a96a" text-anchor="middle">M</text>
    <text x="100" y="128" font-family="Georgia, serif" font-size="13" fill="#e8e2d6" text-anchor="middle" letter-spacing="3">AUTHENTIC</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

async function renderCertificateWindow(id: string): Promise<void> {
  const root = mountStandalone('certificate-view', 'Certificate of Authenticity | Maison',
    `<h1>Certificate of Authenticity</h1><p class="muted" data-testid="loading">Loading…</p>`);
  try {
    const r = await api.certificate(id) as { certificate: Certificate };
    const c = r.certificate;
    root.innerHTML = `
      <h1>Certificate of Authenticity</h1>
      <img src="${certificateSeal()}" alt="Maison authenticity seal" width="160" height="160" data-testid="certificate-seal" />
      <dl class="cert">
        <dt>Product</dt><dd data-testid="certificate-product">${esc(c.productName)}</dd>
        <dt>Serial No.</dt><dd data-testid="certificate-serial">${esc(c.serialNo)}</dd>
        <dt>Issuer</dt><dd data-testid="certificate-issuer">${esc(c.issuer)}</dd>
        <dt>Material</dt><dd data-testid="certificate-material">${esc(c.material)}</dd>
        <dt>Issued</dt><dd data-testid="certificate-issued">${esc(c.issuedAt)}</dd>
      </dl>`;
  } catch (e) {
    root.innerHTML = `
      <h1>Certificate of Authenticity</h1>
      <p data-testid="certificate-missing">${esc((e as Error).message)}</p>`;
  }
  markReady();
}

function renderSizeGuideWindow(): void {
  mountStandalone('size-guide-view', 'Size & Fit Guide | Maison', `
    <h1>Size &amp; Fit Guide</h1>
    <table class="size-table">
      <caption class="tiny">All measurements in inches</caption>
      <thead><tr><th scope="col">Size</th><th scope="col">Chest</th><th scope="col">Waist</th></tr></thead>
      <tbody>
        <tr><th scope="row">XS</th><td>34</td><td>28</td></tr>
        <tr><th scope="row">S</th><td>36</td><td>30</td></tr>
        <tr><th scope="row">M</th><td>38</td><td>32</td></tr>
        <tr><th scope="row">L</th><td>40</td><td>34</td></tr>
        <tr><th scope="row">XL</th><td>42</td><td>36</td></tr>
      </tbody>
    </table>
    <p class="muted">Measurements are approximate. Our pieces fit true to size.</p>`);
  markReady();
}

function renderShareWindow(kind: string, id: string): void {
  const views: Record<string, { testid: string; title: string; body: string }> = {
    link: {
      testid: 'share-link-view', title: 'Share — Copy Link | Maison',
      body: `<p>Copy this internal link to share the piece:</p><code data-testid="share-link-value">/product/${esc(id)}</code>`,
    },
    email: {
      testid: 'share-email-view', title: 'Share — Email | Maison',
      body: `<p>Share this piece by email.</p><p data-testid="share-email-subject">A piece from Maison</p>`,
    },
    preview: {
      testid: 'share-preview-view', title: 'Share — Preview | Maison',
      body: `<p data-testid="share-preview-body">Preview of product #${esc(id)}.</p>`,
    },
  };
  const cfg = views[kind] ?? views.link;
  mountStandalone(cfg.testid, cfg.title, `<h1>Share this piece</h1>${cfg.body}`);
  markReady();
}
```

- [ ] **Step 2: Add the path dispatcher at the top of `boot()`**

Change the start of `boot()` so it dispatches standalone routes before any normal app setup:

```ts
async function boot(): Promise<void> {
  const path = location.pathname;
  const certMatch = path.match(/^\/certificate\/([^/]+)$/);
  if (certMatch) return renderCertificateWindow(certMatch[1]);
  if (path === '/size-guide') return renderSizeGuideWindow();
  const shareMatch = path.match(/^\/share\/([^/]+)\/([^/]+)$/);
  if (shareMatch) return renderShareWindow(shareMatch[2], shareMatch[1]);

  renderHeader();
  try { const r = await api.categories() as { categories: string[] }; state.categories = r.categories; } catch { /* ignore */ }
  await refreshSession();
  renderHeader();
  await refreshCart();
  window.addEventListener('hashchange', router);
  await router();
  document.body.setAttribute('data-app-ready', 'true');
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run build:web
```

Expected: builds with no errors.

- [ ] **Step 4: Commit (source only)**

```bash
git add web/src/app.ts
git commit -m "feat: add standalone certificate/size-guide/share window views"
```

---

## Task 8: Rebuild and commit web/dist

**Files:**
- Modify: `web/dist/**` (generated)

- [ ] **Step 1: Rebuild the web bundle**

```bash
npm run build:web
```

- [ ] **Step 2: Manually smoke-check the windows render**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run build:server && node server/dist/index.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/certificate/1   # expect 200 (SPA fallback)
curl -s http://localhost:4000/api/v1/products/1/certificate                    # expect certificate JSON
lsof -ti:4000 | xargs kill 2>/dev/null; true
```

Expected: `/certificate/1` returns 200 (index.html); the API returns the certificate envelope.

- [ ] **Step 3: Commit the built bundle**

```bash
git add web/dist
git commit -m "build: rebuild web/dist with certificate and window views"
```

---

## Task 9: UI multi-window tests

**Files:**
- Modify: `tests/ui.spec.ts`

- [ ] **Step 1: Append the multi-window test block**

Add at the end of `tests/ui.spec.ts`:

```ts
test.describe('UI · multi-window', () => {
  test('certificate link opens a new tab with the certificate view', async ({ page, context }) => {
    await page.goto(BASE + '#/product/1');
    await expect(page.getByTestId('product-detail')).toBeVisible();

    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('certificate-link').click(),
    ]);
    await expect(tab.getByTestId('certificate-view')).toBeVisible();
    await expect(tab).toHaveTitle('Certificate of Authenticity | Maison');
    await expect(tab.getByTestId('certificate-serial')).toHaveText('MAISON-AC-0001');
    await expect(tab.getByTestId('certificate-product')).toHaveText('Noir Saffiano Tote');
  });

  test('size & fit guide opens a popup window', async ({ page }) => {
    await page.goto(BASE + '#/product/1');
    await expect(page.getByTestId('product-detail')).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByTestId('size-guide-button').click(),
    ]);
    await expect(popup.getByTestId('size-guide-view')).toBeVisible();
    await expect(popup).toHaveTitle('Size & Fit Guide | Maison');
  });

  test('share opens exactly three popup windows from one click', async ({ page, context }) => {
    await page.goto(BASE + '#/product/1');
    await expect(page.getByTestId('product-detail')).toBeVisible();
    const before = context.pages().length;

    const [w1, w2, w3] = await Promise.all([
      page.waitForEvent('popup'),
      page.waitForEvent('popup'),
      page.waitForEvent('popup'),
      page.getByTestId('share-all-button').click(),
    ]);

    // Exactly three new windows, no more.
    expect(context.pages().length).toBe(before + 3);

    const titles = await Promise.all([w1.title(), w2.title(), w3.title()]);
    expect(new Set(titles)).toEqual(new Set([
      'Share — Copy Link | Maison',
      'Share — Email | Maison',
      'Share — Preview | Maison',
    ]));

    // Each window exposes its root data-testid.
    for (const w of [w1, w2, w3]) {
      const hasRoot = await w.locator(
        '[data-testid="share-link-view"], [data-testid="share-email-view"], [data-testid="share-preview-view"]'
      ).count();
      expect(hasRoot).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run the UI tests**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:ui -- -g "multi-window"
```

Expected: PASS — all three multi-window tests green.

- [ ] **Step 3: Commit**

```bash
git add tests/ui.spec.ts
git commit -m "test: add UI multi-window coverage (new tab, popup, three-at-once)"
```

---

## Task 10: Security tests

**Files:**
- Modify: `tests/security.spec.ts`

- [ ] **Step 1: Append the certificate security block**

Add at the end of `tests/security.spec.ts`:

```ts
test.describe('Security · certificate', () => {
  async function login(request: any, email: string) {
    const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    const { token } = await res.json();
    return { Cookie: `maison_token=${token}` };
  }

  test('POST certificate enforces auth, role, and ownership (no IDOR)', async ({ request }) => {
    // unauthenticated
    expect((await request.post(`${API}/products/1/certificate`)).status()).toBe(401);
    // buyer (wrong role)
    const buyer = await login(request, 'buyer@maison.test');
    expect((await request.post(`${API}/products/1/certificate`, { headers: buyer })).status()).toBe(403);
    // non-owning seller (product 1 belongs to seller1)
    const seller2 = await login(request, 'seller2@maison.test');
    const idor = await request.post(`${API}/products/1/certificate`, { headers: seller2 });
    expect(idor.status()).toBe(403);
    expect((await idor.json()).error.code).toBe('FORBIDDEN_NOT_OWNER');
  });

  test('certificate SQL stays parameterized (injection in id yields 404, not error)', async ({ request }) => {
    const res = await request.get(`${API}/products/${encodeURIComponent('1 OR 1=1')}/certificate`);
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('CERTIFICATE_NOT_FOUND');
  });

  test('certificate view output-escapes the product name (no XSS)', async ({ request, page }) => {
    // Create a product with a markup-laden name, then issue its certificate.
    const seller = await login(request, 'seller@maison.test');
    const payload = '<img src=x onerror="window.__xss=1">';
    const created = await request.post(`${API}/products`, {
      headers: seller,
      data: { name: payload, priceCents: 1000, stock: 1, category: 'Bags' },
    });
    const { product } = await created.json();
    await request.post(`${API}/products/${product.id}/certificate`, { headers: seller });

    await page.goto(`${BASE}/certificate/${product.id}`);
    await expect(page.getByTestId('certificate-view')).toBeVisible();
    // The payload renders inert as text, and no injected handler fired.
    await expect(page.getByTestId('certificate-product')).toHaveText(payload);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the security tests**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:security -- -g "certificate"
```

Expected: PASS — all three certificate security tests green.

- [ ] **Step 3: Commit**

```bash
git add tests/security.spec.ts
git commit -m "test: add certificate security coverage (authz, IDOR, SQLi, XSS)"
```

---

## Task 11: Accessibility tests

**Files:**
- Modify: `tests/a11y.spec.ts`

- [ ] **Step 1: Enable the AxeBuilder import**

Change line 2 of `tests/a11y.spec.ts` from the commented import to a real import:

```ts
import AxeBuilder from '@axe-core/playwright';
```

- [ ] **Step 2: Append the standalone-window a11y block**

Add at the end of `tests/a11y.spec.ts`:

```ts
test.describe('Accessibility · standalone windows', () => {
  test('certificate view passes axe-core', async ({ page }) => {
    await page.goto(BASE + '/certificate/1');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.getByTestId('certificate-view')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('size-guide view passes axe-core', async ({ page }) => {
    await page.goto(BASE + '/size-guide');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.getByTestId('size-guide-view')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the a11y tests**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:a11y -- -g "standalone windows"
```

Expected: PASS. If axe reports a violation (e.g. contrast or a missing label), fix the corresponding markup in `renderCertificateWindow`/`renderSizeGuideWindow` (rebuild `web/dist`), then re-run.

- [ ] **Step 4: Commit**

```bash
git add tests/a11y.spec.ts
git commit -m "test: add axe-core coverage for certificate and size-guide views"
```

---

## Task 12: Mobile test

**Files:**
- Modify: `tests/mobile.spec.ts`

- [ ] **Step 1: Append the mobile certificate test**

Add at the end of `tests/mobile.spec.ts`, inside the existing `Mobile · responsive layout` describe block (which already sets `test.use({ viewport: { width: 375, height: 812 } })`), or as a new describe that re-sets the viewport. Use a new describe to be explicit:

```ts
test.describe('Mobile · certificate', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('certificate link is reachable and opens a new tab on mobile', async ({ page, context }) => {
    await page.goto(BASE + '#/product/1');
    await expect(page.getByTestId('product-detail')).toBeVisible();

    const link = page.getByTestId('certificate-link');
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();

    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      link.click(),
    ]);
    await expect(tab.getByTestId('certificate-view')).toBeVisible();
    await expect(tab).toHaveTitle('Certificate of Authenticity | Maison');
  });
});
```

- [ ] **Step 2: Run the mobile test**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:mobile -- -g "certificate"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/mobile.spec.ts
git commit -m "test: add mobile certificate-link reachability coverage"
```

---

## Task 13: Full verification

- [ ] **Step 1: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both pass with no errors.

- [ ] **Step 2: Run the entire suite from a clean server**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm test
```

Expected: all pillars green (existing + new tests). Report the actual summary output.

- [ ] **Step 3: Confirm web/dist is committed and tree is clean**

```bash
git status --porcelain
```

Expected: empty (no uncommitted changes). If `web/dist` shows changes, run `npm run build:web`, commit, and re-run the suite.

- [ ] **Step 4: Update AGENTS.md API surface table**

Add two rows to the API table in `AGENTS.md` §5 (under the products section):

```
| GET | `/products/:id/certificate` | – | certificate of authenticity, or 404 |
| POST | `/products/:id/certificate` | seller (owner) | (re)issue certificate, idempotent |
```

Also add `certificates` to the Tables list in §6. Commit:

```bash
git add AGENTS.md
git commit -m "docs: document certificate routes and table in AGENTS.md"
```

---

## Self-review notes

- **Spec coverage:** model (Task 2) · serialization (Task 3) · GET+POST routes with `FORBIDDEN_NOT_OWNER` (Task 4) · API client (Task 5) · triggers with required testids (Task 6) · standalone views with deterministic titles + root testids + seal (Task 7) · build/dist (Task 8) · UI/Security/A11y/Mobile pillars (Tasks 9–12) · acceptance criteria all mapped to tests.
- **Determinism:** serial `MAISON-AC-0001`, issuer `Maison Atelier`, material `Full-grain leather` (Bags), issued `2024-01-01` — asserted in Task 1.
- **Type consistency:** `SerializedCertificate` / `Certificate` field names (`productId`, `productName`, `serialNo`, `issuer`, `material`, `issuedAt`) are identical across server (Task 3) and web (Task 6) and asserted identically in tests.
- **Security:** server-derived serial/issuer/material can't carry injected payloads; XSS surface (`productName`) is escaped and tested (Task 10); SQL parameterized + injection test (Task 10).
