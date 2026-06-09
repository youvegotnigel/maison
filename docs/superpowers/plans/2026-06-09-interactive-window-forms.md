# Interactive Window Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static text in the five standalone window/tab views (certificate, size-guide, share-link, share-email, share-preview) with fill-and-submit forms that validate input and reveal a deterministic result, then add five-pillar test coverage and release v1.6.0.

**Architecture:** Each interaction lives inside the existing standalone-window renderers in `web/src/app.ts` (`renderCertificateWindow`, `renderSizeGuideWindow`, `renderShareWindow`). Each view gets a real `<form>` (labelled input + submit button) whose `submit` handler is attached after mount; on submit it validates and writes an escaped, deterministic result into an `aria-live` region. Pure client-side — no API, no network, no money logic.

**Tech Stack:** Vanilla TypeScript SPA (no framework/bundler, `tsc` → `web/dist`), Playwright + `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-06-09-interactive-window-forms-design.md`

---

## Critical gotchas (read before starting)

- **`reuseExistingServer: true`** in `playwright.config.ts`: a stale server on :4000 serves old code. Before EVERY test run: `lsof -ti:4000 | xargs kill 2>/dev/null; true`.
- **`web/dist/` is committed and served as-is.** After any `web/src/` change run `npm run build:web` and commit the rebuilt `web/dist/`. Smoke-checking against a running server requires `npm run build:web` first (the server serves `web/dist`, not `web/src`).
- **Escape all echoed user input** with the existing `esc()` helper (already defined in `app.ts`).
- **Single `<h1>` per window** and **`<label for>` on every input** — keeps axe green.
- The pre-existing testids (root `*-view`, titles, `certificate-serial`, `share-link-value`, etc.) and deterministic titles MUST stay unchanged so the v1.5.0 window tests keep passing.

---

## File structure

- **Modify** `web/src/app.ts` — add form markup + submit handlers inside the three standalone-window renderers; add a `recommendSize()` helper.
- **Rebuild** `web/dist/` (committed).
- **Modify** `tests/ui.spec.ts`, `tests/security.spec.ts`, `tests/a11y.spec.ts`, `tests/mobile.spec.ts`.
- **Modify** `package.json` + `package-lock.json` (version bump), `README.md`, `AGENTS.md` (release).

---

## Current code reference (the three renderers, `web/src/app.ts`)

For orientation — these are the functions you'll modify. `mountStandalone(rootTestId, title, innerHTML)` replaces `<body>` with a `<main>` containing a `<div data-testid="rootTestId">innerHTML</div>` and returns that div; `markReady()` sets `data-app-ready`; `esc()` escapes; `Certificate` interface has `serialNo`/`productName`/etc.

```ts
async function renderCertificateWindow(id: string): Promise<void> { /* fetch cert, render <dl class="cert">, markReady() */ }
function renderSizeGuideWindow(): void { /* render <table class="size-table">, markReady() */ }
function renderShareWindow(kind: string, id: string): void { /* views map: link/email/preview, mountStandalone, markReady() */ }
```

---

## Task 1: Certificate verify form

**Files:**
- Modify: `web/src/app.ts` (`renderCertificateWindow`)
- Test: `tests/ui.spec.ts`

- [ ] **Step 1: Write the failing UI test**

Append to `tests/ui.spec.ts` (inside the file; `BASE` already defined at top):

```ts
test.describe('UI · window forms · certificate', () => {
  test('verify form confirms a correct serial and rejects a wrong one', async ({ page }) => {
    await page.goto(BASE + '/certificate/1');
    await expect(page.getByTestId('certificate-view')).toBeVisible();

    // Wrong serial → error branch
    await page.getByTestId('certificate-serial-input').fill('NOPE');
    await page.getByTestId('certificate-verify-button').click();
    await expect(page.getByTestId('certificate-verify-error')).toBeVisible();

    // Correct serial → verified branch
    await page.getByTestId('certificate-serial-input').fill('MAISON-AC-0001');
    await page.getByTestId('certificate-verify-button').click();
    await expect(page.getByTestId('certificate-verified')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run build:web
npm run test:ui -- -g "window forms · certificate"
```
Expected: FAIL (form testids don't exist).

- [ ] **Step 3: Implement the form**

In `renderCertificateWindow`, change the success-branch `root.innerHTML = ...` so the `<dl>` is followed by a verify form and an `aria-live` result region, then wire the submit handler. Replace the success `try` block body with:

```ts
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
      </dl>
      <form class="window-form" data-testid="certificate-verify-form" novalidate>
        <label for="cert-serial">Verify a serial number</label>
        <input id="cert-serial" type="text" data-testid="certificate-serial-input" autocomplete="off" />
        <button type="submit" class="btn btn--sm" data-testid="certificate-verify-button">Verify</button>
      </form>
      <div class="window-result" aria-live="polite" data-testid="certificate-result"></div>`;
    const form = root.querySelector<HTMLFormElement>('[data-testid="certificate-verify-form"]')!;
    const out = root.querySelector<HTMLElement>('[data-testid="certificate-result"]')!;
    form.onsubmit = (e) => {
      e.preventDefault();
      const entered = root.querySelector<HTMLInputElement>('[data-testid="certificate-serial-input"]')!.value.trim();
      out.innerHTML = entered === c.serialNo
        ? `<p class="ok" data-testid="certificate-verified">✓ Verified authentic — ${esc(c.serialNo)}</p>`
        : `<p class="err" data-testid="certificate-verify-error">Serial does not match this certificate.</p>`;
    };
```

(The `catch` branch and trailing `markReady()` are unchanged.)

- [ ] **Step 4: Rebuild and run the test**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:ui -- -g "window forms · certificate"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/app.ts web/dist tests/ui.spec.ts
git commit -m "feat: add verify form to certificate window"
```

---

## Task 2: Size-guide "find my size" form

**Files:**
- Modify: `web/src/app.ts` (`renderSizeGuideWindow` + new `recommendSize` helper)
- Test: `tests/ui.spec.ts`

- [ ] **Step 1: Write the failing UI test**

Append to `tests/ui.spec.ts`:

```ts
test.describe('UI · window forms · size guide', () => {
  test('recommends a size from a chest measurement and rejects invalid input', async ({ page }) => {
    await page.goto(BASE + '/size-guide');
    await expect(page.getByTestId('size-guide-view')).toBeVisible();

    await page.getByTestId('size-chest-input').fill('38');
    await page.getByTestId('size-find-button').click();
    await expect(page.getByTestId('size-recommendation')).toHaveText('Recommended size: M');

    await page.getByTestId('size-chest-input').fill('');
    await page.getByTestId('size-find-button').click();
    await expect(page.getByTestId('size-find-error')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:ui -- -g "window forms · size guide"
```
Expected: FAIL.

- [ ] **Step 3: Add the `recommendSize` helper**

Add immediately above `renderSizeGuideWindow` in `web/src/app.ts`:

```ts
// Deterministic chest(inches) → size band, matching the size-table rows.
function recommendSize(chestInches: number): string {
  if (chestInches <= 34) return 'XS';
  if (chestInches <= 36) return 'S';
  if (chestInches <= 38) return 'M';
  if (chestInches <= 40) return 'L';
  return 'XL';
}
```

- [ ] **Step 4: Implement the form**

Change `renderSizeGuideWindow` to capture the mounted root, append the form, and wire it. Replace the whole function body with:

```ts
function renderSizeGuideWindow(): void {
  const root = mountStandalone('size-guide-view', 'Size & Fit Guide | Maison', `
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
    <p class="muted">Measurements are approximate. Our pieces fit true to size.</p>
    <form class="window-form" data-testid="size-find-form" novalidate>
      <label for="size-chest">Your chest measurement (inches)</label>
      <input id="size-chest" type="number" min="0" step="1" data-testid="size-chest-input" autocomplete="off" />
      <button type="submit" class="btn btn--sm" data-testid="size-find-button">Find my size</button>
    </form>
    <div class="window-result" aria-live="polite" data-testid="size-result"></div>`);
  const form = root.querySelector<HTMLFormElement>('[data-testid="size-find-form"]')!;
  const out = root.querySelector<HTMLElement>('[data-testid="size-result"]')!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const raw = root.querySelector<HTMLInputElement>('[data-testid="size-chest-input"]')!.value.trim();
    const n = Number(raw);
    out.innerHTML = raw !== '' && Number.isFinite(n)
      ? `<p class="ok" data-testid="size-recommendation">Recommended size: ${esc(recommendSize(n))}</p>`
      : `<p class="err" data-testid="size-find-error">Enter a chest measurement in inches.</p>`;
  };
  markReady();
}
```

- [ ] **Step 5: Rebuild and run the test**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:ui -- -g "window forms · size guide"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app.ts web/dist tests/ui.spec.ts
git commit -m "feat: add find-my-size form to size-guide window"
```

---

## Task 3: Share window forms (link, email, preview)

**Files:**
- Modify: `web/src/app.ts` (`renderShareWindow`)
- Test: `tests/ui.spec.ts`

- [ ] **Step 1: Write the failing UI test**

Append to `tests/ui.spec.ts`:

```ts
test.describe('UI · window forms · share', () => {
  test('share-link builds an internal link from a ref tag', async ({ page }) => {
    await page.goto(BASE + '/share/1/link');
    await expect(page.getByTestId('share-link-view')).toBeVisible();
    await page.getByTestId('share-link-ref-input').fill('spring');
    await page.getByTestId('share-link-build-button').click();
    await expect(page.getByTestId('share-link-result')).toHaveText('/product/1?ref=spring');
  });

  test('share-email validates and confirms', async ({ page }) => {
    await page.goto(BASE + '/share/1/email');
    await expect(page.getByTestId('share-email-view')).toBeVisible();

    await page.getByTestId('share-email-input').fill('not-an-email');
    await page.getByTestId('share-email-send-button').click();
    await expect(page.getByTestId('share-email-error')).toBeVisible();

    await page.getByTestId('share-email-input').fill('friend@example.com');
    await page.getByTestId('share-email-send-button').click();
    await expect(page.getByTestId('share-email-sent')).toHaveText('Shared with friend@example.com');
  });

  test('share-preview echoes a gift message', async ({ page }) => {
    await page.goto(BASE + '/share/1/preview');
    await expect(page.getByTestId('share-preview-view')).toBeVisible();
    await page.getByTestId('share-preview-message-input').fill('Happy birthday');
    await page.getByTestId('share-preview-apply-button').click();
    await expect(page.getByTestId('share-preview-message')).toHaveText('Your message: Happy birthday');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:ui -- -g "window forms · share"
```
Expected: FAIL.

- [ ] **Step 3: Implement the three share forms**

Replace the whole `renderShareWindow` function with the version below. Each view keeps its existing root testid/title/static line and adds a form + result region; a per-kind `wire` function attaches the submit handler.

```ts
function renderShareWindow(kind: string, id: string): void {
  const views: Record<string, {
    testid: string; title: string; body: string;
    wire: (root: HTMLElement) => void;
  }> = {
    link: {
      testid: 'share-link-view', title: 'Share — Copy Link | Maison',
      body: `
        <p>Copy this internal link to share the piece:</p>
        <code data-testid="share-link-value">/product/${esc(id)}</code>
        <form class="window-form" data-testid="share-link-form" novalidate>
          <label for="share-ref">Add a reference tag</label>
          <input id="share-ref" type="text" data-testid="share-link-ref-input" autocomplete="off" />
          <button type="submit" class="btn btn--sm" data-testid="share-link-build-button">Build link</button>
        </form>
        <div class="window-result" aria-live="polite" data-testid="share-link-out"></div>`,
      wire: (root) => {
        const form = root.querySelector<HTMLFormElement>('[data-testid="share-link-form"]')!;
        const out = root.querySelector<HTMLElement>('[data-testid="share-link-out"]')!;
        form.onsubmit = (e) => {
          e.preventDefault();
          const tag = root.querySelector<HTMLInputElement>('[data-testid="share-link-ref-input"]')!.value.trim();
          const link = tag ? `/product/${id}?ref=${tag}` : `/product/${id}`;
          out.innerHTML = `<code data-testid="share-link-result">${esc(link)}</code>`;
        };
      },
    },
    email: {
      testid: 'share-email-view', title: 'Share — Email | Maison',
      body: `
        <p>Share this piece by email.</p>
        <p data-testid="share-email-subject">A piece from Maison</p>
        <form class="window-form" data-testid="share-email-form" novalidate>
          <label for="share-email">Recipient email</label>
          <input id="share-email" type="text" data-testid="share-email-input" autocomplete="off" />
          <button type="submit" class="btn btn--sm" data-testid="share-email-send-button">Send</button>
        </form>
        <div class="window-result" aria-live="polite" data-testid="share-email-out"></div>`,
      wire: (root) => {
        const form = root.querySelector<HTMLFormElement>('[data-testid="share-email-form"]')!;
        const out = root.querySelector<HTMLElement>('[data-testid="share-email-out"]')!;
        form.onsubmit = (e) => {
          e.preventDefault();
          const email = root.querySelector<HTMLInputElement>('[data-testid="share-email-input"]')!.value.trim();
          out.innerHTML = email.length > 0 && email.includes('@')
            ? `<p class="ok" data-testid="share-email-sent">Shared with ${esc(email)}</p>`
            : `<p class="err" data-testid="share-email-error">Enter a valid email address.</p>`;
        };
      },
    },
    preview: {
      testid: 'share-preview-view', title: 'Share — Preview | Maison',
      body: `
        <p data-testid="share-preview-body">Preview of product #${esc(id)}.</p>
        <form class="window-form" data-testid="share-preview-form" novalidate>
          <label for="share-msg">Add a gift message</label>
          <input id="share-msg" type="text" data-testid="share-preview-message-input" autocomplete="off" />
          <button type="submit" class="btn btn--sm" data-testid="share-preview-apply-button">Add message</button>
        </form>
        <div class="window-result" aria-live="polite" data-testid="share-preview-out"></div>`,
      wire: (root) => {
        const form = root.querySelector<HTMLFormElement>('[data-testid="share-preview-form"]')!;
        const out = root.querySelector<HTMLElement>('[data-testid="share-preview-out"]')!;
        form.onsubmit = (e) => {
          e.preventDefault();
          const msg = root.querySelector<HTMLInputElement>('[data-testid="share-preview-message-input"]')!.value.trim();
          out.innerHTML = `<p data-testid="share-preview-message">Your message: ${esc(msg)}</p>`;
        };
      },
    },
  };
  const cfg = views[kind] ?? views.link;
  const root = mountStandalone(cfg.testid, cfg.title, `<h1>Share this piece</h1>${cfg.body}`);
  cfg.wire(root);
  markReady();
}
```

- [ ] **Step 4: Rebuild and run the test**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:ui -- -g "window forms · share"
```
Expected: PASS (all three share tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/app.ts web/dist tests/ui.spec.ts
git commit -m "feat: add link/email/preview forms to share windows"
```

---

## Task 4: Window-form styling

**Files:**
- Modify: `web/dist/styles.css`

- [ ] **Step 1: Append styles for the new form classes**

Add at the END of `web/dist/styles.css` (uses existing theme tokens like `var(--gold)`, `var(--cream)`, `var(--danger)`, `var(--line)`, `var(--sans)`):

```css
/* Interactive window forms (certificate / size guide / share) */
.window-form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin-top: 28px;
  max-width: 440px;
}
.window-form label {
  flex: 1 1 100%;
  font-family: var(--sans);
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.window-form input {
  flex: 1 1 200px;
  padding: 10px 12px;
  background: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--cream);
  font-family: var(--sans);
}
.window-result { margin-top: 16px; min-height: 1.2em; }
.window-result .ok { color: var(--gold); }
.window-result .err { color: var(--danger); }
```

- [ ] **Step 2: Re-run a11y to confirm contrast/labels still pass**

```bash
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:a11y -- -g "standalone windows"
```
Expected: PASS (axe clean). If a contrast violation appears, adjust the color token used and re-run.

- [ ] **Step 3: Commit**

```bash
git add web/dist/styles.css
git commit -m "style: add styling for the interactive window forms"
```

---

## Task 5: Security tests (XSS via free-text echoes)

**Files:**
- Modify: `tests/security.spec.ts`

- [ ] **Step 1: Write the failing/asserting security test**

Append to `tests/security.spec.ts`:

```ts
test.describe('Security · window forms', () => {
  test('share-preview message renders markup inert (no XSS)', async ({ page }) => {
    await page.goto(BASE + '/share/1/preview');
    await expect(page.getByTestId('share-preview-view')).toBeVisible();
    const payload = '<img src=x onerror="window.__xss=1">';
    await page.getByTestId('share-preview-message-input').fill(payload);
    await page.getByTestId('share-preview-apply-button').click();
    await expect(page.getByTestId('share-preview-message')).toHaveText('Your message: ' + payload);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('share-link ref tag renders inert (no XSS)', async ({ page }) => {
    await page.goto(BASE + '/share/1/link');
    await expect(page.getByTestId('share-link-view')).toBeVisible();
    const payload = '"><img src=x onerror="window.__xss2=1">';
    await page.getByTestId('share-link-ref-input').fill(payload);
    await page.getByTestId('share-link-build-button').click();
    await expect(page.getByTestId('share-link-result')).toHaveText('/product/1?ref=' + payload);
    expect(await page.evaluate(() => (window as unknown as { __xss2?: number }).__xss2)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the security tests**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:security -- -g "window forms"
```
Expected: PASS (markup is escaped; `__xss` undefined). Note the security CI job now installs a browser (fixed in v1.5.x), so these `page`-based tests run in CI.

- [ ] **Step 3: Commit**

```bash
git add tests/security.spec.ts
git commit -m "test: assert window-form free-text echoes are output-escaped"
```

---

## Task 6: Accessibility tests (labelled inputs)

**Files:**
- Modify: `tests/a11y.spec.ts`

- [ ] **Step 1: Add label-association assertions**

Append to `tests/a11y.spec.ts` (the `standalone windows` describe already runs axe on these routes; this adds explicit label checks):

```ts
test.describe('Accessibility · window forms', () => {
  test('certificate verify input is label-associated and axe-clean', async ({ page }) => {
    await page.goto(BASE + '/certificate/1');
    await expect(page.getByTestId('certificate-view')).toBeVisible();
    await expect(page.locator('label[for="cert-serial"]')).toBeAttached();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('size-guide chest input is label-associated and axe-clean', async ({ page }) => {
    await page.goto(BASE + '/size-guide');
    await expect(page.getByTestId('size-guide-view')).toBeVisible();
    await expect(page.locator('label[for="size-chest"]')).toBeAttached();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the a11y tests**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:a11y -- -g "window forms"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/a11y.spec.ts
git commit -m "test: assert window-form inputs are labelled and axe-clean"
```

---

## Task 7: Mobile test

**Files:**
- Modify: `tests/mobile.spec.ts`

- [ ] **Step 1: Add the mobile certificate-verify test**

Append to `tests/mobile.spec.ts`:

```ts
test.describe('Mobile · window forms', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('certificate verify form is usable at mobile width', async ({ page }) => {
    await page.goto(BASE + '/certificate/1');
    await expect(page.getByTestId('certificate-view')).toBeVisible();
    await page.getByTestId('certificate-serial-input').fill('MAISON-AC-0001');
    await page.getByTestId('certificate-verify-button').click();
    await expect(page.getByTestId('certificate-verified')).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});
```

- [ ] **Step 2: Run the mobile test**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm run test:mobile -- -g "window forms"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/mobile.spec.ts
git commit -m "test: add mobile coverage for certificate verify form"
```

---

## Task 8: Full verification

- [ ] **Step 1: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```
Expected: both clean (no errors, no warnings).

- [ ] **Step 2: Rebuild web and run the entire suite from a clean server**

```bash
npm run build:web
lsof -ti:4000 | xargs kill 2>/dev/null; true
npm test
```
Expected: all pillars green (existing v1.5.0 window tests + the new form tests). Report the summary.

- [ ] **Step 3: Confirm the tree is clean**

```bash
git status --porcelain
```
Expected: empty. If `web/dist` shows changes, the build wasn't committed — run `npm run build:web`, commit, re-run the suite.

---

## Task 9: Release v1.6.0 (per AGENTS.md §13)

New feature → **minor** bump: 1.5.0 → 1.6.0.

- [ ] **Step 1: Bump the version**

In root `package.json`, change `"version": "1.5.0"` → `"version": "1.6.0"`.
In root `package-lock.json`, change the two top-level project version fields (lines ~3 and ~9, `"name": "maison"` blocks) from `1.5.0` → `1.6.0`. (Leave unrelated dependency versions untouched.)

- [ ] **Step 2: Update the README Docker version references**

In `README.md`:
- The pinned pull example: `docker run --rm -p 4000:4000 youvegotnigel/maison:1.5.0` → `...:1.6.0`.
- The "Releasing a new version" section: `git tag v1.5.0` / `git push origin v1.5.0` → `v1.6.0`; the "currently **1.5.0**" note → **1.6.0**; and "This publishes `1.5.0`, `1.5`, and `latest`" → `1.6.0`, `1.6`, and `latest`.

- [ ] **Step 3: Commit the release bump**

```bash
git add package.json package-lock.json README.md
git commit -m "chore: release v1.6.0 — interactive window forms"
```

- [ ] **Step 4: Merge to master, push, tag, release** (only after the suite is green and on user confirmation per the finishing-a-development-branch flow)

```bash
git checkout master && git merge --no-ff feat-interactive-window-forms
git push origin master
git tag v1.6.0           # must match package.json
git push origin v1.6.0   # triggers the multi-arch Docker Hub publish
```

---

## Self-review notes

- **Spec coverage:** certificate verify (Task 1) · size find (Task 2) · share link/email/preview (Task 3) · styling (Task 4) · security XSS echoes (Task 5) · a11y labelled inputs (Task 6) · mobile (Task 7) · verification (Task 8) · v1.6.0 release incl. README + AGENTS §13 (Task 9). All §2/§3 testids and behaviours mapped.
- **Determinism:** `recommendSize` bands match the table; results carry no timestamps/random.
- **Type consistency:** every form uses the `root.querySelector(...)!` pattern against the testids defined in its own task; result testids (`certificate-verified`/`certificate-verify-error`, `size-recommendation`/`size-find-error`, `share-link-result`, `share-email-sent`/`share-email-error`, `share-preview-message`) are referenced identically in implementation and tests.
- **No placeholders:** every code step contains complete markup/handlers.
- **Backwards compatibility:** existing root testids, titles, and content testids unchanged → v1.5.0 window tests still pass (re-verified in Task 8).
