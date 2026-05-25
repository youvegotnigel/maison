import express from 'express';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed, SEED_INFO } from './db.js';
import { authenticate, fail } from './auth.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes, { ordersRouter } from './routes/cart.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const ORIGIN = process.env.MAISON_ORIGIN || `http://localhost:${PORT}`;

// Seed deterministic data on boot.
seed();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ---- Security headers (baseline, demo-appropriate) ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // CSP allows inline styles + data: images (we use generated SVG data-URIs).
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
  );
  next();
});

// ---- Simple CORS for the known local origin ----
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- Lightweight rate limiter on auth endpoints (brute-force slowdown) ----
const hits = new Map<string, { count: number; start: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip + ':' + req.path;
  const now = Date.now();
  const windowMs = 60_000;
  const max = 50; // generous so test suites aren't blocked
  const rec = hits.get(key) || { count: 0, start: now };
  if (now - rec.start > windowMs) { rec.count = 0; rec.start = now; }
  rec.count += 1;
  hits.set(key, rec);
  if (rec.count > max) {
    return fail(res, 429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment.');
  }
  next();
}

app.use(authenticate);

// ---- API ----
const api = express.Router();
api.get('/health', (_req, res) => res.json({ status: 'ok', service: 'maison', time: new Date().toISOString() }));
api.get('/seed-info', (_req, res) => res.json(SEED_INFO)); // documents demo accounts for testers
api.post('/_reset', (req, res) => {
  // Test-only: rebuild deterministic state. Gated behind a flag for safety.
  if (process.env.MAISON_ALLOW_RESET === 'false') {
    return fail(res, 403, 'RESET_DISABLED', 'Reset endpoint is disabled.');
  }
  seed();
  res.json({ ok: true, reseeded: true });
});

api.use('/auth/login', rateLimit);
api.use('/auth/register', rateLimit);
api.use('/auth', authRoutes);
api.use('/products', productRoutes);
api.use('/cart', cartRoutes);
api.use('/orders', ordersRouter);

app.use('/api/v1', api);

// Unknown API routes → structured 404 (not the SPA fallback).
app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', 'Unknown API route.'));

// ---- Static frontend (built SPA) ----
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

// ---- Error handler with consistent envelope ----
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  const e = err as { type?: string } | null;
  if (e && e.type === 'entity.parse.failed') {
    return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  console.error('[maison] unexpected error:', err);
  return fail(res, 500, 'INTERNAL', 'An unexpected error occurred.');
};
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  MAISON running at ${ORIGIN}`);
  console.log(`  API base:      ${ORIGIN}/api/v1`);
  console.log(`  Health:        ${ORIGIN}/api/v1/health`);
  console.log(`  Demo accounts: password "${SEED_INFO.password}"`);
  SEED_INFO.accounts.forEach(a => console.log(`    - ${a.email} (${a.role})`));
  console.log('');
});
