# Buyer Registration — Extended Profile Design

**Date:** 2026-05-25
**Version target:** 1.3.0
**Status:** Approved

## Overview

Add a full buyer registration flow where a new user can supply their first name, last name, email, gender, phone number, password, and a password confirmation field. Upon successful registration the buyer is automatically logged in and can immediately browse the catalogue and complete a purchase. Seller registration is unchanged.

## Decision log

- **Schema approach:** Additive columns on `users` (Option A) — four new nullable columns; no existing column removed.
- **Form layout:** Two-column grouping (Option B) — name pair on row 1, gender/phone pair on row 2, password/confirm pair on row 3.
- **Optional fields:** `gender` and `phone` are optional; `firstName` and `lastName` are required for buyers.
- **Confirm password:** Client-side only — mismatch shows inline error and blocks submission; the value is never sent to the API.

---

## 1. Database Schema

Four nullable columns added to the `users` table:

```sql
first_name  TEXT  -- required at registration for buyers; NULL for sellers
last_name   TEXT  -- required at registration for buyers; NULL for sellers
gender      TEXT  CHECK (gender IN ('female','male','non-binary','prefer_not_to_say'))
phone       TEXT  -- stored as provided; max 30 chars
```

The existing `name` column is retained. For buyers it is composed server-side as `first_name || ' ' || last_name` and stored at registration time. For sellers the `name` field is set directly as before.

The seed buyer (`buyer@maison.test`, previously `Aurelie Dupont`) is updated to carry `first_name='Aurelie'` and `last_name='Dupont'` so that deterministic tests continue to pass after the schema change.

The `publicUser()` helper gains four additional fields in its return shape:

```ts
{
  id: number;
  email: string;
  name: string;         // composed full name — unchanged
  role: string;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  phone: string | null;
}
```

---

## 2. API

### `POST /api/v1/auth/register`

Accepts the following new body fields when `role === 'buyer'`:

| Field       | Type   | Required for buyer | Validation                                              |
|-------------|--------|--------------------|---------------------------------------------------------|
| `firstName` | string | yes                | Non-empty after trim                                    |
| `lastName`  | string | yes                | Non-empty after trim                                    |
| `gender`    | string | no                 | One of `female`, `male`, `non-binary`, `prefer_not_to_say` |
| `phone`     | string | no                 | Max 30 characters                                       |

**Error codes introduced:**

| Code             | Status | Trigger                                    |
|------------------|--------|--------------------------------------------|
| `INVALID_FIRST_NAME` | 400 | `firstName` missing or blank for buyer     |
| `INVALID_LAST_NAME`  | 400 | `lastName` missing or blank for buyer      |
| `INVALID_GENDER`     | 400 | `gender` present but not one of the allowed values |
| `INVALID_PHONE`      | 400 | `phone` present but exceeds 30 characters  |

The existing `name` field is deprecated for buyers. If `firstName` and `lastName` are provided, `name` is ignored and composed server-side. Seller registration continues to use `name` directly and does not accept `firstName`/`lastName`.

No new API routes are required. Login, `/me`, cart, orders, and checkout routes are unchanged.

---

## 3. Frontend

### Registration page (`#/register`)

The existing `pageRegister()` function is updated with the two-column Option B layout:

**Row 1:** First Name | Last Name
**Row 2:** Email (full width)
**Row 3:** Gender (select, optional) | Phone (text, optional)
**Row 4:** Password | Confirm Password
**CTA:** Create Account button (full width)

The role toggle remains — selecting "Sell as Atelier" hides the buyer-specific fields and shows only the original seller fields (`name`, `email`, `password`). The buyer path is the default (aria-pressed="true" on the buyer toggle).

**Client-side validation before submission:**
1. `firstName` and `lastName` non-empty.
2. `password` matches `confirmPassword` — mismatch shows inline error `"Passwords do not match."` in `#register-alert` and aborts submission.
3. All other validation (email format, password strength, duplicate email) is deferred to the API and displayed from the error response.

**New `data-testid` attributes:**

| Element              | testid                       |
|----------------------|------------------------------|
| First name input     | `register-first-name`        |
| Last name input      | `register-last-name`         |
| Gender select        | `register-gender`            |
| Phone input          | `register-phone`             |
| Confirm password     | `register-confirm-password`  |
| Password mismatch error | shown in `register-error` (existing) |

---

## 4. Test Coverage

### UI (`tests/ui.spec.ts`)
- New buyer registers via the extended form (first name, last name, email, gender, phone, password, confirm) → verifies welcome flash and `data-role="buyer"`.
- New buyer adds a product to cart and completes checkout → verifies `order-confirmation` and `order-reference`.

### Mobile (`tests/mobile.spec.ts`)
- Same full registration → purchase flow at 375×812 viewport.
- Register page has no horizontal overflow.

### API (`tests/api.spec.ts`)
- `POST /auth/register` with all new buyer fields → 201, response contains `firstName`, `lastName`, `gender`, `phone`.
- Missing `firstName` → 400 `INVALID_FIRST_NAME`.
- Missing `lastName` → 400 `INVALID_LAST_NAME`.
- `gender` present but invalid value → 400 `INVALID_GENDER`.
- `phone` exceeding 30 chars → 400 `INVALID_PHONE`.

### Security (`tests/security.spec.ts`)
- Invalid gender value blocked server-side (400).
- Overlong phone blocked server-side (400).
- Confirm password mismatch is a client-only guard — no test against the API (the API accepts a valid password regardless).

### A11y (`tests/a11y.spec.ts`)
- Register page: all new inputs have associated `<label>` elements; no critical axe violations.

---

## 5. Release — v1.3.0

Once all five test suites pass (UI, Mobile, API, Security, A11y):

1. Bump `version` in `package.json` (root) to `1.3.0`.
2. Build Docker image: `docker build -t maison:1.3.0 -t maison:latest .`
3. Push both tags to the container registry.
4. Create GitHub release `v1.3.0` with a changelog entry describing the buyer registration feature. Attach the Docker image digest as a build artifact note.
