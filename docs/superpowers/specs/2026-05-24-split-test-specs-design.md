# Split Test Specs — Design

**Date:** 2026-05-24
**Status:** Approved

## Goal

Replace the monolithic `tests/maison.spec.js` with five focused spec files — one per testing pillar — and wire up per-suite npm scripts, parallel GHA jobs, and updated docs.

## Spec files

Delete `tests/maison.spec.js`. Create:

| File | Pillar | Migrated describe blocks |
|---|---|---|
| `tests/ui.spec.js` | UI | `UI · buyer purchase flow`, `UI · seller dashboard` |
| `tests/mobile.spec.js` | Mobile | `Mobile · responsive layout` |
| `tests/api.spec.js` | API | `API · contract` |
| `tests/security.spec.js` | Security | `Security · authorization` |
| `tests/a11y.spec.js` | Accessibility | `Accessibility · WCAG` |

Each file carries the shared header:
```js
import { test, expect } from '@playwright/test';
const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';
test.beforeEach(async ({ request }) => { await request.post(`${API}/_reset`); });
```

`a11y.spec.js` keeps the `AxeBuilder` import commented (matching the original). `mobile.spec.js` keeps `test.use({ viewport })` inside the describe block.

## package.json scripts

```json
"test":          "playwright test",
"test:open":     "playwright test --ui",
"test:debug":    "playwright test --debug",
"test:ui":       "playwright test tests/ui.spec.js",
"test:mobile":   "playwright test tests/mobile.spec.js",
"test:api":      "playwright test tests/api.spec.js",
"test:security": "playwright test tests/security.spec.js",
"test:a11y":     "playwright test tests/a11y.spec.js",
"test:smoke":    "node verify.mjs"
```

`test` (no suffix) runs all five files — the run-all command. `test:open` replaces the old `test:ui` for Playwright's interactive UI mode.

## playwright.config.js

No changes. `testDir: './tests'` already discovers all `*.spec.js` files.

## GitHub Actions — `.github/workflows/playwright.yml`

Five parallel jobs: `test-ui`, `test-mobile`, `test-api`, `test-security`, `test-a11y`.

Each job is self-contained:
1. `actions/checkout@v5`
2. `actions/setup-node@v5` (node 24, npm cache)
3. `npm ci`
4. `npx playwright install --with-deps chromium`
5. `npm start &`
6. Health-check loop (30 × 1 s)
7. `npm run test:<suite>`
8. `actions/upload-artifact@v5` — artifact name `playwright-report-<suite>`, `test-results-<suite>`
9. `pkill -f "server/src/index.js" || true` (always)

Timeout per job: 15 min (down from 30 min for the old monolith job).

## README changes

- Intro sentence: "four testing pillars" → "five testing pillars: UI, Mobile, API, Accessibility, and Security"
- Architecture tree: replace `maison.spec.js` entry with the five spec files
- "Running the sample tests" section: add per-suite `npm run test:*` commands and clarify `npm test` runs all suites
