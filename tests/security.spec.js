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
});
