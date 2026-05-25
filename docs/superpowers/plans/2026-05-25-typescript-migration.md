# TypeScript Migration Implementation Plan

> **You are doing this yourself.** This plan tells you exactly what to rename, what types to add to each function, and what to watch out for. Work through each phase in order — earlier phases are prerequisites for later ones.

**Goal:** Convert every `.js`/`.mjs` file in the project to TypeScript, add a build step for the server, wire up ESLint, and update CI.

**Architecture:** Three independent compile units — server (NodeNext, compiles to `server/dist/`), web frontend (ESNext+DOM, compiles to `web/dist/src/`), and tests (Playwright handles TS natively, no emit). Server always runs from compiled output after migration.

**Tech Stack:** TypeScript 5, typescript-eslint 8, ESLint 9, tsx (runs `verify.ts`), @types/express 5, @types/node 22, @types/bcryptjs, @types/cookie-parser.

---

## Important: TypeScript ESM Import Gotcha

Because `"type": "module"` is set in both package.json files, and server uses `"module": "NodeNext"` in tsconfig, **you must keep `.js` extensions in all server imports — even in `.ts` files**. This is correct TypeScript ESM behaviour: `tsc` knows to resolve `.js` → `.ts` at compile time.

```ts
// CORRECT — keep .js even in .ts files (server only)
import { seed, SEED_INFO } from './db.js';
import { authenticate, fail } from './auth.js';

// WRONG — do not change extensions to .ts
import { seed, SEED_INFO } from './db.ts';
```

---

## Phase 1 — Install Dependencies & Create Config Files

Do this first. The server still runs from `.js` files at this point — nothing breaks.

---

### Step 1.1 — Install root devDependencies

In the **root** directory (`/maison/`), run:

```bash
npm install --save-dev typescript@^5 typescript-eslint@^8 eslint@^9 @eslint/js@^9 tsx@^4
```

---

### Step 1.2 — Install server devDependencies

In `server/`:

```bash
cd server && npm install --save-dev typescript@^5 @types/express@^5 @types/bcryptjs@^2 @types/cookie-parser@^1 @types/node@^22
```

---

### Step 1.3 — Create `server/tsconfig.json`

Create this file exactly:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

---

### Step 1.4 — Create root `tsconfig.json`

Create at the project root (`/maison/tsconfig.json`). This is for editor support and Playwright — it does not emit JS:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["tests/**/*", "playwright.config.ts", "verify.ts"]
}
```

---

### Step 1.5 — Create `web/tsconfig.json`

Create at `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Node",
    "lib": ["DOM", "ES2022", "DOM.Iterable"],
    "outDir": "./dist/src",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

---

### Step 1.6 — Create `eslint.config.js`

Create at the project root:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  {
    ignores: ['server/dist/**', 'web/dist/**', 'node_modules/**'],
  },
);
```

---

### Step 1.7 — Update scripts in root `package.json`

Replace the `"scripts"` block in `package.json` with:

```json
"scripts": {
  "postinstall": "cd server && npm install",
  "build:server": "npm run build --prefix server",
  "build:web": "tsc -p web/tsconfig.json",
  "build": "npm run build:server && npm run build:web",
  "start": "npm run build:server && node server/dist/index.js",
  "lint": "eslint .",
  "typecheck": "tsc -p server/tsconfig.json --noEmit && tsc -p web/tsconfig.json --noEmit",
  "test:smoke": "tsx verify.ts",
  "test:ui": "playwright test tests/ui.spec.ts",
  "test:mobile": "playwright test tests/mobile.spec.ts",
  "test:api": "playwright test tests/api.spec.ts",
  "test:security": "playwright test tests/security.spec.ts",
  "test:a11y": "playwright test tests/a11y.spec.ts",
  "test": "playwright test"
}
```

---

### Step 1.8 — Update scripts in `server/package.json`

Replace the `"scripts"` block and bump the version:

```json
"version": "1.1.0",
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsc --watch"
}
```

---

## Phase 2 — Server: Types Declaration File

Create this before migrating any `.ts` files, because route files will need the augmented `Request` type.

---

### Step 2.1 — Create `server/src/types.d.ts`

This file augments the Express `Request` type so `req.user` and `req.tokenInvalid` are typed everywhere without casting.

```ts
import type { JwtPayload } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | null;
      tokenInvalid?: boolean;
    }
  }
}

export {};
```

> **Note:** The `export {}` at the bottom is required to make this a module (not a script). Without it, the `declare global` won't work correctly.

---

## Phase 3 — Server Files (migrate bottom-up in dependency order)

Rename each `.js` to `.ts` and add types. The order below matters — each file only imports from files already converted.

---

### Step 3.1 — `server/src/db.js` → `server/src/db.ts`

**Rename the file first.** Then add these DB row interfaces right after the imports, and add return types to the exported functions.

**Interfaces to add** (put them before the `db` const):

```ts
export interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: 'buyer' | 'seller';
  created_at: string;
}

export interface DbProduct {
  id: number;
  seller_id: number;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  stock: number;
  published: number;
  created_at: string;
}

export interface DbCartItem {
  id: number;
  cart_id: number;
  product_id: number;
  quantity: number;
}

export interface DbOrder {
  id: number;
  buyer_id: number;
  reference: string;
  status: string;
  total_cents: number;
  shipping_json: string;
  created_at: string;
}

export interface DbOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  name: string;
  quantity: number;
  unit_price_cents: number;
}
```

**Return types to add to functions:**

- `initSchema(): void`
- `seed(): void`
- `placeholderImage(label: string, hue?: string): string`

**The `node:sqlite` cast pattern** — `db.prepare().get()` returns `unknown`, so you must cast:

```ts
// Everywhere you call .get() in db.ts, cast the result:
const hash = bcrypt.hashSync(SEED_PASSWORD, 8);

// .run() returns RunResult — no cast needed
const seller1 = insUser.run('seller@maison.test', hash, 'Atelier Maison', 'seller').lastInsertRowid;
// lastInsertRowid is number | bigint, so use Number() when passing as a number:
const seller1Id = Number(insUser.run('seller@maison.test', hash, 'Atelier Maison', 'seller').lastInsertRowid);
```

> **Gotcha:** `lastInsertRowid` is typed as `number | bigint`. Wrap it in `Number()` when you use it as a numeric ID (e.g. as a SQL parameter or as an owner comparison).

---

### Step 3.2 — `server/src/pricing.js` → `server/src/pricing.ts`

**Rename the file.** Add these interfaces and update return types.

**Interfaces to add** (put them after the import):

```ts
import type { DbProduct } from './db.js';

export interface Discount {
  type: 'percentage' | 'fixed';
  value: number;
  active: number;
}

export interface SerializedProduct {
  id: number;
  sellerId: number;
  sellerName: string | null;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  effectiveCents: number;
  onSale: boolean;
  discount: { type: string; value: number } | null;
  stock: number;
  inStock: boolean;
  published: boolean;
  images: string[];
  image: string | null;
}
```

**Return types to add:**

- `effectivePrice(priceCents: number, discount: Discount | null | undefined): number`
- `serializeProduct(row: DbProduct): SerializedProduct`
- `money(cents: number): string`
- `stmts()` — internal helper, no return type needed (TypeScript infers it)

**The `.get()` / `.all()` cast pattern** — inside `serializeProduct` and `stmts()`, you'll need casts:

```ts
// In serializeProduct:
const images = (imagesStmt.all(row.id) as Array<{ url: string }>).map(r => r.url);
const discount = (discountStmt.get(row.id) as Discount | undefined) ?? null;
const seller = sellerStmt.get(row.seller_id) as { name: string } | undefined;
```

---

### Step 3.3 — `server/src/auth.js` → `server/src/auth.ts`

**Rename the file.** Add imports for Express types and define the JWT payload interface.

**Add to the top of the file** (after existing imports):

```ts
import type { Request, Response, NextFunction } from 'express';
import type { JwtPayload as JwtVerifyPayload } from 'jsonwebtoken';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  name: string;
  iat?: number;
  exp?: number;
}
```

**Return types to add:**

```ts
export function signToken(user: { id: number; email: string; role: string; name: string }): string

export function fail(res: Response, status: number, code: string, message: string): Response

export function authenticate(req: Request, _res: Response, next: NextFunction): void

export function requireAuth(req: Request, res: Response, next: NextFunction): void

export function requireRole(role: string): (req: Request, res: Response, next: NextFunction) => void
```

**The `jwt.verify()` cast** — `jwt.verify()` returns `string | JwtVerifyPayload`. Cast it:

```ts
req.user = jwt.verify(token, SECRET) as JwtPayload;
```

---

### Step 3.4 — `server/src/routes/auth.js` → `server/src/routes/auth.ts`

**Rename the file.** Add Express type imports.

**Add to imports:**

```ts
import type { Request, Response } from 'express';
import type { DbUser } from '../db.js';
```

**Return types to add:**

- `validPassword(pw: unknown): boolean`
- `publicUser(u: DbUser): { id: number; email: string; name: string; role: string }`

**The `.get()` / `.run()` cast pattern** — you'll need casts on every `db.prepare(...).get(...)` call:

```ts
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser;
```

**Note on `req.body`:** TypeScript types `req.body` as `any` in Express 4, which is fine. In Express 5 with `@types/express@^5`, it's also `any`. No cast needed.

**Note on `req.user.sub`:** Because you augmented `Request` in `types.d.ts`, `req.user` is `JwtPayload | null | undefined`. You'll need a null check before accessing `.sub`:

```ts
// In routes where requireAuth has already run, req.user is guaranteed non-null,
// but TypeScript doesn't know that. Cast or assert:
const user = db.prepare('SELECT * FROM users WHERE id = ?').get((req.user!).sub) as DbUser | undefined;
```

---

### Step 3.5 — `server/src/routes/products.js` → `server/src/routes/products.ts`

**Rename the file.** Add imports:

```ts
import type { Request, Response } from 'express';
import type { DbProduct } from '../db.js';
```

**Return types to add:**

- `getOwnedProduct(req: Request, res: Response): DbProduct | null`

**Cast pattern for all `.get()` calls:**

```ts
const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id)) as DbProduct | undefined;
```

**Discount route body typing:** `req.body.type` will be `any` — that's fine, validation is already there. No cast needed.

**Dynamic SQL build pattern** — the `fields` and `params` arrays will infer correctly, but if TypeScript complains about spreading params, type them explicitly:

```ts
const fields: string[] = [];
const params: (string | number)[] = [];
```

---

### Step 3.6 — `server/src/routes/cart.js` → `server/src/routes/cart.ts`

**Rename the file.** Add imports:

```ts
import type { Request, Response } from 'express';
import type { DbProduct, DbOrder } from '../db.js';
import type { SerializedProduct } from '../pricing.js';
```

**Interfaces to add** (for cart shapes — these are local to this file):

```ts
interface CartLine {
  itemId: number;
  productId: number;
  name: string;
  image: string | null;
  unitCents: number;
  quantity: number;
  lineCents: number;
  stock: number;
}

interface Cart {
  cartId: number;
  items: CartLine[];
  subtotalCents: number;
  count: number;
}
```

**Return types to add:**

- `getCartId(buyerId: number): number`
- `buildCart(buyerId: number): Cart`

**Cast pattern for all `.get()` / `.all()` calls:**

```ts
let cart = db.prepare('SELECT id FROM carts WHERE buyer_id = ?').get(buyerId) as { id: number } | undefined;
const items = db.prepare('...').all(cartId) as Array<{ itemId: number; quantity: number; productId: number }>;
const prow = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as DbProduct;
```

**Order route `.all()` cast:**

```ts
const rows = db.prepare('SELECT * FROM orders WHERE buyer_id = ? ...').all(req.user!.sub) as DbOrder[];
```

**Shipping type:** `req.body.shipping` is `any` — leave it as-is. The runtime validation is already there.

**`db.exec('BEGIN')` / `ROLLBACK`:** These have return type `void` — no cast needed.

---

### Step 3.7 — `server/src/index.js` → `server/src/index.ts`

**Rename the file.** Add Express type imports for the middleware functions.

**Add to imports:**

```ts
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
```

**Return types to add:**

- `rateLimit(req: Request, res: Response, next: NextFunction): void`

**The error handler** — Express requires a 4-argument error handler signature. TypeScript will enforce this. Change the error handler to:

```ts
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  console.error('[maison] unexpected error:', err);
  return fail(res, 500, 'INTERNAL', 'An unexpected error occurred.');
};
app.use(errorHandler);
```

> **Why the `ErrorRequestHandler` type alias?** If you write the function inline with `app.use((err, _req, res, _next) => {...})`, TypeScript may not infer the 4-argument signature correctly and will complain. The named variable with explicit type solves this.

**`hits` Map type:** The `hits` map will need a type:

```ts
const hits = new Map<string, { count: number; start: number }>();
```

---

### Step 3.8 — Verify the server compiles

```bash
cd server && npx tsc --noEmit
```

Fix any errors before continuing. Common issues:
- Missing casts on `.get()` calls (add `as DbUser` etc.)
- `req.user` access without null guard (add `!` or null check)
- `lastInsertRowid` used as `number` without `Number()` wrapper

Once `--noEmit` passes, do a real build:

```bash
npm run build --prefix server
```

Check that `server/dist/` was created with `.js` and `.js.map` files.

---

## Phase 4 — Web Frontend

The web frontend is JS files in `web/dist/src/`. The spec moves them to `web/src/` and compiles to `web/dist/src/`.

---

### Step 4.1 — Create `web/src/` directory and move files

```bash
mkdir -p web/src
cp web/dist/src/api.js web/src/api.ts
cp web/dist/src/app.js web/src/app.ts
```

> Do not delete the originals yet — wait until the build compiles successfully.

---

### Step 4.2 — Add types to `web/src/api.ts`

**Rename/copy is done. Now add types.**

**Add interfaces** (at the top of the file):

```ts
export interface ApiError extends Error {
  code: string;
  status: number;
  payload: unknown;
}

export interface ProductShape {
  id: number;
  sellerId: number;
  sellerName: string | null;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  effectiveCents: number;
  onSale: boolean;
  discount: { type: string; value: number } | null;
  stock: number;
  inStock: boolean;
  published: boolean;
  images: string[];
  image: string | null;
}

export interface CartShape {
  cartId: number;
  items: Array<{
    itemId: number;
    productId: number;
    name: string;
    image: string | null;
    unitCents: number;
    quantity: number;
    lineCents: number;
    stock: number;
  }>;
  subtotalCents: number;
  count: number;
}

export interface OrderShape {
  reference: string;
  status: string;
  totalCents: number;
  items: Array<{ name: string; quantity: number; unitCents: number }>;
  shipping: unknown;
}

export interface UserShape {
  id: number;
  email: string;
  name: string;
  role: 'buyer' | 'seller';
}
```

---

### Step 4.3 — Add types to `web/src/app.ts`

**Add Window augmentation** (at the top, before other code):

```ts
declare global {
  interface Window {
    __MAISON__?: unknown;
    __navAbort?: AbortController;
    __logout?: () => void;
  }
}
```

Any DOM element access like `document.querySelector(...)` returns `Element | null`. TypeScript will flag cases where you call methods that don't exist on `Element`. Cast to the specific element type:

```ts
// Common pattern in app.ts:
const el = document.querySelector<HTMLElement>('[data-testid="cart-count"]');
// or:
const form = document.querySelector('#login-form') as HTMLFormElement | null;
```

---

### Step 4.4 — Build the web frontend

```bash
npm run build:web
```

Check that `web/dist/src/api.js` and `web/dist/src/app.js` are regenerated from the TS source. Fix any type errors.

Once it builds, delete the originals you copied from:

```bash
# Only delete if the build succeeded and web/dist/src/ has fresh compiled files
rm web/dist/src/api.js web/dist/src/app.js
```

Wait — the `web/dist/src/` is now the OUTPUT of `tsc`. Do not manually place files there. The old JS files in `web/dist/src/` will be overwritten by the build. That's correct.

---

## Phase 5 — Playwright Config

---

### Step 5.1 — Rename `playwright.config.js` → `playwright.config.ts`

**Rename the file.** Remove the `// @ts-check` comment at the top (it's only for JS files).

The rest of the file is already typed because `defineConfig` and `devices` are TypeScript exports from `@playwright/test`. No other changes needed.

**Update the `webServer.command`** to use the compiled server:

```ts
webServer: {
  command: 'npm run build:server && node server/dist/index.js',
  url: 'http://localhost:4000',
  reuseExistingServer: true,
},
```

---

## Phase 6 — Test Files

Playwright natively runs `.ts` spec files — no compilation step needed, no tsconfig changes needed for the tests themselves.

---

### Step 6.1 — Rename all test files

Rename (do not change content yet):

- `tests/ui.spec.js` → `tests/ui.spec.ts`
- `tests/api.spec.js` → `tests/api.spec.ts`
- `tests/mobile.spec.js` → `tests/mobile.spec.ts`
- `tests/security.spec.js` → `tests/security.spec.ts`
- `tests/a11y.spec.js` → `tests/a11y.spec.ts`

---

### Step 6.2 — Check for TypeScript errors in test files

Run:

```bash
npx tsc --noEmit
```

(This uses the root `tsconfig.json` which covers the `tests/` directory.)

Playwright test files rarely need explicit types — `test`, `expect`, and `Page` are inferred. But if a test uses `page.evaluate(() => ...)` with return values, TypeScript will want a return type:

```ts
// If you have:
const value = await page.evaluate(() => window.__MAISON__);
// TypeScript will type value as unknown — that's fine.
```

Fix any errors reported.

---

## Phase 7 — verify.ts

---

### Step 7.1 — Rename `verify.mjs` → `verify.ts`

**Rename the file.** Make two changes to the content:

**1. Remove `--experimental-sqlite`** from the spawn call (SQLite is stable in Node 24):

```ts
// BEFORE:
const srv = spawn('node', ['--experimental-sqlite', 'server/src/index.js'], {

// AFTER:
const srv = spawn('node', ['server/dist/index.js'], {
```

**2. Add return types to the two main functions:**

```ts
function check(label: string, cond: boolean, detail = ''): void { ... }
function setCookies(res: Response): void { ... }  // Response from node-fetch or built-in fetch
async function call(method: string, path: string, body?: unknown, useAuth?: boolean): Promise<{ status: number; json: unknown; headers: Headers }> { ... }
const login = (email: string) => call('POST', '/auth/login', { email, password: 'Password123!' });
async function waitForHealth(): Promise<boolean> { ... }
async function run(): Promise<void> { ... }
```

> **Note:** The global `fetch` in Node 24 returns a `Response` from the built-in `undici` types, included via `@types/node@^22`. No import needed.

**3. Fix the `jar` object type:**

```ts
const jar: { token?: string } = {};
```

---

### Step 7.2 — Test verify.ts runs

```bash
npm run build:server && npm run test:smoke
```

---

## Phase 8 — CI Pipeline

---

### Step 8.1 — Update `.github/workflows/playwright.yml`

Find the CI workflow file. Make these changes:

**Add a new `lint` job** at the top of the `jobs:` block (before existing test jobs):

```yaml
lint:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '24'
        cache: 'npm'
    - run: npm ci
    - run: npm run typecheck
    - run: npm run lint
```

**Update all 5 test jobs** to:
1. Add `needs: [lint]` at the top of each job
2. Add `npm run build:server` as a step before starting the server

The step that currently says something like `npm start &` should become:

```yaml
- run: npm run build:server
- run: npm start &
```

Or if `npm start` already calls build (which it does after Step 1.7), just keep `npm start &` and it will build first. Check your existing CI file to see which form it uses.

---

## Phase 9 — Final Verification

---

### Step 9.1 — Full typecheck

```bash
npm run typecheck
```

Both server and web must pass with zero errors.

---

### Step 9.2 — Lint

```bash
npm run lint
```

Fix any `@typescript-eslint/no-unused-vars` errors (these are real bugs, not noise). `@typescript-eslint/no-explicit-any` is a warning — fine to leave.

---

### Step 9.3 — Build everything

```bash
npm run build
```

---

### Step 9.4 — Smoke test

```bash
npm run test:smoke
```

All checks should pass. If the server doesn't come up, check that `server/dist/index.js` exists (from Step 3.8).

---

### Step 9.5 — Full Playwright test suite

```bash
npm test
```

---

## Quick Reference: Types At a Glance

| File | Key types you add |
|---|---|
| `db.ts` | `DbUser`, `DbProduct`, `DbCartItem`, `DbOrder`, `DbOrderItem` interfaces |
| `pricing.ts` | `Discount`, `SerializedProduct` interfaces |
| `auth.ts` | `JwtPayload` interface; `Request/Response/NextFunction` on all functions |
| `types.d.ts` | Express `Request` augmentation (`user?`, `tokenInvalid?`) |
| `routes/auth.ts` | `publicUser()` return type; casts on `.get()` results |
| `routes/products.ts` | `getOwnedProduct()` return type; `fields/params` array types |
| `routes/cart.ts` | `CartLine`, `Cart` interfaces; `getCartId`/`buildCart` return types |
| `index.ts` | `ErrorRequestHandler` for error middleware; `Map<string, {...}>` for hits |
| `verify.ts` | `jar` type; async function return types; spawn target change |

## Common Cast Pattern (node:sqlite)

Every time you call `db.prepare(...).get(...)`, cast the result:

```ts
// Single row (may not exist):
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;

// Single row (known to exist after insert):
const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as DbProduct;

// Multiple rows:
const rows = db.prepare('SELECT * FROM orders WHERE buyer_id = ?').all(buyerId) as DbOrder[];

// Single value:
const rec = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM ...').get(id) as { m: number };
```

`lastInsertRowid` is `number | bigint` — wrap in `Number()` whenever you pass it as a SQL parameter or compare it numerically:

```ts
const id = Number(db.prepare('INSERT ...').run(...).lastInsertRowid);
```
