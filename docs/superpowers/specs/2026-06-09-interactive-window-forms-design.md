# Interactive forms in the multi-window views — Design

**Date:** 2026-06-09
**Status:** Approved
**Topic:** Replace the static text in the five standalone window/tab views with fill-and-submit forms, so the multi-window automation surface exercises real user interaction (input + submit + validation + deterministic result).

---

## 1. Goal & motivation

The Certificate / Size Guide / Share windows (added in v1.5.0) currently render **static text**. This
change gives each window a small **`<form>`** the user fills in and submits, producing an observable,
deterministic result (or an inline error). This makes the multi-window views a richer automation
surface — the framework can now drive input, submit, and assert on branching outcomes inside opened
tabs/popups, not just read static content.

All windows remain **internal SPA routes** served by the existing static fallback. No external
services, no new money/network logic.

### Confirmed decisions

- **Tailored interaction per window** (not one uniform button) — gives the framework a spread of
  interaction types.
- **Fill-and-submit forms** (not click-to-reveal buttons) — real `<form>` elements with a labelled
  input and a submit button.
- **Success is observed via revealed UI** — submit reveals a result element with its own
  `data-testid`; no dependency on OS clipboard or external state.
- **Certificate verify form starts empty** — the user must type the serial; tests cover both the
  match and mismatch branches.

---

## 2. Per-window forms

Each form: a `<form>` with `preventDefault` on submit, a `<label for>`-associated input, and a
`type="submit"` button (so Enter-to-submit works). On submit it validates and writes a result into
an `aria-live="polite"` region. All echoed user input passes through the existing `esc()` helper.

| Window | Input | Submit | Behaviour | Result testid(s) |
|---|---|---|---|---|
| **certificate-view** | serial (text), empty | "Verify" | Compare entered value (trimmed) to the certificate's real `serialNo` | match → `certificate-verified` ("✓ Verified authentic"); mismatch/empty → `certificate-verify-error` ("Serial does not match this certificate.") |
| **size-guide-view** | chest in inches (number) | "Find my size" | Deterministic lookup (see §3) | `size-recommendation` ("Recommended size: M"); invalid/empty number → `size-find-error` ("Enter a chest measurement in inches.") |
| **share-link-view** | reference tag (text) | "Build link" | Build `/product/<id>?ref=<tag>` from the trimmed tag (see §3), displayed as escaped text | `share-link-result` |
| **share-email-view** | email (text) | "Send" | Valid = non-empty and contains `@` | valid → `share-email-sent` ("Shared with <email>"); invalid → `share-email-error` ("Enter a valid email address.") |
| **share-preview-view** | gift message (text) | "Add message" | Echo the message into the preview (escaped) | `share-preview-message` ("Your message: <message>") |

### Control testids

| Window | Input testid | Button testid |
|---|---|---|
| certificate-view | `certificate-serial-input` | `certificate-verify-button` |
| size-guide-view | `size-chest-input` | `size-find-button` |
| share-link-view | `share-link-ref-input` | `share-link-build-button` |
| share-email-view | `share-email-input` | `share-email-send-button` |
| share-preview-view | `share-preview-message-input` | `share-preview-apply-button` |

The pre-existing content testids (`certificate-serial`, `share-link-value`, `size` table, etc.) and
the root view testids and deterministic `document.title`s are **unchanged** — existing v1.5.0 tests
keep passing.

### Spread of interaction types (intentional)

- Success/error branching: **certificate** (exact match), **email** (format).
- Numeric → categorical lookup: **size**.
- Input → transformed output: **share-link** (URL).
- Free-text echo (XSS-escaping surface): **share-preview** (message), **share-link** (ref),
  **certificate** (the entered serial is echoed back in the error message).

---

## 3. Deterministic logic

- **Size lookup** (`recommendSize(chestInches)`), inclusive bands matching the table:
  `≤ 34 → XS`, `35–36 → S`, `37–38 → M`, `39–40 → L`, `≥ 41 → XL`.
  Non-finite / empty input → the `size-find-error` branch.
- **Share link build:** result text is `/product/<id>?ref=<tag>` where `<tag>` is the raw input,
  trimmed; empty tag → just `/product/<id>`. The whole string is `esc()`-escaped before insertion
  (it is displayed as text in a `<code>`, not navigated to).
- **Email validity:** `value.trim().length > 0 && value.includes('@')`. (Intentionally lenient — the
  point is a deterministic valid/invalid branch, not RFC-grade validation.)
- **Certificate verify:** `entered.trim() === certificate.serialNo`. The certificate's serial is
  already in scope in `renderCertificateWindow` after the fetch.

No randomness, timestamps, or network calls in any result.

---

## 4. Where it lives

Inside the existing standalone-window renderers in `web/src/app.ts`:
`renderCertificateWindow`, `renderSizeGuideWindow`, `renderShareWindow`. Each renderer appends its
form markup to the existing content, then a small `wire…` step attaches the submit handler after
mount (mirroring how `pageProduct` attaches handlers after setting `innerHTML`). The
standalone-window section is already a cohesive block; this keeps the established "all views +
testids live in `app.ts`" pattern (per AGENTS.md §5/§7).

`web/dist` is rebuilt and committed (committed-and-served gotcha).

---

## 5. Accessibility & security

- Every input has an associated `<label for="…">`; the form has a submit button; results live in an
  `aria-live="polite"` container. Single `<h1>` per window preserved. Re-run axe on the certificate
  and size-guide windows.
- All echoed user input is escaped via `esc()` — the free-text echoes (preview message, share-link
  ref, certificate serial in the error message) are deliberate XSS-escaping surfaces and are tested.
- No SQL, no auth, no network — these are purely client-side forms.

---

## 6. Test coverage (five pillars)

- **UI** (`ui.spec.ts`): for each window, open it (via the existing new-tab / popup capture), fill
  the form, submit, and assert the result element + text. Include at least one error-branch
  assertion (certificate mismatch and invalid email).
- **Security** (`security.spec.ts`): submit a markup payload into the share-preview message (and the
  share-link ref) and assert it renders inert (no XSS; `window.__xss` undefined), reusing the
  existing certificate XSS-test pattern.
- **A11y** (`a11y.spec.ts`): axe on `/certificate/1` and `/size-guide` after the forms exist;
  assert each input is label-associated.
- **Mobile** (`mobile.spec.ts`): at 375px, fill and submit the certificate verify form in the opened
  tab and assert the verified result.

Implementation follows TDD (red → green) per pillar. Tests reset state via `POST /_reset` in
`beforeEach` where they touch the API.

---

## 7. Acceptance criteria

- Each of the five windows renders a `<form>` with a labelled input and a submit button carrying the
  testids in §2.
- Submitting a valid input reveals the window's result element with the deterministic text in §2/§3;
  invalid input (where a window has an error branch) reveals the error element instead.
- The certificate verify form starts **empty**; a correct serial verifies, a wrong one errors.
- Free-text echoes render inert (escaped) — no XSS.
- Existing v1.5.0 window tests (titles, root testids, new-tab/popup/three-at-once capture) still pass.
- `npm run typecheck && npm run lint && npm test` all green; `web/dist` rebuilt and committed.
- Version bumped and released per AGENTS.md §13 (new feature → **minor**: 1.5.0 → 1.6.0), README
  Docker version references updated, `v1.6.0` tag pushed.
