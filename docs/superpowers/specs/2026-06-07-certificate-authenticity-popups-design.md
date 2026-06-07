# Certificate of Authenticity + supporting product popups — Design

**Date:** 2026-06-07
**Status:** Approved
**Topic:** Multi-window automation surface on Product Detail (new-tab + popup + multi-popup) and an API-backed Certificate of Authenticity entity.

---

## 1. Goal & motivation

Maison is an Application Under Test for a Playwright framework spanning five pillars
(UI · Mobile · API · Accessibility · Security). This change adds a cluster of behaviours to
the Product Detail view that open separate browser windows/tabs, so the framework can exercise
**multi-window automation**, plus one new API-backed entity (certificates).

Three distinct open behaviours:

- **A. Certificate of Authenticity** — API-backed, opens in a **new tab**.
- **B. Size & Fit Guide** — frontend-only, opens as a **popup window**.
- **C. Share this piece** — frontend-only, opens **three popup windows at once**.

All opened targets are **internal SPA routes** served by the existing `app.get('*')` static
fallback. No external URLs, no new services.

### Design decisions (confirmed)

- **Window chrome:** opened windows render as **minimal standalone views** — their own
  `<main>` landmark, `lang`, single `<h1>`, root `data-testid`, and deterministic
  `document.title`. No masthead/nav/footer, no session or cart fetches. Keeps popups clean and
  axe-simple.
- **Certificate determinism:** fields derived from the product —
  `serial_no = MAISON-AC-<id padded to 4>`, `issuer = 'Maison Atelier'`,
  `material` derived from product category via a fixed mapping,
  `issued_at = '2024-01-01'` (constant). Fully reproducible, distinct per product.
- **Re-issue:** idempotent upsert. `UNIQUE(product_id)`; POST regenerates the same
  deterministic fields (DELETE+INSERT, like discounts). `issued_at` is the fixed constant,
  **not** `now()`, so repeated POSTs return identical data and tests stay stable.

---

## 2. Data model — `server/src/db.ts`

New table, FK to products, one row per product, idempotent by `product_id`:

```sql
CREATE TABLE certificates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL UNIQUE REFERENCES products(id),
  serial_no   TEXT NOT NULL,
  issuer      TEXT NOT NULL,
  material    TEXT NOT NULL,
  issued_at   TEXT NOT NULL          -- ISO date, deterministic constant
);
```

Added to `initSchema()` (with a matching `DROP TABLE IF EXISTS certificates;` ordered before
`products` so FK drops are clean). New `DbCertificate` interface exported alongside the others.

Deterministic helpers + constants in `db.ts`:

- `certificateSerial(productId: number): string` → `'MAISON-AC-' + String(productId).padStart(4, '0')`
  (e.g. `MAISON-AC-0001`).
- `const CERTIFICATE_ISSUER = 'Maison Atelier'`.
- `const CERTIFICATE_ISSUED_AT = '2024-01-01'`.
- `materialForCategory(category: string): string` → fixed mapping with a default, e.g.
  `Bags → 'Full-grain leather'`, `Watches → 'Stainless steel & sapphire'`,
  `Jewellery → '18k gold'`, `Footwear → 'Calfskin leather'`,
  `Fragrance → 'Crystal flacon'`, `Apparel → 'Natural fibre'`,
  `Accessories → 'Mixed materials'`, default `'Atelier-grade materials'`.

**Seed:** in the `seed()` product loop, after inserting each product, insert a certificate for
**every product owned by `seller@maison.test` (seller1 = seed indexes 0–10, products 1–11)**.
Products owned by seller2 (indexes 11+, products 12+) get **no** certificate → this drives the
GET 404 path. Uses a prepared `INSERT` statement.

No monetary value is stored on this table. Certificates carry no money field, so no new money
logic is introduced. (Were a monetary value ever shown, it would reuse `money()` from
`pricing.ts`.)

---

## 3. Serialization — `server/src/pricing.ts`

`serializeCertificate(row: DbCertificate): SerializedCertificate` → canonical JSON shape,
joining the product name so the frontend view needs a single fetch:

```ts
interface SerializedCertificate {
  id: number;
  productId: number;
  productName: string;     // joined from products
  serialNo: string;
  issuer: string;
  material: string;
  issuedAt: string;        // ISO date
}
```

A lazily-initialized prepared statement (`SELECT name FROM products WHERE id = ?`) follows the
existing `stmts()` pattern so it binds after the schema exists.

---

## 4. API routes — `server/src/routes/products.ts`

Added to the existing `/products` router → effective paths `/api/v1/products/:id/certificate`.
Parameterized statements only.

### Public — `GET /:id/certificate`

- `SELECT * FROM certificates WHERE product_id = ?` (prepared).
- Found → `res.json({ certificate: serializeCertificate(row) })` (standard success envelope).
- None → `fail(res, 404, 'CERTIFICATE_NOT_FOUND', 'No certificate exists for that product.')`.
- The certificate is returned regardless of product publish state; absence of a certificate is
  the 404 signal.

### Protected — `POST /:id/certificate`

- `requireRole('seller')` → 401 `UNAUTHENTICATED` (no token), 403 `FORBIDDEN_ROLE` (wrong role,
  e.g. buyer) via the existing helper.
- **Ownership** check inline (not via `getOwnedProduct`, because the spec mandates a distinct
  code): load the product; if missing → `fail(res, 404, 'PRODUCT_NOT_FOUND', ...)`; if
  `row.seller_id !== req.user.sub` → `fail(res, 403, 'FORBIDDEN_NOT_OWNER', ...)`. No IDOR.
- Idempotent upsert: `DELETE FROM certificates WHERE product_id = ?` then `INSERT` with the
  deterministic serial/issuer/material/issued_at.
- Respond `201` `{ certificate: serializeCertificate(row) }`.

**Authz matrix:** 401 (no token) · 403 `FORBIDDEN_ROLE` (buyer) · 403 `FORBIDDEN_NOT_OWNER`
(non-owning seller) · 201 (owning seller).

---

## 5. API client — `web/src/api.ts`

```ts
certificate: (id: number | string) => request('GET',  `/products/${id}/certificate`),
issueCertificate: (id: number | string) => request('POST', `/products/${id}/certificate`),
```

---

## 6. Frontend — triggers on Product Detail (`web/src/app.ts`, `pageProduct`)

A row of three triggers added below the existing CTA block. Stable testids on every trigger:

- **`certificate-link`** — `<a target="_blank" href="/certificate/${p.id}">View Certificate of
  Authenticity</a>`. A real anchor → opens a new **tab** (capturable via
  `context.waitForEvent('page')`).
- **`size-guide-button`** — `<button>`; `onclick` →
  `window.open('/size-guide', 'maison_size_guide', 'popup,width=480,height=640')` → true
  **popup** (capturable via `page.waitForEvent('popup')`).
- **`share-all-button`** — `<button>`; one `onclick` opens **three** popups:
  `/share/${p.id}/link`, `/share/${p.id}/email`, `/share/${p.id}/preview`, each via
  `window.open(url, uniqueName, 'popup,width=480,height=560')`.

All URLs are path-style internal routes served by `app.get('*')`. No external targets.

---

## 7. Frontend — standalone window views (`web/src/app.ts` bootstrap)

`boot()` gains an early **path dispatcher**, running before the hash router and before any
session/cart fetches:

```
const p = location.pathname;
if (p.startsWith('/certificate/')) return renderCertificateWindow(idFromPath);
if (p === '/size-guide')           return renderSizeGuideWindow();
if (p.startsWith('/share/'))       return renderShareWindow(kind, idFromPath);
// else: normal app boot (header, session, hash router)
```

Each window renderer:

- Replaces `<body>` content with a **minimal standalone** layout: one `<main role="main">`
  containing the root container (with its `data-testid`), an `<h1>`, and content.
- Sets `document.documentElement.lang = 'en'` and a deterministic `document.title`.
- No masthead/nav/footer; no session or cart calls.
- Sets `document.body[data-app-ready="true"]` at the end (consistent readiness signal).
- All dynamic/user-controlled strings pass through the existing `esc()` helper.

| Route | Root `data-testid` | `document.title` | Content |
|---|---|---|---|
| `/certificate/:id` | `certificate-view` | `Certificate of Authenticity \| Maison` | fetch `api.certificate(id)`; render serial, issuer, material, issued date, product name + inline-SVG seal. On 404 → escaped "no certificate" message, still with the root testid + title. |
| `/size-guide` | `size-guide-view` | `Size & Fit Guide \| Maison` | static deterministic size/fit table |
| `/share/:id/link` | `share-link-view` | `Share — Copy Link \| Maison` | static; shows internal link text |
| `/share/:id/email` | `share-email-view` | `Share — Email \| Maison` | static |
| `/share/:id/preview` | `share-preview-view` | `Share — Preview \| Maison` | static |

Titles are static and predictable — no timestamps, no random IDs.

**Authenticity seal:** a `certificateSeal()` helper builds a deterministic inline-SVG `data:`
URI (same style as `placeholderImage`), rendered via `<img alt="Maison authenticity seal">`,
consistent with existing imagery.

---

## 8. Build & test coverage (five pillars)

After frontend changes: `npm run build:web` and **commit `web/dist/`** (committed-and-served
gotcha). Verify with `npm run typecheck && npm run lint && npm test`.

- **API** (`api.spec.ts`): GET happy path (product 1 → `MAISON-AC-0001`, issuer/material/date),
  GET 404 `CERTIFICATE_NOT_FOUND` for product 12; POST matrix — 201 owner, 401 no-token,
  403 buyer, 403 non-owning seller; assert idempotent serial across two POSTs.
- **UI** (`ui.spec.ts`): `Promise.all` patterns — new tab via `context.waitForEvent('page')`,
  popup via `page.waitForEvent('popup')`, and share-all opens **exactly three**. Assert each
  window's title + root `data-testid`.
- **Security** (`security.spec.ts`): POST enforces auth + role + ownership (no IDOR); certificate
  fields output-escaped — realistic surface is `productName` (server-derived serial/issuer/
  material can't carry an injected payload), so seed/create a product whose name contains markup
  and assert it renders inert in `certificate-view`; SQL stays parameterized.
- **A11y** (`a11y.spec.ts`): axe on `/certificate/:id` and `/size-guide` (enable axe wiring).
- **Mobile** (`mobile.spec.ts`): certificate link reachable + opens under the mobile project
  config.

Implementation follows TDD (red → green) per pillar. Tests reset state via `POST /_reset` in
`beforeEach`.

---

## 9. Acceptance criteria

- GET `.../certificate` returns a seeded certificate for a seeded product, 404
  `CERTIFICATE_NOT_FOUND` for a product with none.
- POST `.../certificate` succeeds for the owning seller; 401 unauthenticated; 403 for a buyer or
  a non-owning seller (no IDOR).
- "View Certificate of Authenticity" opens a new tab capturable via
  `context.waitForEvent('page')`.
- "Size & Fit Guide" opens a popup capturable via `page.waitForEvent('popup')`.
- "Share this piece" opens exactly three windows from one action.
- Every opened window exposes its root `data-testid` and a deterministic title.
- All trigger testids present: `certificate-link`, `size-guide-button`, `share-all-button`.
- Production code paths stay secure: parameterized SQL, proper authz, `esc()` on output.
