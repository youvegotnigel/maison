# Date of Birth — Popup Calendar Widget Design

**Date:** 2026-05-25
**Version target:** 1.4.0
**Status:** Approved

## Overview

Add a mandatory date-of-birth (DOB) field to both the buyer and seller signup flows. The field is surfaced as a **popup calendar widget** — a read-only trigger input that opens a floating panel with Month/Year `<select>` navigation controls and a 7-column day grid. Manual `<input type="date">` / `<input type="time">` elements are prohibited in this app; all date entry must go through the widget. Registration is rejected if the calculated age is under 18 years.

---

## 1. Database Schema

**New column on `users`:**

```sql
date_of_birth TEXT NOT NULL  -- stored as 'YYYY-MM-DD'
```

Added inside `initSchema()` in `server/src/db.ts`. No nullable fallback — the column is required for all users.

`publicUser()` gains one additional field:

```ts
{
  id: number;
  email: string;
  name: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  phone: string | null;
  dateOfBirth: string;        // 'YYYY-MM-DD'
}
```

**Seed data additions** (deterministic, hardcoded):

| Account | DOB |
|---|---|
| `seller@maison.test` | `1980-03-15` |
| `seller2@maison.test` | `1975-09-22` |
| `buyer@maison.test` | `1990-06-10` |

The `insUser` prepared statement in `seed()` gains the `date_of_birth` column. The `DbUser` interface gains `date_of_birth: string`.

---

## 2. API

### `POST /api/v1/auth/register`

New required field for **both** buyer and seller roles:

| Field | Type | Required | Validation |
|---|---|---|---|
| `dateOfBirth` | string | yes | `YYYY-MM-DD` format, age ≥ 18 full years |

Age is calculated birthday-accurately: year difference minus 1 if today's month/day is before the birthday month/day — not a simple year subtraction and not `365.25` division.

**New error codes:**

| Code | HTTP | Trigger |
|---|---|---|
| `MISSING_DOB` | 400 | `dateOfBirth` absent or empty string |
| `INVALID_DOB` | 400 | Not a parseable `YYYY-MM-DD` date |
| `UNDERAGE` | 400 | Calculated age < 18 years |

These codes follow the existing `{ error: { code, message } }` envelope used throughout the app.

**Updated `GET /api/v1/auth/me` response** — returns `dateOfBirth` as part of the user object (no route change, just a new field in the response shape).

### README updates

- Add `MISSING_DOB`, `INVALID_DOB`, `UNDERAGE` to the error codes list.
- Add a note to the `POST /auth/register` row clarifying the `dateOfBirth` field.
- Add `dateOfBirth` to the `GET /auth/me` response shape description.
- Update demo accounts table to include DOB.

---

## 3. Frontend — Calendar Widget

### Trigger field

- A styled read-only `<input>` showing the formatted date (e.g. `10 June 1990`) with a calendar icon (SVG, inline) on the right.
- `readonly` attribute prevents manual keyboard entry.
- `data-testid="dob-display"`
- Wrapped in a `<div class="field dob-field">` with a `<label>` for accessibility.
- The underlying selected value is stored in a JS variable (`dobValue: string`) and sent in the API payload as `dateOfBirth`.

### Popup panel

Appears directly below the trigger, `position: absolute`, full z-index above the form.

**Structure:**

```
┌────────────────────────────────────────┐
│  [◄]   [Month ▼]   [Year ▼]   [►]     │
│  Mo  Tu  We  Th  Fr  Sa  Su           │
│                        1   2   3       │
│   4   5   6   7   8   9  10           │
│  11  12  13  14  15  16  17           │
│  18  19  20  21  22  23  24           │
│  25  26  27  28  29  30  31           │
└────────────────────────────────────────┘
```

- Dark card: `background: var(--card)`, border `1px solid var(--gold)`, `border-radius: 4px`, `box-shadow`.
- Month header row: prev/next `<button>` elements with `◄`/`►` glyphs, between them two `<select>` elements styled gold-on-dark.
- Weekday header row: Mo–Su in `var(--gold)` at reduced opacity, not interactive.
- Day cells: `<button>` elements in a 7-column CSS grid. `data-testid="dob-day-{N}"` where N is the day number (1–31).
- Days in the lead/trail of the month (blank cells) are empty `<div>` spacers, not rendered as buttons.
- Dates after the 18-year cutoff are rendered with `disabled` and a dimmed style.
- Selected day: gold background (`--gold`), dark text, visually distinct.
- Clicking a day: closes popup, updates trigger display, stores value.
- Click outside popup or Escape key: closes without selecting.

### `data-testid` map

| Element | testid |
|---|---|
| Trigger read-only input | `dob-display` |
| Popup container | `dob-picker` |
| Month `<select>` | `dob-month-select` |
| Year `<select>` | `dob-year-select` |
| Prev month button | `dob-prev-month` |
| Next month button | `dob-next-month` |
| Day button (day N) | `dob-day-{N}` |

### Year range

`1920` to `currentYear − 18` (inclusive). Future years and the current 18-year window are excluded from the `<select>` options entirely — they cannot be navigated to.

### Playwright interaction pattern

```ts
await page.getByTestId('dob-display').click();               // open picker
await page.getByTestId('dob-year-select').selectOption('1990');
await page.getByTestId('dob-month-select').selectOption('6'); // June = value "6"
await page.getByTestId('dob-day-10').click();                 // select 10th
```

### Widget placement in form

The DOB field is placed:
- **Buyer form:** between the phone field row and the password row.
- **Seller form:** between the email field and the password row.

Both placements use the same `buildDobPicker()` helper function that returns the field HTML and wires up the popup logic. The widget is self-contained — it reads and writes a single `dobValue` string per form instance.

### Styling notes

- No `<input type="date">` or `<input type="time">` anywhere in the app.
- Widget CSS lives in `web/dist/styles.css` under a `.dob-*` namespace.
- Month/Year selects use `appearance: none`, gold border, dark background to match existing `.field select` styling.
- The popup panel uses `pointer-events: none` + `opacity: 0` when closed, `pointer-events: auto` + `opacity: 1` when open, with a short CSS transition for feel.
- The calendar icon in the trigger is an inline SVG matching the gold palette.

---

## 4. Test Coverage

### `tests/api.spec.ts` — new cases

- `POST /auth/register` buyer with valid DOB → 201, response includes `dateOfBirth`.
- `POST /auth/register` seller with valid DOB → 201, response includes `dateOfBirth`.
- Missing `dateOfBirth` for buyer → 400 `MISSING_DOB`.
- Missing `dateOfBirth` for seller → 400 `MISSING_DOB`.
- Invalid format (`"not-a-date"`) → 400 `INVALID_DOB`.
- DOB giving age exactly 17 → 400 `UNDERAGE`.
- DOB giving age exactly 18 → 201 (boundary pass).
- `GET /auth/me` after login → response includes `dateOfBirth`.

### `tests/ui.spec.ts` — updates

All existing buyer and seller registration tests gain the DOB picker interaction (open → select year → select month → click day).

New dedicated test:
- Buyer submits with a DOB that makes them 17 → `register-error` shows age restriction message, stays on register page.

### `tests/security.spec.ts` — new

- Direct API call with underage DOB (bypassing UI widget) → 400 `UNDERAGE`.
- Direct API call with missing `dateOfBirth` → 400 `MISSING_DOB`.

### `tests/a11y.spec.ts` — new

- DOB trigger field has an associated `<label>`.
- Popup container has `role="dialog"` and `aria-label="Select date of birth"`.
- Day buttons have `aria-label="Day {N}"`.

### `tests/mobile.spec.ts` — updates

Existing mobile registration test gains DOB picker steps. Verify the popup does not overflow the viewport at 375 px width.

---

## 5. README Changes

The following updates are required in `README.md`:

1. **API reference table** — add note to `POST /auth/register` row: accepts `dateOfBirth` (required for both roles).
2. **Error codes list** — add `MISSING_DOB`, `INVALID_DOB`, `UNDERAGE`.
3. **Demo accounts table** — add DOB column.
4. **`GET /auth/me`** — note that response now includes `dateOfBirth`.

---

## 6. Release — v1.4.0

Once all five test suites pass:

1. Bump `version` in `package.json` (root) to `1.4.0`.
2. Build Docker image: `docker build -t maison:1.4.0 -t maison:latest .`
3. Push both tags.
4. Create GitHub release `v1.4.0` with changelog entry describing the DOB calendar widget and age gate.
