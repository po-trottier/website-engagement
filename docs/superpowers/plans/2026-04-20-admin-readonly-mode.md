# Admin Readonly Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-tier password system to the admin dashboard so the existing `ADMIN_PASSWORD` becomes readonly and a new `ADMIN_WRITE_PASSWORD` grants full CRUD. Readonly users see the same dashboard minus the mutating controls.

**Architecture:** Server-authoritative mode detection — `authenticate()` returns `'write' | 'readonly' | null`; non-list actions are gated on `mode === 'write'`. The client stores a single `canWrite` flag from the initial `list` response and uses it to hide mutating UI (`hidden` attribute) and render inputs with native `readonly`/`disabled` + matching ARIA attributes.

**Tech Stack:** Vanilla JS (ES5-ish), HTML, Netlify Functions (Node 20+ / Netlify Blobs), `node:crypto.timingSafeEqual`.

**Spec:** `docs/superpowers/specs/2026-04-20-admin-readonly-mode-design.md`

**Testing note:** This repo has no automated test harness. Each task uses manual verification (curl for the function, browser for the UI). Adding a harness is out of scope.

---

## File Structure

**Modified:**
- `netlify/functions/admin.mjs` — auth function + action gating (Task 1).
- `public/js/admin.js` — state, action-bar rendering, row rendering, dirty-binding skip, empty-state text, error surfacing (Tasks 3–7).

**Unchanged:**
- `public/admin/index.html` — no structural changes; all readonly visibility is driven from JS.
- `netlify/functions/rsvp.mjs` — guest-facing function is out of scope.

---

### Task 1: Backend — two-tier `authenticate()` + action gating

**Files:**
- Modify: `netlify/functions/admin.mjs` (full rewrite of the auth helper + handler prologue; other action branches untouched).

- [ ] **Step 1: Replace the `authenticate()` function**

Open `netlify/functions/admin.mjs`. Replace lines 7–15 (the existing `authenticate` function) with:

```js
function matches(input, secret) {
  if (!secret || secret.length < 8 || secret === "changeme") return false;
  if (input.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(input), Buffer.from(secret));
}

// Returns "write" | "readonly" | null. Write is checked first so that if an
// operator misconfigures both env vars to the same value, the caller gets the
// more-privileged interpretation (fail-safe for the operator, not the attacker).
function authenticate(body) {
  const input = String(body.password || "");
  const writePw = Netlify.env.get("ADMIN_WRITE_PASSWORD");
  const readPw = Netlify.env.get("ADMIN_PASSWORD");
  if (matches(input, writePw)) return "write";
  if (matches(input, readPw)) return "readonly";
  return null;
}
```

- [ ] **Step 2: Update the handler to capture mode and gate mutations**

In the same file, locate the auth check currently at lines 28–33:

```js
    if (!authenticate(body)) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
```

Replace with:

```js
    const mode = authenticate(body);
    if (!mode) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const store = getStore("rsvps");
    const action = body.action || "list";

    if (action !== "list" && mode !== "write") {
      return new Response(
        JSON.stringify({ error: "Readonly mode: write access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
```

Note: this moves the existing `const store = getStore("rsvps");` and `const action = body.action || "list";` lines (currently at lines 35–36) up into the auth block. Delete the duplicate declarations from their old location.

- [ ] **Step 3: Include `mode` in the `list` response**

Find the list response (currently near line 65):

```js
      return new Response(JSON.stringify({ rsvps, adminEmail }), {
```

Change to:

```js
      return new Response(JSON.stringify({ rsvps, adminEmail, mode }), {
```

- [ ] **Step 4: Syntax check**

Run: `node --check netlify/functions/admin.mjs`
Expected: no output (success). If it errors, fix the syntax before continuing.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/admin.mjs
git commit -m "Add readonly/write mode to admin function with server-side gating"
```

---

### Task 2: Backend — manual verification via curl

**Files:** none (verification only).

- [ ] **Step 1: Start the local Netlify dev server**

Run: `npx netlify dev` (in a separate terminal; runs on `http://localhost:8888` by default).

If this is the first time and `ADMIN_PASSWORD` / `ADMIN_WRITE_PASSWORD` aren't set locally, export them before starting:

```bash
export ADMIN_PASSWORD="readonly-test-pw-1234"
export ADMIN_WRITE_PASSWORD="write-test-pw-5678"
npx netlify dev
```

Both must be ≥ 8 chars and not `"changeme"`.

- [ ] **Step 2: Verify invalid password → 401**

```bash
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong","action":"list"}'
```

Expected: `401` with `{"error":"Invalid password"}`.

- [ ] **Step 3: Verify readonly password + list → 200 with `mode: "readonly"`**

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"readonly-test-pw-1234","action":"list"}' | jq '.mode, (.rsvps | length)'
```

Expected: `"readonly"` and a number (0 if store is empty).

- [ ] **Step 4: Verify readonly password + create → 403**

```bash
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"readonly-test-pw-1234","action":"create","fields":{"name":"Test User"}}'
```

Expected: `403` with `{"error":"Readonly mode: write access required"}`.

- [ ] **Step 5: Verify readonly password + update → 403**

```bash
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"readonly-test-pw-1234","action":"update","id":"00000000-0000-0000-0000-000000000000","fields":{"name":"X"}}'
```

Expected: `403` (the auth gate runs before the "not found" check).

- [ ] **Step 6: Verify readonly password + delete → 403**

```bash
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"readonly-test-pw-1234","action":"delete","id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `403`.

- [ ] **Step 7: Verify write password + list → 200 with `mode: "write"`**

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"write-test-pw-5678","action":"list"}' | jq '.mode'
```

Expected: `"write"`.

- [ ] **Step 8: Verify write password + create → 200**

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"write-test-pw-5678","action":"create","fields":{"name":"Curl Test","attending":true,"plusOnes":0}}' | jq '.rsvp.id'
```

Expected: a UUID string. Note it for the next step.

- [ ] **Step 9: Verify write password + delete (on the just-created UUID) → 200**

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/admin \
  -H "Content-Type: application/json" \
  -d '{"password":"write-test-pw-5678","action":"delete","id":"<uuid-from-previous-step>"}' | jq '.success'
```

Expected: `true`.

- [ ] **Step 10: Nothing to commit — verification complete.**

---

### Task 3: Frontend — `canWrite` state + login/logout wiring

**Files:**
- Modify: `public/js/admin.js`.

- [ ] **Step 1: Add the `canWrite` state variable**

Find the block of top-level state declarations (currently lines 12–23, starting with `var rsvps = [];`). Immediately after `var adminEmail = "";` (line 15), add:

```js
  var canWrite = false;  // single source of truth for UI permissions
```

- [ ] **Step 2: Populate `canWrite` on successful login**

Find the login success path inside `api("list").then(...)` (currently around line 72–78). The current code reads:

```js
      rsvps = data.rsvps;
      adminEmail = data.adminEmail || "";
      loginEl.style.display = "none";
      dashboardEl.style.display = "block";
      logoutBtn.style.display = "";
      renderCards();
      renderTable();
```

Insert a new line after `adminEmail = data.adminEmail || "";`:

```js
      canWrite = data.mode === "write";
```

So the block reads:

```js
      rsvps = data.rsvps;
      adminEmail = data.adminEmail || "";
      canWrite = data.mode === "write";
      loginEl.style.display = "none";
      dashboardEl.style.display = "block";
      logoutBtn.style.display = "";
      renderCards();
      renderTable();
```

At this point the `canWrite` flag is populated but nothing consumes it yet. The app behaves exactly as before (all controls visible, all fields editable, server still rejects mutations from a readonly password). Consumers are added in Tasks 4–7.

- [ ] **Step 3: Reset `canWrite` on logout**

Find the logout handler (currently lines 94–108). After the existing state resets (`password = ""; rsvps = []; pendingNew = []; dirty.clear(); dirtyFields = {}; selected.clear();`), add:

```js
    canWrite = false;
```

The final logout block should read:

```js
  logoutBtn.addEventListener("click", function () {
    password = "";
    rsvps = [];
    pendingNew = [];
    dirty.clear();
    dirtyFields = {};
    selected.clear();
    canWrite = false;
    dashboardEl.style.display = "none";
    logoutBtn.style.display = "none";
    loginEl.style.display = "";
    loginBtn.disabled = false;
    loginBtn.textContent = "View RSVPs";
    passwordInput.value = "";
    passwordInput.focus();
  });
```

- [ ] **Step 4: Commit**

```bash
git add public/js/admin.js
git commit -m "Add canWrite state for admin readonly/write mode"
```

---

### Task 4: Frontend — action-bar visibility (`applyMode()`)

**Files:**
- Modify: `public/js/admin.js`.

- [ ] **Step 1: Cache references to the hideable action-bar elements**

Find the block of `document.getElementById` lookups (currently lines 25–43). After `var mobileSortSelect = document.getElementById("mobile-sort-select");` (line 43), add:

```js
  // Elements hidden when the session is readonly.
  var mutatingActionEls = [addBtn, saveBtn, batchDeleteBtn];
```

- [ ] **Step 2: Add the `applyMode()` function**

Directly after the `updateActionBar` function ends (currently line 121), add:

```js
  // Show/hide mutating controls based on canWrite. Called after login so the
  // initial DOM matches the permission level.
  function applyMode() {
    var hide = !canWrite;
    mutatingActionEls.forEach(function (el) {
      if (el) el.hidden = hide;
    });
    // The two .action-bar-spacer elements bracket the save button. When save
    // is hidden they'd create a double-wide dead gap — hide them too so the
    // remaining controls sit flush. Keep the .action-bar-divider / count pair
    // because it still labels the batch-email selection.
    document.querySelectorAll(".action-bar .action-bar-spacer").forEach(function (el) {
      el.hidden = hide;
    });
  }
```

- [ ] **Step 3: Wire `applyMode()` into the login success path**

In the login success handler (modified in Task 3, currently around lines 72–80), insert a call to `applyMode()` after `logoutBtn.style.display = "";` and before `renderCards();`:

```js
      rsvps = data.rsvps;
      adminEmail = data.adminEmail || "";
      canWrite = data.mode === "write";
      loginEl.style.display = "none";
      dashboardEl.style.display = "block";
      logoutBtn.style.display = "";
      applyMode();
      renderCards();
      renderTable();
```

- [ ] **Step 4: Manual verification (browser — readonly)**

1. Ensure `netlify dev` is running with both env vars set (from Task 2, Step 1).
2. Open `http://localhost:8888/admin/` in a browser.
3. Log in with the **readonly** password.
4. Visually confirm: Add, Save, and Delete (trash) buttons are not in the DOM-visible layout. Email, Export, and Logout buttons remain. No awkward 2-em gap where save used to be.
5. Log out.
6. Log in with the **write** password.
7. Confirm all buttons (Add, Delete, Save, Email, Export, Logout) are visible and the layout matches main.

- [ ] **Step 5: Commit**

```bash
git add public/js/admin.js
git commit -m "Hide mutating action-bar buttons in readonly mode"
```

---

### Task 5: Frontend — row fields readonly + skip dirty binding

**Files:**
- Modify: `public/js/admin.js`.

- [ ] **Step 1: Add readonly/disabled attributes to row inputs**

Locate `renderTable()` — specifically the `tableBody.innerHTML = display.map(...)` block (currently lines 203–219). Each row builds 5 editable controls. We need to inject attributes conditionally.

Just above `tableBody.innerHTML = display.map(function (r) {` (currently line 203), add helper-constant declarations local to the closure:

```js
    var ro = canWrite ? "" : " readonly aria-readonly=\"true\"";
    var dis = canWrite ? "" : " disabled aria-disabled=\"true\"";
```

Then update the `return` inside the `.map(...)` call. Find these lines:

```js
        '<td data-label="Name">' + (v.attending ? '<span class="glance-yes card-glance">&#10003;</span>' : '<span class="glance-no card-glance">&#10005;</span>') + '<input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="name" value="' + escAttr(v.name) + '"' + (isNew ? ' autofocus' : '') + '>' + (v.plusOnes > 0 ? '<span class="glance-plus card-glance">+' + v.plusOnes + '</span>' : '') + '<span class="card-toggle"><svg class="icon" viewBox="0 0 24 24"><path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/></svg></span></td>' +
        '<td class="card-detail" data-label="Email"><input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="email" value="' + escAttr(v.email || "") + '"></td>' +
        '<td class="card-detail" data-label="Phone"><input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="phone" value="' + escAttr(v.phone || "") + '"></td>' +
        '<td class="card-detail" data-label="Attending"><select class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="attending"><option value="true"' + (v.attending ? " selected" : "") + '>Yes</option><option value="false"' + (!v.attending ? " selected" : "") + '>No</option></select></td>' +
        '<td class="card-detail" data-label="+1s"><input class="edit-field edit-field-small' + (isDirty ? " dirty" : "") + '" type="number" data-field="plusOnes" min="0" max="10" value="' + (v.plusOnes || 0) + '"></td>' +
```

Replace with (the changes are the inserted `ro`/`dis` concatenations):

```js
        '<td data-label="Name">' + (v.attending ? '<span class="glance-yes card-glance">&#10003;</span>' : '<span class="glance-no card-glance">&#10005;</span>') + '<input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="name" value="' + escAttr(v.name) + '"' + (isNew ? ' autofocus' : '') + ro + '>' + (v.plusOnes > 0 ? '<span class="glance-plus card-glance">+' + v.plusOnes + '</span>' : '') + '<span class="card-toggle"><svg class="icon" viewBox="0 0 24 24"><path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/></svg></span></td>' +
        '<td class="card-detail" data-label="Email"><input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="email" value="' + escAttr(v.email || "") + '"' + ro + '></td>' +
        '<td class="card-detail" data-label="Phone"><input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="phone" value="' + escAttr(v.phone || "") + '"' + ro + '></td>' +
        '<td class="card-detail" data-label="Attending"><select class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="attending"' + dis + '><option value="true"' + (v.attending ? " selected" : "") + '>Yes</option><option value="false"' + (!v.attending ? " selected" : "") + '>No</option></select></td>' +
        '<td class="card-detail" data-label="+1s"><input class="edit-field edit-field-small' + (isDirty ? " dirty" : "") + '" type="number" data-field="plusOnes" min="0" max="10" value="' + (v.plusOnes || 0) + '"' + ro + '></td>' +
```

Rules applied:
- Text/number inputs (`name`, `email`, `phone`, `plusOnes`): `readonly aria-readonly="true"`. Native `readonly` blocks editing while preserving focus + copy.
- `attending` select: `disabled aria-disabled="true"`. Native `disabled` is required because `<select>` does not honor `readonly`.

- [ ] **Step 2: Skip dirty-tracking bind in readonly mode**

Find `bindTableEvents()` (currently line 277). Locate the "Dirty tracking" block (currently lines 320–336):

```js
    // Dirty tracking
    tableBody.querySelectorAll(".edit-field").forEach(function (field) {
      function markDirty() {
        var tr = field.closest("tr");
        var id = tr.dataset.id;
        if (id.indexOf(NEW_PREFIX) === 0) return; // already tracked as new
        dirty.add(id);
        dirtyFields[id] = readRowFields(tr);
        tr.classList.add("row-dirty");
        tr.querySelectorAll(".edit-field").forEach(function (f) {
          f.classList.add("dirty");
        });
        updateActionBar();
      }
      field.addEventListener("input", markDirty);
      field.addEventListener("change", markDirty);
    });
```

Wrap the entire block in an `if (canWrite)` guard:

```js
    // Dirty tracking (skip in readonly — no save path exists)
    if (canWrite) {
      tableBody.querySelectorAll(".edit-field").forEach(function (field) {
        function markDirty() {
          var tr = field.closest("tr");
          var id = tr.dataset.id;
          if (id.indexOf(NEW_PREFIX) === 0) return; // already tracked as new
          dirty.add(id);
          dirtyFields[id] = readRowFields(tr);
          tr.classList.add("row-dirty");
          tr.querySelectorAll(".edit-field").forEach(function (f) {
            f.classList.add("dirty");
          });
          updateActionBar();
        }
        field.addEventListener("input", markDirty);
        field.addEventListener("change", markDirty);
      });
    }
```

- [ ] **Step 3: Manual verification (browser)**

1. Reload the admin page.
2. Log in with the **readonly** password.
3. Click into the name field of any row — the caret appears (good: focus preserved) but typing does nothing.
4. Try the attending dropdown — it won't open (disabled).
5. Try the `+1s` number input — can't change the value; up/down arrows don't fire.
6. Confirm no row gets an orange "dirty" border when you click around.
7. Log out, log in with the **write** password.
8. Confirm editing works as before and dirty tracking still lights up the row / save count.

- [ ] **Step 4: Commit**

```bash
git add public/js/admin.js
git commit -m "Render row inputs as readonly/disabled when session is readonly"
```

---

### Task 6: Frontend — empty-state message

**Files:**
- Modify: `public/js/admin.js`.

- [ ] **Step 1: Conditional empty-state message**

Find the empty-row branch inside `renderTable()` (currently line 196):

```js
    if (all.length === 0) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="' + (columns.length + 1) + '">No RSVPs yet.<br>Click the + button to add a guest.</td></tr>';
```

Replace with:

```js
    if (all.length === 0) {
      var emptyMsg = canWrite
        ? 'No RSVPs yet.<br>Click the + button to add a guest.'
        : 'No RSVPs yet.';
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="' + (columns.length + 1) + '">' + emptyMsg + '</td></tr>';
```

- [ ] **Step 2: Manual verification**

To trigger the empty state you need zero RSVPs. Either:
- Temporarily delete all rows while logged in as write, then log out and back in as readonly, OR
- Point at a fresh store.

Confirm the readonly empty-state reads only `"No RSVPs yet."` with no reference to the + button.

(If trivial to reproduce: skip and trust the code change. Commit either way.)

- [ ] **Step 3: Commit**

```bash
git add public/js/admin.js
git commit -m "Omit add-guest hint from empty state in readonly mode"
```

---

### Task 7: Frontend — surface 403 errors from mutating requests

**Files:**
- Modify: `public/js/admin.js`.

Rationale: the UI hides the mutating buttons, so readonly users can't trigger these paths through legitimate clicks. This is defense-in-depth — if the server returns 403 because the session really is readonly (e.g., client tampering, stale tab, future bug), we should surface it instead of silently swallowing.

- [ ] **Step 1: Alert on error in the save/update loop**

In the save handler (currently around lines 422–431), find:

```js
      try {
        var data = await api("update", { id: id, fields: fields });
        if (data.rsvp) {
          var idx = rsvps.findIndex(function (r) { return r.id === id; });
          if (idx !== -1) rsvps[idx] = data.rsvp;
        }
      } catch { /* continue */ }
```

Replace with:

```js
      try {
        var data = await api("update", { id: id, fields: fields });
        if (data && data.error) { alert("Server error: " + data.error); continue; }
        if (data.rsvp) {
          var idx = rsvps.findIndex(function (r) { return r.id === id; });
          if (idx !== -1) rsvps[idx] = data.rsvp;
        }
      } catch { /* continue */ }
```

- [ ] **Step 2: Alert on error in the save/create loop**

Find the create block (currently around lines 440–445):

```js
      try {
        var data = await api("create", { fields: fields });
        if (data.rsvp) rsvps.unshift(data.rsvp);
      } catch { /* continue */ }
```

Replace with:

```js
      try {
        var data = await api("create", { fields: fields });
        if (data && data.error) { alert("Server error: " + data.error); continue; }
        if (data.rsvp) rsvps.unshift(data.rsvp);
      } catch { /* continue */ }
```

- [ ] **Step 3: Alert on error in the batch-delete loop**

Find the delete block (currently around lines 509–512):

```js
      try {
        await api("delete", { id: id });
        rsvps = rsvps.filter(function (r) { return r.id !== id; });
      } catch { /* continue */ }
```

Replace with:

```js
      try {
        var data = await api("delete", { id: id });
        if (data && data.error) { alert("Server error: " + data.error); continue; }
        rsvps = rsvps.filter(function (r) { return r.id !== id; });
      } catch { /* continue */ }
```

- [ ] **Step 4: Manual verification (forced readonly mutation)**

1. Log in with the **readonly** password.
2. Open devtools console.
3. Paste and run (replaces hidden buttons' logic by invoking the API directly with the current password):

```js
fetch("/.netlify/functions/admin", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({password:"readonly-test-pw-1234", action:"create", fields:{name:"Forbidden"}})
}).then(r=>r.json()).then(console.log);
```

Expected console output: `{error: "Readonly mode: write access required"}`. No alert yet because this bypasses our handler.

4. To exercise our handler, unhide the add button from devtools (`$0.hidden = false` after selecting the add button) and click it, then click save. Expected: an alert reading `Server error: Readonly mode: write access required`.

- [ ] **Step 5: Commit**

```bash
git add public/js/admin.js
git commit -m "Surface server-side 403s from mutating admin calls via alert"
```

---

### Task 8: Frontend — end-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Fresh reload & readonly walkthrough**

1. Reload `http://localhost:8888/admin/`.
2. Log in with the **readonly** password.
3. Confirm action bar contains: Email (disabled until selection), Export, Logout. Nothing else.
4. Confirm at least one row's inputs are not editable; attending select won't open.
5. Sort by each column header — still works.
6. Paginate (if ≥ 100 rows) — still works. Use the mobile-sort dropdown at a narrow viewport — still works.
7. Tick one checkbox on a row with an email → Email button enables → click it → mailto opens with the address in BCC.
8. Click Export → CSV → downloads.
9. Click Logout.

- [ ] **Step 2: Write walkthrough**

1. Log in with the **write** password.
2. Confirm Add, Save, Delete buttons visible. Inputs editable. Select dropdown works.
3. Click Add → new row appears highlighted → type a name with first + last → Save badge shows "1" → click Save → row persists with a date.
4. Edit that row's email → dirty border appears → Save → change persists after reload (log out, back in).
5. Tick the row → Delete → confirm → row disappears.
6. Log out.

- [ ] **Step 3: Accessibility spot-check**

1. Log in as readonly.
2. Tab through a row. Focus should land on the text inputs (readonly inputs are still focusable — this is by design so users can copy values). Focus should skip the attending `<select>` (disabled = not focusable).
3. If a screen reader is available (VoiceOver/NVDA/Narrator): inputs are announced as "read only", select is announced as "dimmed" or "unavailable".

- [ ] **Step 4: Nothing to commit — verification complete.**

---

### Task 9: Deploy checklist

**Files:** none (ops step, documented for completeness).

- [ ] **Step 1: Configure Netlify production env vars**

In the Netlify dashboard → Site settings → Environment variables:

1. Keep existing `ADMIN_PASSWORD` (this is now the readonly password — value can stay the same so existing audiences keep working).
2. Add `ADMIN_WRITE_PASSWORD` with a new, distinct strong value (≥ 8 chars, not `"changeme"`).
3. Flag **both** env vars as secrets via Netlify's Secrets Controller toggle. This enables stricter handling (masked in logs, no post-processing scope, read only by Netlify systems).

- [ ] **Step 2: Deploy**

Push to `main` (or the branch Netlify is tracking). Wait for the deploy to go live.

- [ ] **Step 3: Smoke test production**

Repeat Task 8 steps 1 and 2 against the production URL to confirm both passwords work as expected.

- [ ] **Step 4: Communicate**

Share the readonly password with the wider helper audience; keep the write password limited to people who need it.

---

## Summary

- 9 tasks, ~30–45 min of hands-on work plus verification.
- Backend: one file (`admin.mjs`), one coherent change.
- Frontend: one file (`admin.js`) touched across five tasks, each change scoped to a distinct concern (state, action bar, row inputs, empty state, error surfacing).
- No HTML or CSS changes.
- No new dependencies.
