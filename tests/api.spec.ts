import { test, expect } from '@playwright/test';

const BASE = process.env.MAISON_URL || 'http://localhost:4000';
const API = BASE + '/api/v1';
const PASSWORD = 'Password123!';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/_reset`);
});

test.describe('API · contract', () => {
  test('catalogue returns seeded products with computed prices', async ({ request }) => {
    const res = await request.get(`${API}/products`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(22);
    const tote = body.products.find((p: { name: string }) => p.name.includes('Noir'));
    expect(tote.effectiveCents).toBe(242250); // 285000 - 15%
    expect(tote.onSale).toBe(true);
  });

  test('checkout decrements stock transactionally', async ({ request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: 'buyer@maison.test', password: PASSWORD } });
    const { token } = await login.json();
    const auth = { Cookie: `maison_token=${token}` };

    await request.post(`${API}/cart/items`, { headers: auth, data: { productId: 1, quantity: 2 } });
    const order = await request.post(`${API}/orders`, {
      headers: auth,
      data: { shipping: { name: 'A', address: '1 Rue', city: 'Paris', postalCode: '75001' }, payment: { method: 'mock-card', token: 'demo' } },
    });
    expect(order.status()).toBe(201);

    const prod = await (await request.get(`${API}/products/1`)).json();
    expect(prod.product.stock).toBe(6); // was 8
  });
});

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
