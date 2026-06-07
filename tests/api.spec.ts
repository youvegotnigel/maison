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
        dateOfBirth: '1990-06-10',
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
        dateOfBirth: '1988-03-22',
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
      data: { lastName: 'Laurent', email: 'x@test.maison', password: 'Password123!', role: 'buyer', dateOfBirth: '1990-06-10' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_FIRST_NAME');
  });

  test('rejects buyer registration missing lastName — 400 INVALID_LAST_NAME', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { firstName: 'Sophie', email: 'x@test.maison', password: 'Password123!', role: 'buyer', dateOfBirth: '1990-06-10' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_LAST_NAME');
  });
});

test.describe('API · DOB validation', () => {
  test('register buyer with valid DOB returns dateOfBirth in response', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        firstName: 'Alice',
        lastName: 'Moreau',
        email: 'alice@test.maison',
        password: 'Password123!',
        role: 'buyer',
        dateOfBirth: '1992-04-15',
      },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).user.dateOfBirth).toBe('1992-04-15');
  });

  test('register seller with valid DOB returns dateOfBirth in response', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        name: 'Atelier Test',
        email: 'atelier@test.maison',
        password: 'Password123!',
        role: 'seller',
        dateOfBirth: '1978-11-30',
      },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).user.dateOfBirth).toBe('1978-11-30');
  });

  test('missing dateOfBirth for buyer → 400 MISSING_DOB', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { firstName: 'A', lastName: 'B', email: 'ab@test.maison', password: 'Password123!', role: 'buyer' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('MISSING_DOB');
  });

  test('missing dateOfBirth for seller → 400 MISSING_DOB', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { name: 'X', email: 'x@test.maison', password: 'Password123!', role: 'seller' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('MISSING_DOB');
  });

  test('invalid DOB format → 400 INVALID_DOB', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { name: 'X', email: 'x2@test.maison', password: 'Password123!', role: 'seller', dateOfBirth: 'not-a-date' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_DOB');
  });

  test('impossible date (Feb 30) → 400 INVALID_DOB', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { name: 'X', email: 'x3@test.maison', password: 'Password123!', role: 'seller', dateOfBirth: '1990-02-30' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_DOB');
  });

  test('age exactly 17 → 400 UNDERAGE', async ({ request }) => {
    const today = new Date();
    const dob = new Date(today.getFullYear() - 17, today.getMonth(), today.getDate());
    const dobStr = dob.toISOString().slice(0, 10);
    const res = await request.post(`${API}/auth/register`, {
      data: { name: 'Young', email: 'young@test.maison', password: 'Password123!', role: 'seller', dateOfBirth: dobStr },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('UNDERAGE');
  });

  test('age exactly 18 today → 201 (boundary pass)', async ({ request }) => {
    const today = new Date();
    const dob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const dobStr = dob.toISOString().slice(0, 10);
    const res = await request.post(`${API}/auth/register`, {
      data: { name: 'Just18', email: 'just18@test.maison', password: 'Password123!', role: 'seller', dateOfBirth: dobStr },
    });
    expect(res.status()).toBe(201);
  });

  test('GET /auth/me returns dateOfBirth', async ({ request }) => {
    const login = await request.post(`${API}/auth/login`, {
      data: { email: 'buyer@maison.test', password: 'Password123!' },
    });
    const { token } = await login.json();
    const me = await request.get(`${API}/auth/me`, {
      headers: { Cookie: `maison_token=${token}` },
    });
    expect(me.status()).toBe(200);
    expect((await me.json()).user.dateOfBirth).toBe('1990-06-10');
  });
});

test.describe('API · certificate', () => {
  async function login(request: import('@playwright/test').APIRequestContext, email: string) {
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
