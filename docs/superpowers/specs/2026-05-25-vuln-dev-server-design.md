# Design: Intentionally Vulnerable Dev Server for Security Testing

**Date:** 2026-05-25
**Branch:** feat-new-buyer-can-sign-up
**Status:** Approved

## Overview

A separate Express server entry point that introduces a deliberate SQL injection vulnerability on `POST /api/v1/auth/login`. This allows external security scanners (Burp Suite, OWASP ZAP, sqlmap) to validate that they correctly detect SQL injection. The production server is completely untouched.

## Goals

- Provide a runnable target for external security scanner validation
- Keep vulnerable code 100% isolated from production paths
- Commit to the repo under a clear `.vuln.ts` naming convention so the team can reproduce the test environment
- No noise to existing features, tests, or the production build

## Non-Goals

- This is not for Playwright-based tests (external scanners only)
- No other endpoints are intentionally vulnerable (register, products, cart are all safe)
- This server is never deployed; it is dev-only

## File Structure

Three new files. No existing files are modified.

```
server/src/
  routes/
    auth.vuln.ts        ← vulnerable login handler; all other auth routes are re-exported unchanged
  index.vuln.ts         ← separate Express app entry point on port 4001
server/package.json     ← one new "start:vuln" script added
```

The `.vuln.ts` suffix makes all vulnerable code greppable: `grep -r ".vuln" server/src/`.

## Vulnerability Mechanics

### Safe (current)
```ts
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
```
The `?` placeholder prevents injection — SQLite receives a parameterized query.

### Vulnerable (new, login only)
```ts
// INTENTIONALLY VULNERABLE — dev security testing only
const user = db.prepare(`SELECT * FROM users WHERE email = '${email}'`).get() as DbUser;
```
The `email` value is interpolated raw into the SQL string before it reaches SQLite. The password field remains parameterized.

### Exploitable Payloads

| Email field payload        | Effect                                      |
|----------------------------|---------------------------------------------|
| `' OR '1'='1' --`          | Returns first user row — authentication bypass |
| `' OR 1=1 --`              | Same                                        |
| `victim@x.test' --`        | Targets a specific account ignoring password |

These are the standard payloads sqlmap and Burp active scanner will try.

## Vulnerable Server (`index.vuln.ts`)

Identical to `index.ts` except for three deliberate changes:

| Aspect | Production (`index.ts`) | Vuln (`index.vuln.ts`) |
|---|---|---|
| Port | 4000 (or `PORT`) | 4001 (or `PORT_VULN`) |
| Auth router | `routes/auth.ts` | `routes/auth.vuln.ts` |
| Rate limiter | 50 req/min on auth routes | Removed — scanners need unrestricted access |

Everything else is identical: security headers, CORS, product/cart/order routes, `/_reset` endpoint, static SPA fallback.

### Startup Warning

The vuln server prints a loud console warning on boot:

```
  ⚠  MAISON VULN SERVER — DO NOT USE IN PRODUCTION
  ⚠  Intentional SQL injection on POST /api/v1/auth/login
     Running at http://localhost:4001
```

## npm Script

```json
"start:vuln": "node dist/index.vuln.js"
```

Added to `server/package.json`. No changes to `"start"`, `"build"`, `"test"`, or any other existing script.

## Build

`index.vuln.ts` and `routes/auth.vuln.ts` are inside `server/src/` and are picked up by the existing `tsconfig.json`. No tsconfig changes needed.

## How to Use

```bash
# Build first (normal build includes the vuln files)
npm run build --prefix server

# Start the vulnerable server
npm run start:vuln --prefix server

# Point scanner at:
# POST http://localhost:4001/api/v1/auth/login
# Body: { "email": "<payload>", "password": "anything" }

# Reset DB state between scanner runs:
# POST http://localhost:4001/api/v1/_reset
```

## Security Considerations

- The vuln server must never be run in production or exposed publicly
- It is scoped to `localhost` only (CORS origin: `http://localhost:4001`)
- There is no mechanism to accidentally enable it in the production binary — it is a different entry point requiring an explicit `start:vuln` invocation
- All other routes on the vuln server remain fully protected (parameterized queries, auth middleware, role checks)
