// Self-contained verification. Spawns the server as a child process,
// runs API + static-serving + security checks, then kills the child and exits.
// Designed to never leave a process behind.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://localhost:4000';
const API = BASE + '/api/v1';
let pass = 0, fail = 0;
const jar: { token?: string } = {};

const srv = spawn('node', ['server/dist/index.js'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  env: { ...process.env, PORT: '4000' },
});

function cleanup(): void { try { srv.kill('SIGKILL'); } catch { /* ignore */ } }
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

function check(label: string, cond: boolean, detail = ''): void {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
}
function setCookies(res: Response): void {
  const sc = res.headers.get('set-cookie');
  if (sc) { const m = sc.match(/maison_token=([^;]+)/); if (m) jar.token = m[1]; }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: string, path: string, body?: unknown, useAuth?: boolean): Promise<{ status: number; json: any; headers: Headers }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (useAuth && jar.token) headers['Cookie'] = 'maison_token=' + jar.token;
  const res = await fetch(API + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  setCookies(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null; try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json, headers: res.headers };
}
const login = (email: string) => call('POST', '/auth/login', { email, password: 'Password123!' });

async function waitForHealth(): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(API + '/health'); if (r.ok) return true; } catch { /* ignore */ }
    await sleep(300);
  }
  return false;
}

async function run(): Promise<void> {
  const up = await waitForHealth();
  check('server boots & health responds', up);
  if (!up) { console.log('\n  server never came up\n'); return; }

  // ---- API: catalogue & pricing ----
  let r = await call('GET', '/products');
  check('catalogue returns 22 products', r.json.count === 22, String(r.json.count));
  const tote = r.json.products.find((p: { name: string }) => p.name.includes('Noir'));
  check('seeded 15% discount applied (242250)', tote && tote.effectiveCents === 242250, tote && String(tote.effectiveCents));
  check('product exposes onSale + discount object', tote && tote.onSale === true && tote.discount.type === 'percentage');

  r = await call('GET', '/products?q=watch');
  check('search q=watch finds chronograph', r.json.products.some((p: { name: string }) => p.name.includes('Chronograph')));
  r = await call('GET', '/products?category=Footwear');
  check('category filter works', r.json.products.every((p: { category: string }) => p.category === 'Footwear'));
  r = await call('GET', '/products?sort=price_asc');
  check('sort price_asc ordered', r.json.products[0].priceCents <= r.json.products.at(-1).priceCents);

  // ---- Buyer flow ----
  await login('buyer@maison.test');
  r = await call('POST', '/cart/items', { productId: 1, quantity: 2 }, true);
  check('add to cart subtotal at discounted price (484500)', r.json.cart.subtotalCents === 484500, String(r.json.cart && r.json.cart.subtotalCents));
  r = await call('POST', '/orders', {
    shipping: { name: 'A', address: '1 Rue', city: 'Paris', postalCode: '75001' },
    payment: { method: 'mock-card', token: 'demo' },
  }, true);
  check('checkout 201 with ORD reference', r.status === 201 && /^ORD-/.test(r.json.order.reference));
  const ref = r.json.order && r.json.order.reference;
  r = await call('GET', '/products/1');
  check('stock decremented 8 -> 6', r.json.product.stock === 6, String(r.json.product && r.json.product.stock));
  r = await call('GET', '/orders', null, true);
  check('order appears in history', r.json.orders.some((o: { reference: string }) => o.reference === ref));
  r = await call('GET', '/cart', null, true);
  check('cart cleared after checkout', r.json.cart.count === 0);

  // ---- Security / RBAC negatives ----
  await login('buyer@maison.test');
  r = await call('POST', '/products', { name: 'x', priceCents: 1000 }, true);
  check('buyer -> seller route 403 FORBIDDEN_ROLE', r.status === 403 && r.json.error.code === 'FORBIDDEN_ROLE', r.status + ' ' + (r.json.error && r.json.error.code));
  await login('seller2@maison.test');
  r = await call('PATCH', '/products/1', { priceCents: 1 }, true);
  check('seller2 -> seller1 product 403 NOT_OWNER (IDOR blocked)', r.status === 403 && r.json.error.code === 'NOT_OWNER', r.status + ' ' + (r.json.error && r.json.error.code));
  r = await call('GET', '/cart', null, false);
  check('unauthenticated cart 401', r.status === 401 && r.json.error.code === 'UNAUTHENTICATED');
  r = await call('POST', '/auth/register', { email: 'n@x.test', password: 'abc', name: 'N', role: 'buyer' });
  check('weak password 400 WEAK_PASSWORD', r.status === 400 && r.json.error.code === 'WEAK_PASSWORD');
  r = await call('POST', '/auth/register', { email: 'buyer@maison.test', password: 'Password123!', name: 'Dup', role: 'buyer' });
  check('duplicate email 409 EMAIL_TAKEN', r.status === 409 && r.json.error.code === 'EMAIL_TAKEN');
  await login('buyer@maison.test');
  r = await call('POST', '/cart/items', { productId: 6, quantity: 1 }, true);
  check('out-of-stock add 409 OUT_OF_STOCK', r.status === 409 && r.json.error.code === 'OUT_OF_STOCK');

  // ---- Seller positive ----
  await login('seller@maison.test');
  r = await call('PUT', '/products/2/discount', { type: 'percentage', value: 20 }, true);
  check('seller discount on own product (992000)', r.json.product && r.json.product.effectiveCents === 992000, r.json.product && String(r.json.product.effectiveCents));
  r = await call('POST', '/products', { name: 'Test Piece', priceCents: 50000, stock: 3 }, true);
  check('seller creates listing 201', r.status === 201 && r.json.product.name === 'Test Piece');
  r = await call('GET', '/products/seller/mine', null, true);
  check('seller sees own listings', r.json.products.some((p: { name: string }) => p.name === 'Test Piece'));

  // ---- Security headers ----
  r = await call('GET', '/health');
  check('CSP header present', r.headers.get('content-security-policy') != null);
  check('X-Content-Type-Options nosniff', r.headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options DENY', r.headers.get('x-frame-options') === 'DENY');

  // ---- Static serving ----
  let res = await fetch(BASE + '/');
  const html = await res.text();
  check('index.html served', html.includes('MAISON') && html.includes('data-testid="skip-link"'));
  res = await fetch(BASE + '/styles.css');
  check('styles.css served', (await res.text()).includes('luxury design system'));
  res = await fetch(BASE + '/src/app.js');
  check('app.js served', (await res.text()).includes('Maison SPA'));
  res = await fetch(BASE + '/product/1');
  check('SPA fallback for client routes', (await res.text()).includes('data-testid="skip-link"'));

  // ---- Reset ----
  r = await call('POST', '/_reset');
  check('reset reseeds', r.json.reseeded === true);
  r = await call('GET', '/products/1');
  check('after reset stock back to 8', r.json.product.stock === 8);

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
}

run()
  .catch(e => { console.error('ERROR', e); fail++; })
  .finally(() => { cleanup(); process.exit(fail ? 1 : 0); });
