# Buyer Registration — Extended Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first name, last name, gender, phone, and confirm-password fields to the buyer registration form, wire them through the API and DB, cover all five test suites, then release v1.3.0 to Docker and GitHub.

**Architecture:** Additive columns (`first_name`, `last_name`, `gender`, `phone`) are added to the `users` table. On buyer registration the server composes `name` from `first_name + last_name`. The frontend form is updated in-place with buyer-specific fields shown/hidden by the role toggle. Seller registration is untouched.

**Tech Stack:** Node.js 24 + Express, `node:sqlite` (DatabaseSync), bcryptjs, JWT, vanilla TypeScript SPA, Playwright (UI / Mobile / API / Security / A11y).

---

## File Map

| File | Change |
|---|---|
| `server/src/db.ts` | Extend `DbUser` interface; add 4 columns to `CREATE TABLE users`; update `seed()` buyer row |
| `server/src/routes/auth.ts` | Extend `publicUser()` return type; add buyer-specific validation + new columns to INSERT in `POST /register` |
| `web/src/app.ts` | Extend `User` interface; rewrite `pageRegister()` with two-column buyer form and confirm-password check |
| `tests/api.spec.ts` | Add `API · buyer registration` describe block (4 new tests) |
| `tests/security.spec.ts` | Add 2 new tests: invalid gender, overlong phone |
| `tests/ui.spec.ts` | Add `UI · new buyer registration and purchase` describe block (2 new tests) |
| `tests/mobile.spec.ts` | Add `Mobile · new buyer registration` describe block (2 new tests) |
| `tests/a11y.spec.ts` | Add 1 new test: register page label coverage |
| `package.json` | Bump root version to `1.3.0` |
| `server/package.json` | Bump server version to `1.3.0` |
| `Dockerfile` | Fix CMD path from `server/src/index.js` → `server/dist/index.js` |

---

## Task 1: Extend DB schema and types

**Files:**
- Modify: `server/src/db.ts`

### Step 1.1 — Update `DbUser` interface

In `server/src/db.ts`, replace the `DbUser` interface (currently ends at `created_at`) with:

```typescript
export interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: 'buyer' | 'seller';
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  phone: string | null;
  created_at: string;
}
```

- [ ] Make the edit above to `server/src/db.ts`.

### Step 1.2 — Add columns to `CREATE TABLE users`

Inside `initSchema()`, replace the `CREATE TABLE users` block with:

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('buyer','seller')),
  first_name    TEXT,
  last_name     TEXT,
  gender        TEXT CHECK (gender IN ('female','male','non-binary','prefer_not_to_say')),
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] Make the edit above to `server/src/db.ts`.

### Step 1.3 — Update `seed()` buyer row

In `seed()`, the `insUser` prepared statement and its three calls currently use 4-column syntax. Replace with:

```typescript
const insUser = db.prepare(
  'INSERT INTO users (email, password_hash, name, role, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)'
);
const seller1 = Number(insUser.run('seller@maison.test', hash, 'Atelier Maison', 'seller', null, null).lastInsertRowid);
const seller2 = Number(insUser.run('seller2@maison.test', hash, 'Maison Rive', 'seller', null, null).lastInsertRowid);
insUser.run('buyer@maison.test', hash, 'Aurelie Dupont', 'buyer', 'Aurelie', 'Dupont');
```

- [ ] Make the edit above to `server/src/db.ts`.

### Step 1.4 — Typecheck

```bash
cd /Users/nigelmulholland/Developer/apps/maison && npm run typecheck 2>&1 | tail -20
```

Expected: zero errors. If `publicUser` in `routes/auth.ts` now complains about the new fields, that is expected — it will be fixed in Task 2.

- [ ] Run typecheck, note any errors (auth.ts errors about publicUser are expected at this stage).

### Step 1.5 — Commit

```bash
git add server/src/db.ts
git commit -m "feat(db): add first_name, last_name, gender, phone columns to users table"
```

- [ ] Commit.

---

## Task 2: Extend `publicUser` and update register route types

**Files:**
- Modify: `server/src/routes/auth.ts`

### Step 2.1 — Extend `publicUser` return type

Replace the existing `publicUser` function in `server/src/routes/auth.ts`:

```typescript
function publicUser(u: DbUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    firstName: u.first_name ?? null,
    lastName: u.last_name ?? null,
    gender: u.gender ?? null,
    phone: u.phone ?? null,
  };
}
```

- [ ] Make the edit above to `server/src/routes/auth.ts`.

### Step 2.2 — Typecheck passes

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: zero errors.

- [ ] Run and confirm zero errors.

### Step 2.3 — Commit

```bash
git add server/src/routes/auth.ts
git commit -m "feat(auth): publicUser returns firstName, lastName, gender, phone"
```

- [ ] Commit.

---

## Task 3: Write failing API tests for new buyer registration

**Files:**
- Modify: `tests/api.spec.ts`

### Step 3.1 — Add new describe block

Append the following describe block to `tests/api.spec.ts` (after the last closing `});`):

```typescript
test.describe('API · buyer registration', () => {
  test('registers a new buyer with all profile fields', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        firstName: 'Sophie',
        lastName: 'Laurent',
        email: 'sophie@test.maison',
        gender: 'female',
        phone: '+33 1 23 45 67 89',
        password: 'Password123!',
        role: 'buyer',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user.firstName).toBe('Sophie');
    expect(body.user.lastName).toBe('Laurent');
    expect(body.user.name).toBe('Sophie Laurent');
    expect(body.user.gender).toBe('female');
    expect(body.user.phone).toBe('+33 1 23 45 67 89');
    expect(body.user.role).toBe('buyer');
  });

  test('registers a new buyer with only required fields (optional fields null)', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        firstName: 'Marc',
        lastName: 'Dubois',
        email: 'marc@test.maison',
        password: 'Password123!',
        role: 'buyer',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user.firstName).toBe('Marc');
    expect(body.user.lastName).toBe('Dubois');
    expect(body.user.gender).toBeNull();
    expect(body.user.phone).toBeNull();
  });

  test('rejects buyer registration missing firstName — 400 INVALID_FIRST_NAME', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { lastName: 'Laurent', email: 'x@test.maison', password: 'Password123!', role: 'buyer' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_FIRST_NAME');
  });

  test('rejects buyer registration missing lastName — 400 INVALID_LAST_NAME', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { firstName: 'Sophie', email: 'x@test.maison', password: 'Password123!', role: 'buyer' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_LAST_NAME');
  });
});
```

- [ ] Add the block to `tests/api.spec.ts`.

### Step 3.2 — Run new tests and confirm they fail

```bash
npm run test:api 2>&1 | tail -30
```

Expected: 4 new tests fail (INVALID_FIRST_NAME / INVALID_LAST_NAME not yet implemented; firstName/lastName not in response yet).

- [ ] Run and confirm failures.

---

## Task 4: Write failing security tests for field validation

**Files:**
- Modify: `tests/security.spec.ts`

### Step 4.1 — Add two new tests

Inside the existing `test.describe('Security · authorization', ...)` block in `tests/security.spec.ts`, append before the final `});`:

```typescript
  test('invalid gender value is rejected — 400 INVALID_GENDER', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        firstName: 'Sophie',
        lastName: 'Laurent',
        email: 'sophie.sec@test.maison',
        gender: 'attack-vector',
        password: 'Password123!',
        role: 'buyer',
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_GENDER');
  });

  test('phone number exceeding 30 characters is rejected — 400 INVALID_PHONE', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        firstName: 'Sophie',
        lastName: 'Laurent',
        email: 'sophie.sec2@test.maison',
        phone: '1'.repeat(31),
        password: 'Password123!',
        role: 'buyer',
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_PHONE');
  });
```

- [ ] Add both tests to `tests/security.spec.ts`.

### Step 4.2 — Run and confirm they fail

```bash
npm run test:security 2>&1 | tail -20
```

Expected: 2 new tests fail (validation not implemented yet), existing 5 tests pass.

- [ ] Run and confirm.

---

## Task 5: Update `POST /register` route with buyer field validation

**Files:**
- Modify: `server/src/routes/auth.ts`

### Step 5.1 — Add VALID_GENDERS constant at module scope

Add the following line to `server/src/routes/auth.ts` at module scope, directly above the `router.post('/register', ...)` line:

```typescript
const VALID_GENDERS = ['female', 'male', 'non-binary', 'prefer_not_to_say'] as const;
```

- [ ] Add the constant above the register handler.

### Step 5.2 — Replace the register route handler

Replace the entire `router.post('/register', ...)` handler (from `router.post('/register'` through its closing `});`) with:

```typescript
router.post('/register', (req, res) => {
  const { email, password, name, role } = req.body || {};

  if (!email || !EMAIL_RE.test(email)) {
    return fail(res, 400, 'INVALID_EMAIL', 'Please provide a valid email address.');
  }
  if (!validPassword(password)) {
    return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters and include a letter and a number.');
  }
  if (role !== 'buyer' && role !== 'seller') {
    return fail(res, 400, 'INVALID_ROLE', "Role must be either 'buyer' or 'seller'.");
  }

  let insertName: string;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let gender: string | null = null;
  let phone: string | null = null;

  if (role === 'buyer') {
    firstName = String(req.body.firstName ?? '').trim();
    lastName = String(req.body.lastName ?? '').trim();
    if (!firstName) return fail(res, 400, 'INVALID_FIRST_NAME', 'Please provide your first name.');
    if (!lastName) return fail(res, 400, 'INVALID_LAST_NAME', 'Please provide your last name.');

    const rawGender: string | undefined = req.body.gender;
    if (rawGender != null && rawGender !== '') {
      if (!(VALID_GENDERS as readonly string[]).includes(rawGender)) {
        return fail(res, 400, 'INVALID_GENDER', 'Gender must be one of: female, male, non-binary, prefer_not_to_say.');
      }
      gender = rawGender;
    }

    const rawPhone: string | undefined = req.body.phone;
    if (rawPhone != null && rawPhone !== '') {
      if (String(rawPhone).length > 30) {
        return fail(res, 400, 'INVALID_PHONE', 'Phone number must not exceed 30 characters.');
      }
      phone = String(rawPhone);
    }

    insertName = `${firstName} ${lastName}`;
  } else {
    if (!name || !String(name).trim()) {
      return fail(res, 400, 'INVALID_NAME', 'Please provide your name.');
    }
    insertName = String(name).trim();
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) {
    return fail(res, 409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  }

  const hash = bcrypt.hashSync(password, 8);
  const id = db.prepare(
    'INSERT INTO users (email, password_hash, name, role, first_name, last_name, gender, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(email, hash, insertName, role, firstName, lastName, gender, phone).lastInsertRowid;

  if (role === 'buyer') {
    db.prepare('INSERT INTO carts (buyer_id) VALUES (?)').run(id);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as DbUser;
  const token = signToken(user);
  res.cookie('maison_token', token, cookieOpts);
  return res.status(201).json({ token, user: publicUser(user) });
});
```

- [ ] Replace the handler in `server/src/routes/auth.ts`.

### Step 5.3 — Typecheck

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: zero errors.

- [ ] Run and confirm zero errors.

### Step 5.4 — Run API tests — all pass

```bash
npm run test:api 2>&1 | tail -30
```

Expected: all 6 tests pass (2 original + 4 new).

- [ ] Run and confirm all pass.

### Step 5.5 — Run security tests — all pass

```bash
npm run test:security 2>&1 | tail -20
```

Expected: all 7 tests pass (5 original + 2 new).

- [ ] Run and confirm all pass.

### Step 5.6 — Commit

```bash
git add server/src/routes/auth.ts tests/api.spec.ts tests/security.spec.ts
git commit -m "feat(auth): extend buyer registration with firstName, lastName, gender, phone"
```

- [ ] Commit.

---

## Task 6: Write failing UI tests for new buyer registration flow

**Files:**
- Modify: `tests/ui.spec.ts`

### Step 6.1 — Add new describe block

Append the following describe block to `tests/ui.spec.ts`:

```typescript
test.describe('UI · new buyer registration and purchase', () => {
  test('new buyer registers with all fields, then completes a purchase', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    // Fill extended buyer registration form
    await page.getByTestId('register-first-name').fill('Sophie');
    await page.getByTestId('register-last-name').fill('Laurent');
    await page.getByTestId('register-email').fill('sophie.laurent@test.maison');
    await page.getByTestId('register-gender').selectOption('female');
    await page.getByTestId('register-phone').fill('+33 1 23 45 67 89');
    await page.getByTestId('register-password').fill('NewBuyer123!');
    await page.getByTestId('register-confirm-password').fill('NewBuyer123!');
    await page.getByTestId('register-submit').click();

    // Confirm registration and auto-login
    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');
    await expect(page.getByTestId('flash-success')).toContainText('Sophie Laurent');

    // Add first in-stock product to cart
    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Checkout
    await page.getByTestId('nav-cart').click();
    await page.getByTestId('checkout-button').click();
    await page.getByTestId('ship-address').fill('15 Rue de la Paix');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-reference')).toContainText('ORD-');
  });

  test('password mismatch shows inline error and does not submit', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    await page.getByTestId('register-first-name').fill('Sophie');
    await page.getByTestId('register-last-name').fill('Laurent');
    await page.getByTestId('register-email').fill('sophie2@test.maison');
    await page.getByTestId('register-password').fill('NewBuyer123!');
    await page.getByTestId('register-confirm-password').fill('Different999!');
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-error')).toContainText('Passwords do not match');
    // Still on register page — not logged in
    await expect(page.getByTestId('nav-login')).toBeVisible();
  });
});
```

- [ ] Add the block to `tests/ui.spec.ts`.

### Step 6.2 — Run and confirm they fail

```bash
npm run test:ui 2>&1 | tail -30
```

Expected: 2 new tests fail (form fields don't exist yet), 2 existing tests pass.

- [ ] Run and confirm new tests fail.

---

## Task 7: Update frontend registration form

**Files:**
- Modify: `web/src/app.ts`

### Step 7.1 — Extend the `User` interface

In `web/src/app.ts`, replace the `User` interface:

```typescript
interface User {
  id: number;
  email: string;
  name: string;
  role: 'buyer' | 'seller';
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  phone: string | null;
}
```

- [ ] Make the edit to the `User` interface in `web/src/app.ts`.

### Step 7.2 — Rewrite `pageRegister()`

Replace the entire `async function pageRegister(): Promise<void>` function with the following. Find it by searching for `async function pageRegister`.

```typescript
async function pageRegister(): Promise<void> {
  let role = 'buyer';
  app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">Join the Maison</p><h1>Create Account</h1></div>
      <form class="form" data-testid="register-form">
        <div id="register-alert"></div>
        <div class="field">
          <label>I want to</label>
          <div class="role-toggle" data-testid="role-toggle">
            <button type="button" data-testid="role-buyer" data-role="buyer" aria-pressed="true">Shop as Buyer</button>
            <button type="button" data-testid="role-seller" data-role="seller" aria-pressed="false">Sell as Atelier</button>
          </div>
        </div>
        <div id="buyer-name-row">
          <div class="row" style="gap:16px">
            <div class="field" style="flex:1">
              <label for="reg-first-name">First name</label>
              <input id="reg-first-name" data-testid="register-first-name" autocomplete="given-name" />
            </div>
            <div class="field" style="flex:1">
              <label for="reg-last-name">Last name</label>
              <input id="reg-last-name" data-testid="register-last-name" autocomplete="family-name" />
            </div>
          </div>
        </div>
        <div id="seller-name-row" style="display:none">
          <div class="field">
            <label for="reg-name">Atelier name</label>
            <input id="reg-name" data-testid="register-name" />
          </div>
        </div>
        <div class="field">
          <label for="reg-email">Email</label>
          <input id="reg-email" type="email" data-testid="register-email" autocomplete="email" required />
        </div>
        <div id="buyer-extra-row">
          <div class="row" style="gap:16px">
            <div class="field" style="flex:1">
              <label for="reg-gender">Gender <span class="tiny">(optional)</span></label>
              <select id="reg-gender" data-testid="register-gender">
                <option value="">— Select —</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            <div class="field" style="flex:1">
              <label for="reg-phone">Phone <span class="tiny">(optional)</span></label>
              <input id="reg-phone" type="tel" data-testid="register-phone" autocomplete="tel" />
            </div>
          </div>
        </div>
        <div class="row" style="gap:16px">
          <div class="field" style="flex:1">
            <label for="reg-password">Password</label>
            <input id="reg-password" type="password" data-testid="register-password" autocomplete="new-password" />
            <p class="tiny" style="margin-top:6px">At least 8 characters, including a letter and a number.</p>
          </div>
          <div class="field" style="flex:1" id="confirm-password-field">
            <label for="reg-confirm-password">Confirm password</label>
            <input id="reg-confirm-password" type="password" data-testid="register-confirm-password" autocomplete="new-password" />
          </div>
        </div>
        <button class="btn btn--solid btn--block" data-testid="register-submit" type="submit">Create Account</button>
        <p class="muted" style="margin-top:20px;font-size:0.88rem">Already have an account? <a href="#/login" data-testid="goto-login" style="color:var(--gold)">Sign in</a></p>
      </form>
    </section>`;

  const form = app.querySelector<HTMLFormElement>('[data-testid="register-form"]')!;
  form.addEventListener('submit', e => e.preventDefault());

  const bBuyer = form.querySelector<HTMLElement>('[data-testid="role-buyer"]')!;
  const bSeller = form.querySelector<HTMLElement>('[data-testid="role-seller"]')!;
  const buyerNameRow = form.querySelector<HTMLElement>('#buyer-name-row')!;
  const sellerNameRow = form.querySelector<HTMLElement>('#seller-name-row')!;
  const buyerExtraRow = form.querySelector<HTMLElement>('#buyer-extra-row')!;
  const confirmField = form.querySelector<HTMLElement>('#confirm-password-field')!;

  const setRole = (r: string): void => {
    role = r;
    const isBuyer = r === 'buyer';
    bBuyer.setAttribute('aria-pressed', String(isBuyer));
    bSeller.setAttribute('aria-pressed', String(!isBuyer));
    buyerNameRow.style.display = isBuyer ? '' : 'none';
    sellerNameRow.style.display = isBuyer ? 'none' : '';
    buyerExtraRow.style.display = isBuyer ? '' : 'none';
    confirmField.style.display = isBuyer ? '' : 'none';
  };

  bBuyer.onclick = () => setRole('buyer');
  bSeller.onclick = () => setRole('seller');

  form.querySelector<HTMLElement>('[data-testid="register-submit"]')!.onclick = async () => {
    const email = form.querySelector<HTMLInputElement>('[data-testid="register-email"]')!.value.trim();
    const password = form.querySelector<HTMLInputElement>('[data-testid="register-password"]')!.value;
    const alertEl = document.getElementById('register-alert')!;
    alertEl.innerHTML = '';

    let payload: Record<string, string>;

    if (role === 'buyer') {
      const firstName = form.querySelector<HTMLInputElement>('[data-testid="register-first-name"]')!.value.trim();
      const lastName = form.querySelector<HTMLInputElement>('[data-testid="register-last-name"]')!.value.trim();
      const gender = form.querySelector<HTMLSelectElement>('[data-testid="register-gender"]')!.value;
      const phone = form.querySelector<HTMLInputElement>('[data-testid="register-phone"]')!.value.trim();
      const confirmPassword = form.querySelector<HTMLInputElement>('[data-testid="register-confirm-password"]')!.value;

      if (password !== confirmPassword) {
        alertEl.innerHTML = `<div class="alert alert--error" data-testid="register-error" role="alert">Passwords do not match.</div>`;
        return;
      }

      payload = { firstName, lastName, email, password, role };
      if (gender) payload.gender = gender;
      if (phone) payload.phone = phone;
    } else {
      const name = form.querySelector<HTMLInputElement>('[data-testid="register-name"]')!.value.trim();
      payload = { name, email, password, role };
    }

    try {
      const r = await api.register(payload) as { user: User };
      state.user = r.user;
      renderHeader();
      await refreshCart();
      flash(`Welcome to Maison, ${r.user.name}.`);
      location.hash = r.user.role === 'seller' ? '#/seller' : '#/';
    } catch (e) {
      alertEl.innerHTML = `<div class="alert alert--error" data-testid="register-error" role="alert">${esc((e as Error).message)}</div>`;
    }
  };
}
```

- [ ] Replace `pageRegister()` in `web/src/app.ts`.

### Step 7.3 — Build frontend

```bash
npm run build:web 2>&1 | tail -20
```

Expected: zero errors.

- [ ] Run and confirm zero errors.

### Step 7.4 — Run UI tests — all pass

```bash
npm run test:ui 2>&1 | tail -30
```

Expected: all 4 tests pass (2 original + 2 new).

- [ ] Run and confirm all pass.

### Step 7.5 — Commit

```bash
git add web/src/app.ts tests/ui.spec.ts
git commit -m "feat(ui): extend buyer registration form with split name, gender, phone, confirm-password"
```

- [ ] Commit.

---

## Task 8: Add mobile tests for new buyer registration

**Files:**
- Modify: `tests/mobile.spec.ts`

### Step 8.1 — Add new describe block

Append the following block to `tests/mobile.spec.ts`:

```typescript
test.describe('Mobile · new buyer registration', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('new buyer registers and completes purchase on mobile', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');

    await page.getByTestId('register-first-name').fill('Sophie');
    await page.getByTestId('register-last-name').fill('Laurent');
    await page.getByTestId('register-email').fill('sophie.mobile@test.maison');
    await page.getByTestId('register-password').fill('NewBuyer123!');
    await page.getByTestId('register-confirm-password').fill('NewBuyer123!');
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('current-user')).toHaveAttribute('data-role', 'buyer');

    // Add product to cart
    await page.getByTestId('product-card').first().click();
    await expect(page.getByTestId('product-detail')).toBeVisible();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Navigate to cart via hamburger
    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('nav-cart').click();
    await page.getByTestId('checkout-button').click();

    await page.getByTestId('ship-address').fill('15 Rue de la Paix');
    await page.getByTestId('ship-city').fill('Paris');
    await page.getByTestId('ship-postal').fill('75001');
    await page.getByTestId('place-order').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-reference')).toContainText('ORD-');
  });

  test('register page has no horizontal overflow on mobile', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});
```

- [ ] Add the block to `tests/mobile.spec.ts`.

### Step 8.2 — Run mobile tests — all pass

```bash
npm run test:mobile 2>&1 | tail -30
```

Expected: all 7 tests pass (5 original + 2 new).

- [ ] Run and confirm all pass.

### Step 8.3 — Commit

```bash
git add tests/mobile.spec.ts
git commit -m "test(mobile): add new buyer registration and purchase flow tests"
```

- [ ] Commit.

---

## Task 9: Add A11y test for register page

**Files:**
- Modify: `tests/a11y.spec.ts`

### Step 9.1 — Add register page test

Inside the existing `test.describe('Accessibility · WCAG', ...)` block in `tests/a11y.spec.ts`, append before the final `});`:

```typescript
  test('register page has correct labels for all new buyer fields', async ({ page }) => {
    await page.goto(BASE + '#/register');
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    // Each new input has an associated <label for="...">
    await expect(page.locator('label[for="reg-first-name"]')).toBeAttached();
    await expect(page.locator('label[for="reg-last-name"]')).toBeAttached();
    await expect(page.locator('label[for="reg-gender"]')).toBeAttached();
    await expect(page.locator('label[for="reg-phone"]')).toBeAttached();
    await expect(page.locator('label[for="reg-confirm-password"]')).toBeAttached();
    // Role toggle buttons have aria-pressed
    await expect(page.getByTestId('role-buyer')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('role-seller')).toHaveAttribute('aria-pressed', 'false');
  });
```

- [ ] Add the test to `tests/a11y.spec.ts`.

### Step 9.2 — Run A11y tests — all pass

```bash
npm run test:a11y 2>&1 | tail -20
```

Expected: all 2 tests pass (1 original + 1 new).

- [ ] Run and confirm all pass.

### Step 9.3 — Commit

```bash
git add tests/a11y.spec.ts
git commit -m "test(a11y): add register page label and aria coverage"
```

- [ ] Commit.

---

## Task 10: Run full test suite — verify all pass

### Step 10.1 — Run all tests

```bash
npm test 2>&1 | tail -40
```

Expected: all tests in all suites pass. If anything fails, fix before continuing.

- [ ] Run `npm test` and confirm zero failures.

---

## Task 11: Bump versions to 1.3.0

**Files:**
- Modify: `package.json`
- Modify: `server/package.json`

### Step 11.1 — Bump root package.json

In `package.json`, change:
```json
"version": "1.0.0",
```
to:
```json
"version": "1.3.0",
```

- [ ] Edit `package.json`.

### Step 11.2 — Bump server package.json

In `server/package.json`, change:
```json
"version": "1.1.0",
```
to:
```json
"version": "1.3.0",
```

- [ ] Edit `server/package.json`.

### Step 11.3 — Commit version bump

```bash
git add package.json server/package.json
git commit -m "chore: bump version to 1.3.0"
```

- [ ] Commit.

### Step 11.4 — Tag the release

```bash
git tag -a v1.3.0 -m "Release v1.3.0: extended buyer registration with first/last name, gender, phone, confirm-password"
```

- [ ] Tag.

---

## Task 12: Fix Dockerfile and build Docker image

**Files:**
- Modify: `Dockerfile`

### Step 12.1 — Fix the Dockerfile CMD path

The current Dockerfile CMD points to `server/src/index.js` but TypeScript compiles to `server/dist/index.js`. Replace the last line:

```dockerfile
CMD ["node", "server/dist/index.js"]
```

- [ ] Edit `Dockerfile` — change `server/src/index.js` to `server/dist/index.js`.

### Step 12.2 — Build the project (generates server/dist/)

```bash
npm run build 2>&1 | tail -20
```

Expected: zero errors. `server/dist/index.js` now exists.

- [ ] Run build and confirm zero errors.

### Step 12.3 — Build Docker image

```bash
docker build -t maison:1.3.0 -t maison:latest .
```

Expected: build completes successfully. Verify with:

```bash
docker images maison
```

Expected output includes both `1.3.0` and `latest` tags.

- [ ] Build Docker image and confirm both tags appear.

### Step 12.4 — Smoke-test the Docker image

```bash
docker run --rm -d -p 4001:4000 --name maison-smoke maison:1.3.0
sleep 2
curl -s http://localhost:4001/api/v1/health | grep '"status":"ok"'
docker stop maison-smoke
```

Expected: `{"status":"ok",...}` line printed.

- [ ] Run smoke test and confirm health endpoint responds.

### Step 12.5 — Commit Dockerfile fix

```bash
git add Dockerfile
git commit -m "fix(docker): correct CMD path to server/dist/index.js"
```

- [ ] Commit.

---

## Task 13: Create GitHub release

### Step 13.1 — Push commits and tag

```bash
git push origin master
git push origin v1.3.0
```

- [ ] Push.

### Step 13.2 — Create GitHub release

```bash
gh release create v1.3.0 \
  --title "v1.3.0 — Extended Buyer Registration" \
  --notes "## What's new

### Buyer Registration — Extended Profile
New buyers can now sign up with their first name, last name, email, optional gender, optional phone number, password, and confirm password. The registration form uses a two-column layout that collapses responsively on mobile.

### Changes
- **DB:** Added \`first_name\`, \`last_name\`, \`gender\`, \`phone\` columns to \`users\` table
- **API:** \`POST /api/v1/auth/register\` accepts new buyer fields; returns \`firstName\`, \`lastName\`, \`gender\`, \`phone\` in the user object
- **UI:** Expanded registration form with confirm-password mismatch guard
- **Tests:** New coverage across UI, Mobile, API, Security, and A11y suites
- **Docker:** Fixed Dockerfile CMD path (\`server/dist/index.js\`)

### Docker
\`\`\`
docker pull maison:1.3.0
\`\`\`"
```

- [ ] Create GitHub release.

### Step 13.3 — Verify release

```bash
gh release view v1.3.0
```

Expected: release notes shown, tag `v1.3.0` listed.

- [ ] Verify release is live.
