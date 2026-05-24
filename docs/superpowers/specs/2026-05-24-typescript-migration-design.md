# TypeScript Migration Design — Maison

**Date:** 2026-05-24  
**Status:** Approved for implementation

---

## Objective

Convert the entire Maison project (Express server, vanilla-JS web frontend, Playwright tests, and CI pipeline) from JavaScript to TypeScript. Add ESLint as a quality gate in the CI workflow. Bump `server/package.json` to version `1.1.0`. Preserve all existing functionality and test coverage without regressions.

---

## Architecture

### Three TypeScript compilation units

| Layer | Source | Compiled output | Tooling |
|---|---|---|---|
| Server | `server/src/*.ts` | `server/dist/` | `tsc` (NodeNext) |
| Web frontend | `web/src/*.ts` | `web/dist/src/` | `tsc` (ESNext + DOM) |
| Tests + config | `tests/*.spec.ts`, `playwright.config.ts` | N/A (Playwright bundles natively) | Playwright's built-in TypeScript |

A root `tsconfig.json` provides editor/Playwright type context for tests. `verify.ts` replaces `verify.mjs` and is run with `tsx`. The `spawn` call inside `verify.ts` targets the **compiled** server (`server/dist/index.js`) — not the TypeScript source — and drops the `--experimental-sqlite` flag (stable in Node 24).

---

## File Changes

### New files
- `tsconfig.json` — root tsconfig (Playwright + test context)
- `eslint.config.js` — flat ESLint config with `typescript-eslint`
- `server/tsconfig.json` — server tsconfig (NodeNext, strict, outDir: dist)
- `server/src/types.d.ts` — Express request augmentation (`req.user`, `req.tokenInvalid`)
- `web/tsconfig.json` — web tsconfig (ESNext, DOM lib, outDir: dist/src)
- `web/src/api.ts` — typed API client (moved from `web/dist/src/api.js`)
- `web/src/app.ts` — typed SPA (moved from `web/dist/src/app.js`)

### Renamed (content updated with types)
- `server/src/index.js` → `server/src/index.ts`
- `server/src/auth.js` → `server/src/auth.ts`
- `server/src/db.js` → `server/src/db.ts`
- `server/src/pricing.js` → `server/src/pricing.ts`
- `server/src/routes/auth.js` → `server/src/routes/auth.ts`
- `server/src/routes/cart.js` → `server/src/routes/cart.ts`
- `server/src/routes/products.js` → `server/src/routes/products.ts`
- `tests/ui.spec.js` → `tests/ui.spec.ts`
- `tests/api.spec.js` → `tests/api.spec.ts`
- `tests/mobile.spec.js` → `tests/mobile.spec.ts`
- `tests/security.spec.js` → `tests/security.spec.ts`
- `tests/a11y.spec.js` → `tests/a11y.spec.ts`
- `playwright.config.js` → `playwright.config.ts`
- `verify.mjs` → `verify.ts`

### Deleted
- Original `.js` / `.mjs` versions after conversion

---

## TypeScript Configuration Details

### `server/tsconfig.json`
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

Import paths in server source keep `.js` extensions (TypeScript ESM convention; `tsc` resolves `.js` → `.ts` at compile time).

### `web/tsconfig.json`
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

### Root `tsconfig.json`
References `@playwright/test` and `@types/node` for test files. `noEmit: true`.

---

## Key Type Definitions

### `server/src/types.d.ts` — Express augmentation
Declares `req.user` (JWT payload) and `req.tokenInvalid` on the Express `Request` interface so all route handlers get type-safe access.

### `web/src/api.ts` — API types
Defines `ApiError` class (extends `Error` with `code`, `status`, `payload`), and response shape interfaces: `ProductShape`, `CartShape`, `OrderShape`, `UserShape`.

### `web/src/app.ts` — Window extensions
Augments `Window` with `__MAISON__`, `__navAbort`, `__logout` for the SPA's global state.

---

## Dependencies

### Root `package.json` additions (devDependencies)
- `typescript@^5`
- `typescript-eslint@^8`
- `eslint@^9`
- `@eslint/js@^9`
- `tsx@^4` (for running `verify.ts`)

### `server/package.json` additions (devDependencies)
- `typescript@^5`
- `@types/express@^5`
- `@types/bcryptjs@^2`
- `@types/cookie-parser@^1`
- `@types/node@^22`

### Version bump
`server/package.json` → `"version": "1.1.0"`

---

## Scripts

### Root `package.json`
| Script | Command |
|---|---|
| `build:server` | `npm run build --prefix server` |
| `build:web` | `tsc -p web/tsconfig.json` |
| `build` | `npm run build:server && npm run build:web` |
| `start` | `npm run build:server && node server/dist/index.js` |
| `lint` | `eslint .` |
| `typecheck` | `tsc -p server/tsconfig.json --noEmit && tsc -p web/tsconfig.json --noEmit` |
| `test:smoke` | `tsx verify.ts` |
| `test:ui` | `playwright test tests/ui.spec.ts` |
| `test:mobile` | `playwright test tests/mobile.spec.ts` |
| `test:api` | `playwright test tests/api.spec.ts` |
| `test:security` | `playwright test tests/security.spec.ts` |
| `test:a11y` | `playwright test tests/a11y.spec.ts` |
| `test` | `playwright test` |

### `server/package.json`
| Script | Command |
|---|---|
| `build` | `tsc` |
| `start` | `node dist/index.js` |
| `dev` | `tsc --watch` |

---

## ESLint Configuration

`eslint.config.js` (flat config, ESM):
- Base: `@eslint/js` recommended
- TypeScript: `typescript-eslint` recommended rules
- Ignores: `server/dist/**`, `web/dist/**`, `node_modules/**`
- Applied to: all `.ts` files in root, `server/src/`, `web/src/`, `tests/`

Key rules enabled:
- `@typescript-eslint/no-explicit-any: warn`
- `@typescript-eslint/no-unused-vars: error`
- `@typescript-eslint/explicit-function-return-type: off` (too noisy for this codebase)

---

## CI/CD Changes (`playwright.yml`)

### New `lint` job (runs first)
```yaml
lint:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - Checkout
    - Setup Node 24
    - npm ci
    - npm run typecheck   # type check server + web
    - npm run lint        # ESLint quality gate
```

### All 5 test jobs updated
- Add `needs: [lint]` — tests only run if lint passes
- Add `npm run build:server` step before `npm start &`
- `npm start` now runs `node server/dist/index.js` (compiled output)

---

## Invariants Preserved

- All Playwright test assertions unchanged — no test logic modified
- All Express API routes, middleware, and response envelopes unchanged
- All seed data, demo accounts, and DB schema unchanged
- Web frontend HTML, CSS, and `data-testid` attributes unchanged
- `verify.mjs` smoke-test checks all pass against identical server behaviour
- `webServer` config in `playwright.config.ts` unchanged (uses `npm start`)
