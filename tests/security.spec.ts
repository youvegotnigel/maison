import { test, expect } from '@playwright/test';

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

test.describe('Security · authorization', () => {
  test('buyer cannot call seller-only route (403)', async ({ request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: 'buyer@maison.test', password: PASSWORD } });
    const { token } = await login.json();
    const res = await request.post(`${API}/products`, {
      headers: { Cookie: `maison_token=${token}` },
      data: { name: 'x', priceCents: 1000 },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN_ROLE');
  });

  test('seller cannot edit another sellers product — IDOR blocked (403)', async ({ request }) => {
    // product 1 is owned by seller1; authenticate as seller2
    const login = await request.post(`${API}/auth/login`, { data: { email: 'seller2@maison.test', password: PASSWORD } });
    const { token } = await login.json();
    const res = await request.patch(`${API}/products/1`, {
      headers: { Cookie: `maison_token=${token}` },
      data: { priceCents: 1 },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('NOT_OWNER');
  });

  test('unauthenticated cart access is rejected (401)', async ({ request }) => {
    const res = await request.get(`${API}/cart`);
    expect(res.status()).toBe(401);
  });

  test('weak password is rejected at registration (400)', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { email: 'new@x.test', password: 'abc', name: 'N', role: 'buyer' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('WEAK_PASSWORD');
  });

  test('security headers are present', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const headers = res.headers();
    expect(headers['content-security-policy']).toBeTruthy();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('invalid gender value is rejected — 400 INVALID_GENDER', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        firstName: 'Sophie',
        lastName: 'Laurent',
        email: 'sophie.sec@test.maison',
        gender: 'attack-vector',
        password: 'Password123!',
        role: 'buyer',
        dateOfBirth: '1990-06-10',
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
        dateOfBirth: '1990-06-10',
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_PHONE');
  });

  test('underage registration is rejected at API level — 400 UNDERAGE', async ({ request }) => {
    const today = new Date();
    const underage = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate());
    const res = await request.post(`${API}/auth/register`, {
      data: {
        name: 'Young Seller',
        email: 'young.seller@test.maison',
        password: 'Password123!',
        role: 'seller',
        dateOfBirth: underage.toISOString().slice(0, 10),
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('UNDERAGE');
  });

  test('missing dateOfBirth is rejected at API level — 400 MISSING_DOB', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { name: 'No DOB', email: 'nodob@test.maison', password: 'Password123!', role: 'seller' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('MISSING_DOB');
  });
});

test.describe('Security · certificate', () => {
  async function login(request: import('@playwright/test').APIRequestContext, email: string) {
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
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

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
