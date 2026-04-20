# Admin Dashboard — Two-Tier Password (Readonly / Write) Mode

**Status:** Design
**Date:** 2026-04-20
**Component:** `public/admin/`, `public/js/admin.js`, `netlify/functions/admin.mjs`

## 1. Context & Motivation

The RSVP admin dashboard is gated by a single shared password (`ADMIN_PASSWORD`) that grants full CRUD access. We want to share the dashboard more broadly (e.g., with family members helping coordinate) without giving them the ability to mutate RSVPs.

Goal: introduce a second access tier — a *readonly* password that lets the holder view data, select rows, send batch emails, and export CSV, but cannot add/edit/delete.

## 2. Requirements

**Functional**
- Two passwords, configured via environment variables:
  - `ADMIN_PASSWORD` (existing) → **readonly** access
  - `ADMIN_WRITE_PASSWORD` (new) → **full write** access
- A single login field accepts either password. The server determines the mode.
- Readonly users can: view, sort, paginate, select rows, batch-email selected, export CSV, logout.
- Readonly users cannot: add, edit, delete, or save anything.
- Write users retain all existing behavior.

**Non-functional**
- **Server-side authorization is authoritative.** The UI hides/disables controls as UX, but the function rejects any mutating call that isn't accompanied by the write password.
- **Principle of least privilege.** Default is readonly. Write mode requires an explicit separate secret.
- **No new infrastructure.** Use the existing env-var + `timingSafeEqual` pattern; this is the idiomatic Netlify Functions approach for shared-password admin tools. (Netlify Identity / JWT RBAC is over-engineered for a single-admin, two-tier share.)
- **Accessibility.** Readonly state must be communicated to assistive tech, not just visually.

## 3. Architecture

```
┌────────────────┐   password       ┌────────────────────┐
│ admin/index    │ ───────────────▶ │ admin.mjs function │
│   (browser)    │                  │                    │
│                │ ◀─────────────── │ authenticate()     │
│ canWrite=false │  { mode, rsvps } │  → 'write'         │
│ or true        │                  │  → 'readonly'      │
└────────────────┘                  │  → null            │
       ▲                            │                    │
       │  every mutating request    │ gates: create,     │
       │  carries the password      │ update, delete on  │
       │                            │ mode === 'write'   │
       └────────────────────────────┘
```

Mode is derived server-side on every request. The client stores the result of the initial `list` call into a single flag (`canWrite`) and uses it to gate UI rendering. The password itself is already held in a JS variable (`password`) for subsequent calls; this doesn't change.

## 4. Backend (`netlify/functions/admin.mjs`)

### 4.1 `authenticate(body)` — changed signature

Returns a mode string instead of a boolean.

```js
function authenticate(body) {
  const input = String(body.password || "");
  const writePw = Netlify.env.get("ADMIN_WRITE_PASSWORD");
  const readPw  = Netlify.env.get("ADMIN_PASSWORD");

  if (matches(input, writePw)) return "write";
  if (matches(input, readPw))  return "readonly";
  return null;
}

function matches(input, secret) {
  if (!secret || secret.length < 8 || secret === "changeme") return false;
  if (input.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(input), Buffer.from(secret));
}
```

Notes:
- **Write is checked first.** If an operator reuses the same string for both vars (misconfiguration), they get write — the more privileged interpretation. Documented in the spec; unlikely in practice.
- The 8-char / `changeme` guard is kept from the existing code.
- If `ADMIN_WRITE_PASSWORD` isn't set, write mode is simply unreachable; the function still works in readonly.
- If `ADMIN_PASSWORD` isn't set (misconfig), readonly is unreachable, so nothing works — same failure mode as today.

### 4.2 Request handling

```js
const mode = authenticate(body);
if (!mode) return 401 { error: "Invalid password" };

const action = body.action || "list";

// list: allowed in both modes
// create | update | delete: require mode === "write"
if (action !== "list" && mode !== "write") {
  return 403 { error: "Readonly mode: write access required" };
}
```

### 4.3 `list` response — new field

```json
{ "rsvps": [...], "adminEmail": "...", "mode": "readonly" | "write" }
```

The `mode` field is returned only on the `list` response (it's the post-login handshake). Mutating responses don't need it since the client already knows its mode.

### 4.4 Error codes

| Condition | Status | Body |
|---|---|---|
| No / unknown password | 401 | `{ error: "Invalid password" }` |
| Readonly trying to mutate | 403 | `{ error: "Readonly mode: write access required" }` |
| Other existing errors | unchanged | |

## 5. Frontend

### 5.1 State (`public/js/admin.js`)

Add one top-level variable:

```js
var canWrite = false;  // single source of truth for UI permissions
```

Populated from the `list` response: `canWrite = data.mode === "write";`. Reset on logout.

### 5.2 Action-bar rendering — hide (don't disable)

In readonly mode, set `hidden` on:
- `#add-btn`
- `#save-btn`
- `#batch-delete-btn`

Keep visible:
- `#batch-email-btn` (non-mutating; composes a mailto)
- `#export-btn` / CSV menu (fully client-side on visible data)
- Row checkboxes, sort, pagination, logout

**Action-bar layout:** the existing bar includes `.action-bar-spacer` elements on either side of the save button and an `.action-bar-divider` before the selection count. When the surrounding mutating buttons are hidden, those separators become orphaned and create awkward gaps. Hide them in readonly mode too — specifically, both `.action-bar-spacer` elements. The `.action-bar-divider` / selection-count pair remains meaningful (it labels the active batch-email selection), so keep it.

Rationale: for actions that are *permanently unavailable* in this mode, hiding is clearer than a greyed-out button with no explanation.

### 5.3 Row rendering — readonly fields

Per accessibility best practice, each input type needs the correct native attribute (because `<select>` and checkboxes don't honor `readonly`). Pair each with its corresponding ARIA attribute for assistive tech.

| Field | Element | Readonly-mode attrs |
|---|---|---|
| `name`, `email`, `phone` | `<input type="text">` | `readonly aria-readonly="true"` |
| `plusOnes` | `<input type="number">` | `readonly aria-readonly="true"` |
| `attending` | `<select>` | `disabled aria-disabled="true"` |

Notes:
- Use **native attributes** so the browser actually blocks editing. `aria-*` alone is semantic-only and does not suppress interaction — that's an accessibility footgun.
- Do **not** use `pointer-events: none` as the guard — it blocks mouse but not keyboard.
- In readonly mode, skip binding the dirty-tracking `input`/`change` listeners entirely (they can't fire on readonly/disabled controls, but skipping the bind is cleaner and avoids dead code paths).

### 5.4 Select-all + row checkbox behavior

Unchanged. Selection drives batch-email, which remains available.

### 5.5 Dirty-state plumbing

In readonly mode:
- `dirty`, `dirtyFields`, `pendingNew`, and the save button are never populated or shown.
- `updateActionBar()` skips the save-count update when `!canWrite` (short-circuit).

### 5.6 Login error disambiguation

No UI change. Both "wrong password" and "server says mutate-in-readonly-mode" surface the same generic error path. The readonly → mutate path should never be hit via the legitimate UI (buttons are hidden); it's purely a defense-in-depth server check.

### 5.7 Logout

Already resets `password`, `rsvps`, etc. Add `canWrite = false;` to the reset.

### 5.8 Empty state

The current empty-row message reads *"No RSVPs yet. Click the + button to add a guest."* In readonly mode there is no + button, so the second sentence is misleading. Render only *"No RSVPs yet."* when `!canWrite`.

## 6. HTML (`public/admin/index.html`)

No structural HTML changes needed. The existing action-bar buttons have IDs; we toggle `hidden` via JS. Edit fields are generated in JS, so the attribute changes live in `admin.js`.

## 7. UI Behavior Matrix

| Element | Write mode | Readonly mode |
|---|---|---|
| Login field | visible | visible |
| Summary cards | visible | visible |
| Add button | visible | **hidden** |
| Save button | visible (with dirty count) | **hidden** |
| Batch-delete button | visible | **hidden** |
| Batch-email button | visible | visible |
| Export / CSV button | visible | visible |
| Row checkboxes | enabled | enabled |
| Sort / pagination / mobile sort | enabled | enabled |
| Row text inputs | editable | **readonly + aria-readonly** |
| Row select (attending) | editable | **disabled + aria-disabled** |
| Logout | visible | visible |

## 8. Error Handling

- **Wrong password** → existing path; login error displayed.
- **Readonly session, client somehow sends mutating request** (e.g., manually via devtools) → server returns 403. Client code path: the existing `.catch` / non-200 handling in the `api()` helper swallows failures silently today. We should surface a visible error in this case, since it represents a true policy failure, not a benign network issue. Plan: if any mutating response has `data.error`, `alert(data.error)` — single-line addition in `save`, `create`, `delete` handlers.
- **Write env var missing / too short** → write mode unreachable; operators see nothing different from today's behavior in readonly-only setups.

## 9. Testing Plan

Manual, since there's no test harness in this repo:

**Backend** (curl against the local `netlify dev` or deployed function):
1. No password → 401.
2. Wrong password → 401.
3. Readonly password + `list` → 200, `mode: "readonly"`.
4. Readonly password + `create` → 403.
5. Readonly password + `update` → 403.
6. Readonly password + `delete` → 403.
7. Write password + `list` → 200, `mode: "write"`.
8. Write password + `create`/`update`/`delete` → 200.

**Frontend** (browser):
1. Log in with readonly password:
   - Action bar shows only email + export; add/save/delete hidden.
   - Row inputs are readonly; select is disabled.
   - Cannot type into any cell.
   - Select rows → batch-email enabled, opens mailto.
   - Export CSV works.
   - Sort + pagination + mobile sort work.
   - Logout clears session.
2. Log in with write password:
   - All existing behavior intact (add, edit, save, delete, email, export).
3. Re-login flow: logout as readonly, login as write → UI correctly unlocks.
4. Accessibility spot-check:
   - Tab through readonly form: focus still lands on read-only inputs (so users can copy values); select is skipped (disabled).
   - Screen-reader announces "read only" / "disabled".

## 10. Deployment Steps

1. In Netlify dashboard → Site settings → Environment variables:
   - Keep existing `ADMIN_PASSWORD` (this becomes readonly).
   - Add new `ADMIN_WRITE_PASSWORD` with a distinct strong value.
   - **Flag both as secrets via Netlify's Secrets Controller.** This applies stricter handling (masked in logs, no post-processing scope, read only by Netlify systems).
2. Communicate the two passwords to the appropriate audiences.
3. Deploy.

## 11. Non-Goals

- Per-user accounts, JWT sessions, or Netlify Identity integration.
- Audit log of who did what (passwords are shared secrets; there's no user identity to log).
- Additional tiers beyond readonly / write.
- Rate limiting, lockout, or brute-force protection (the 8-char minimum and constant-time compare are the only guards; out of scope for this change).
- Changing the guest-facing `rsvp.mjs` function.

## 12. Open Questions

None at spec time. Flagged assumptions:
- Operators won't accidentally set both env vars to the same value. If they do, write wins — no data-integrity issue, just a surprise.
- Readonly holders are trusted not to share the password; the model is "friendly delegation," not adversarial.
