# Maison - Luxury E-Commerce Demo

[![Docker Hub](https://img.shields.io/docker/v/youvegotnigel/maison?sort=semver&label=Docker%20Hub)](https://hub.docker.com/r/youvegotnigel/maison)

A two sided luxury marketplace built as an **Application Under Test (AUT)** for a Playwright
automation framework. It deliberately exercises five testing pillars: **UI, Mobile, API, Accessibility,
and Security.**

Everything runs locally in a **single Node process.** The Express server hosts both the JSON
API and the static frontend on one port. No external database, no build step, no internet
dependency (product imagery is generated inline as SVG data-URIs).

---

## Quick start

```bash
cd maison
npm install          # installs the server dependencies
npm start            # serves app + API at http://localhost:4000
```

Open **http://localhost:4000**.

Requirements: **Node.js 22.5+** (uses the built-in `node:sqlite` module — no native build).

---

## Run locally with Docker (no Node required)

If you'd rather not install Node, you can run the entire app inside Docker. One command starts it; Ctrl+C stops everything cleanly.

**Option A — pull the published image (no clone needed):**

```bash
docker run --rm -p 4000:4000 youvegotnigel/maison:latest
```

**Option B — build from source:**

```bash
docker build -t maison:latest .
docker run --rm -p 4000:4000 maison:latest
```

Open **http://localhost:4000**. Press **Ctrl+C** to stop — the container exits and is removed automatically (`--rm`). Nothing lingers.

**Verify it's working:**

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok"}
```

Requirements: **Docker Desktop** — no Node, no npm, no other tools needed.

---

## Publish to Docker Hub

### Manual (one-time or ad-hoc)

1. [Create a free Docker Hub account](https://hub.docker.com/signup) and a public repository named `maison`.
2. Log in and push:

```bash
docker login
docker build -t youvegotnigel/maison:latest .
docker push youvegotnigel/maison:latest
```

Anyone can then pull and run your image without cloning the repo:

```bash
docker run --rm -p 4000:4000 youvegotnigel/maison:latest
```

### Automated via GitHub Actions (publish on every push)

The workflow at [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) builds and pushes automatically. Set it up once:

1. Go to **Docker Hub → Account Settings → Security → New Access Token** and copy the token.
2. Go to **GitHub repo → Settings → Secrets and variables → Actions** and add:
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — the token from step 1
3. Push to `master` (or tag a release with `v*.*.*`) — the image publishes automatically.

The workflow builds for both `linux/amd64` and `linux/arm64` (Apple Silicon), so the image runs natively on any machine.

### Releasing a new version

Pushes to `master` automatically keep the `latest` tag up to date. To publish a numbered release:

```bash
git tag v1.2.0
git push origin v1.2.0
```

This publishes `1.2.0`, `1.2`, and `latest` on Docker Hub automatically. Use [semantic versioning](https://semver.org):

| Type of change | Part to bump | Example |
|----------------|-------------|---------|
| Bug fix or small tweak | patch | `1.0.0` → `1.0.1` |
| New feature or API addition | minor | `1.0.0` → `1.1.0` |
| Breaking change | major | `1.0.0` → `2.0.0` |

Only tag when there is something meaningful to version — don't tag every commit.

---

### Demo accounts (password `Password123!`)

| Email                 | Role   | Date of Birth |
|-----------------------|--------|---------------|
| `buyer@maison.test`   | buyer  | 1990-06-10    |
| `seller@maison.test`  | seller | 1980-03-15    |
| `seller2@maison.test` | seller | 1975-09-22    |

---

## Why it's automation-friendly

This app was built test-first. Concretely:

- **Stable `data-testid` hooks** on every interactive element and meaningful piece of state.
  Selectors never depend on text, CSS classes, or DOM position.
- **Deterministic seed data** — the same 22 products, 3 users, and 2 discounts on every boot.
  Tests can assert exact values (e.g. the Noir Tote is always `$2,422.50` after its 15% discount).
- **`POST /api/v1/_reset`** — rebuilds the seed state instantly for per-test isolation. Call it in
  a `beforeEach`. (In-memory SQLite, so it's fast.)
- **`GET /api/v1/seed-info`** — documents the demo accounts programmatically.
- **Consistent error envelope** — every failure returns `{ error: { code, message } }` with a
  stable machine-readable `code`, so negative-path assertions don't rely on message strings.
- **Readiness signal** — `document.body[data-app-ready="true"]` is set once the SPA has booted,
  so tests can wait deterministically instead of sleeping.
- **State introspection** — `window.__MAISON__` mirrors the current user and cart for debugging.
- **Server-side everything** — pricing, stock, and authorization are all enforced by the API,
  never trusted from the client. This makes the security tests meaningful.

---

## Architecture

```
Browser SPA  ──fetch──▶  Express API  ──▶  SQLite (in-memory)
(vanilla JS,             (/api/v1/*)        seeded on boot
 hash-routed)            + static host
```

```
maison/
├── package.json            # root: `npm start`, `npm run test:smoke`
├── verify.mjs              # standalone integration check (no Playwright needed)
├── server/
│   └── src/
│       ├── index.js        # server: security headers, CORS, rate-limit, routing, static host
│       ├── db.js           # schema + deterministic seed + image generator
│       ├── pricing.js      # discount math + product serialization (single source of truth)
│       ├── auth.js         # JWT signing, authenticate / requireAuth / requireRole
│       └── routes/
│           ├── auth.js     # register, login, logout, me
│           ├── products.js # catalogue, search, seller CRUD, images, discounts
│           └── cart.js     # cart + transactional checkout / orders
├── web/
│   └── dist/               # served as-is (no build step)
│       ├── index.html
│       ├── styles.css      # luxury design system
│       └── src/{app.js, api.js}   # SPA + API client
└── tests/
    ├── ui.spec.js          # UI end-to-end: buyer purchase flow, seller dashboard
    ├── mobile.spec.js      # Mobile: responsive layout, hamburger nav, purchase flow
    ├── api.spec.js         # API contract: catalogue, transactional checkout
    ├── security.spec.js    # Security: RBAC, IDOR, auth headers
    └── a11y.spec.js        # Accessibility: WCAG landmark checks (axe-core scaffold)
```

---

## API reference (`/api/v1`)

| Method & Path                      | Role   | Purpose                                  |
|------------------------------------|--------|------------------------------------------|
| `GET  /health`                     | Public | Liveness check                           |
| `GET  /seed-info`                  | Public | Demo accounts                            |
| `POST /_reset`                     | Public | Rebuild seed data (test isolation)       |
| `POST /auth/register`              | Public | Create account (`role: buyer\|seller`, `dateOfBirth: YYYY-MM-DD` required, age ≥ 18) |
| `POST /auth/login`                 | Public | Authenticate, issue JWT cookie           |
| `POST /auth/logout`                | Any    | Clear session                            |
| `GET  /auth/me`                    | Auth   | Current user (includes `dateOfBirth`)    |
| `GET  /products`                   | Public | Catalogue (`q, category, sort, minPrice, maxPrice`) |
| `GET  /products/:id`               | Public | Single product                           |
| `GET  /products/categories`        | Public | Distinct categories                      |
| `GET  /products/seller/mine`       | Seller | The caller's own listings                |
| `POST /products`                   | Seller | Create a listing                         |
| `PATCH /products/:id`              | Seller | Update own product (price/stock/details) |
| `POST /products/:id/images`        | Seller | Add an image to an owned product         |
| `PUT  /products/:id/discount`      | Seller | Set a discount (`percentage`\|`fixed`)   |
| `DELETE /products/:id/discount`    | Seller | Remove a discount                        |
| `GET  /cart`                       | Buyer  | Read cart                                |
| `POST /cart/items`                 | Buyer  | Add/update line item                     |
| `DELETE /cart/items/:itemId`       | Buyer  | Remove a line item                       |
| `DELETE /cart`                     | Buyer  | Empty the cart                           |
| `POST /orders`                     | Buyer  | Checkout (transactional, decrements stock)|
| `GET  /orders`                     | Buyer  | Order history                            |
| `GET  /orders/:reference`          | Buyer  | Single order                             |

**Error codes** include: `INVALID_EMAIL`, `WEAK_PASSWORD`, `INVALID_ROLE`, `EMAIL_TAKEN`,
`INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN_ROLE`, `NOT_OWNER`, `PRODUCT_NOT_FOUND`,
`OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `INVALID_PRICE`, `INVALID_DISCOUNT_VALUE`, `EMPTY_CART`,
`MISSING_DOB`, `INVALID_DOB`, `UNDERAGE`.

Prices are integer **cents** everywhere to avoid floating-point drift.

---

## Running the sample tests

```bash
npm start                                  # terminal 1
# terminal 2:
npm i -D @playwright/test @axe-core/playwright
npx playwright install

npm test                   # run all five suites
npm run test:ui            # UI only
npm run test:mobile        # Mobile only
npm run test:api           # API only
npm run test:security      # Security only
npm run test:a11y          # Accessibility only
npm run test:open          # Playwright interactive UI (suite picker)
```

The sample suite covers a buyer purchase journey, seller listing management, API contract checks,
the RBAC/IDOR security boundaries, and an accessibility scaffold (uncomment the `AxeBuilder` block
once `@axe-core/playwright` is installed).

### No-Playwright sanity check

```bash
npm run test:smoke      # spins up the server, runs ~30 API/static/security assertions, exits
```

---

## Hosting a demo on AWS (Docker → ECR → App Runner)

Follow these steps to get a public URL anyone can open in a browser, then shut it all down when you're done so you don't pay for anything you're not using.

---

### Before you start — things you need installed once

| Tool | What it is | Install link |
|------|-----------|--------------|
| Docker Desktop | Builds and packages the app | https://www.docker.com/products/docker-desktop |
| AWS CLI | Lets you talk to AWS from the terminal | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |

You also need an **AWS account** and your **Account ID** (a 12-digit number — find it in the top-right corner of the AWS Console after logging in).

**Configure AWS CLI** (one-time — paste your Access Key ID and Secret when prompted):
```bash
aws configure
```
When asked for a region, use `us-east-1` (or whichever region you prefer — just use the same one throughout).

---

### Step 1 — Build the Docker image

Open a terminal in the `maison` folder and run:

```bash
docker build -t maison:latest .
```

This packages the app into a container. It takes about a minute the first time.

---

### Step 2 — Create a private container registry on AWS (one-time)

This creates a place on AWS to store the image. You only need to do this once.

```bash
aws ecr create-repository --repository-name maison --region us-east-1
```

---

### Step 3 — Log Docker in to AWS

Replace `123456789012` with your actual 12-digit AWS Account ID:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
```

You should see `Login Succeeded`.

---

### Step 4 — Upload the image to AWS

Replace `123456789012` with your Account ID:

```bash
docker tag maison:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/maison:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/maison:latest
```

This uploads the image. It takes a minute or two depending on your connection.

---

### Step 5 — Deploy it to App Runner

This creates a running public instance of the app. Replace `123456789012` with your Account ID:

```bash
aws apprunner create-service \
  --service-name maison-demo \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "123456789012.dkr.ecr.us-east-1.amazonaws.com/maison:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "4000"
      }
    },
    "AutoDeploymentsEnabled": false,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::123456789012:role/AppRunnerECRAccessRole"
    }
  }' \
  --region us-east-1
```

> **Note:** App Runner needs permission to pull from ECR. If you get an error about the role, go to **AWS Console → App Runner → Create Service** and use the UI instead — it creates the IAM role automatically with a single checkbox.

Deployment takes 2–3 minutes. Check progress:

```bash
aws apprunner describe-service --service-arn <paste the ServiceArn from the output above> --region us-east-1 --query "Service.Status"
```

When it shows `RUNNING`, your app is live. Get the public URL:

```bash
aws apprunner describe-service --service-arn <ServiceArn> --region us-east-1 --query "Service.ServiceUrl" --output text
```

Open that URL in a browser — it's your live demo. Log in with the demo accounts listed above.

---

### Shutting everything down (important — stops all charges)

Run these in order when the demo is finished.

**Delete the App Runner service** (this is what costs money while running):
```bash
aws apprunner delete-service --service-arn <ServiceArn> --region us-east-1
```

**Delete the images from ECR** (small storage cost if left):
```bash
aws ecr batch-delete-image \
  --repository-name maison \
  --image-ids imageTag=latest \
  --region us-east-1
```

**Optionally delete the ECR repository itself** (free when empty, but tidy):
```bash
aws ecr delete-repository --repository-name maison --region us-east-1
```

To confirm nothing is still running:
```bash
aws apprunner list-services --region us-east-1
```

An empty `ServiceSummaryList` means you're all clear and not being charged.

---

## Security notes (demo-appropriate)

- Passwords hashed with bcrypt; JWT in an `httpOnly`, `SameSite=Lax` cookie.
- Role checked server-side on every protected route; ownership checked on every seller write
  (the IDOR boundary).
- Security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`.
- Rate limiting on auth endpoints. Input validated and sanitised server-side.
- Payment is **mocked** — no real funds, no card storage. `_reset` is open by default for testing;
  set `MAISON_ALLOW_RESET=false` to disable.

## Configuration (env vars)

| Variable               | Default                | Purpose                          |
|------------------------|------------------------|----------------------------------|
| `PORT`                 | `4000`                 | Server port                      |
| `MAISON_JWT_SECRET`    | dev default            | JWT signing secret               |
| `MAISON_DB_FILE`       | `:memory:`             | Set a path to persist the DB     |
| `MAISON_ALLOW_RESET`   | enabled                | Set to `false` to disable `_reset` |
