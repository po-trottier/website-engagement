# Admin RSVP Party Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a write-protected Party assignment and Athena/P-O attending-headcount summaries to the RSVP admin dashboard.

**Architecture:** Extend the existing RSVP Blob JSON with one canonical enum field and reuse the current server-authoritative write gate. Render a native select in the existing generic edit/save flow, calculate Party headcounts client-side, and keep legacy rows unassigned without a migration.

**Tech Stack:** Netlify Functions, plain browser JavaScript/HTML/CSS, Node.js built-in test runner

---

### Task 1: Persist and validate Party

**Files:**
- Modify: `test/admin-readonly.test.mjs`
- Modify: `netlify/functions/admin.mjs`
- Modify: `netlify/functions/rsvp.mjs`

- [ ] **Step 1: Write failing boundary and validation tests**

Allow the existing request helper to accept extra body fields:

```js
async function request(password, action, extra) {
  return handler(
    new Request("http://localhost/.netlify/functions/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ password, action }, extra || {})),
    })
  );
}
```

Add these tests:

```js
test("ADMIN_PASSWORD cannot update Party", async () => {
  env.set("ADMIN_PASSWORD", "read-pass");
  env.set("ADMIN_WRITE_PASSWORD", "write-pass");

  await assertReadonly(await request("read-pass", "update", {
    id: "00000000-0000-4000-8000-000000000000",
    fields: { party: "Athena" },
  }));
});

test("invalid Party is rejected before storage", async () => {
  env.set("ADMIN_PASSWORD", "read-pass");
  env.set("ADMIN_WRITE_PASSWORD", "write-pass");

  const response = await request("write-pass", "update", {
    id: "00000000-0000-4000-8000-000000000000",
    fields: { party: "Other" },
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid party" });
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/admin-readonly.test.mjs`

Expected: the invalid Party test fails because the request reaches Blob storage and returns 500; the read-only Party test already passes through the shared authorization gate.

- [ ] **Step 3: Implement the enum and defaults**

In `netlify/functions/admin.mjs`, add:

```js
const PARTY_VALUES = new Set(["", "Athena", "P-O"]);
```

After the read-only gate and before unsupported-action/storage handling, reject invalid create/update values:

```js
if (
  (action === "create" || action === "update") &&
  body.fields?.party !== undefined &&
  !PARTY_VALUES.has(body.fields.party)
) {
  return new Response(JSON.stringify({ error: "Invalid party" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
```

Normalize listed legacy records without writing them back:

```js
.map((r) => ({
  ...r.value,
  party: PARTY_VALUES.has(r.value.party) ? r.value.party : "",
}));
```

Persist Party on admin update/create:

```js
if (fields.party !== undefined) rsvp.party = fields.party;
```

```js
party: fields.party || "",
```

In `netlify/functions/rsvp.mjs`, hardcode the public default inside the stored RSVP object:

```js
party: "",
```

- [ ] **Step 4: Verify GREEN and syntax**

Run: `node --test test/admin-readonly.test.mjs`

Expected: all authorization tests pass.

Run: `node --check netlify/functions/admin.mjs; node --check netlify/functions/rsvp.mjs`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -- test/admin-readonly.test.mjs netlify/functions/admin.mjs netlify/functions/rsvp.mjs
git commit -m "Add RSVP Party persistence"
```

### Task 2: Add Party controls, summaries, and export

**Files:**
- Create: `test/admin-party-ui.test.mjs`
- Modify: `public/js/admin.js`
- Modify: `public/admin/index.html`
- Modify: `README.md`

- [ ] **Step 1: Write a failing UI contract test**

Create a dependency-free source contract that protects the required UI surface:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin exposes Party assignment and summaries", async () => {
  const source = await readFile(
    new URL("../public/js/admin.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /data-field="party"/);
  assert.match(source, /Athena Guests/);
  assert.match(source, /P-O Guests/);
  assert.match(source, /Name,Party,Email,Phone,Attending,Plus Ones,Date/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/admin-party-ui.test.mjs`

Expected: FAIL because Party controls and summaries do not exist.

- [ ] **Step 3: Implement the Party headcounts**

Inside `renderCards()`, calculate only attending headcount including +1s:

```js
function partyGuests(party) {
  return rows
    .filter(function (r) { return r.attending && r.party === party; })
    .reduce(function (sum, r) { return sum + 1 + (r.plusOnes || 0); }, 0);
}
```

Append these cards after Total Guests:

```js
{ value: partyGuests("Athena"), label: "Athena Guests" },
{ value: partyGuests("P-O"), label: "P-O Guests" },
```

- [ ] **Step 4: Add the Party column and native select**

Add `{ key: "party", label: "Party" }` after Name in `columns`. In each rendered row, add a `card-detail` cell after Name:

```js
'<td class="card-detail" data-label="Party"><select class="edit-field' +
  (isDirty ? " dirty" : "") + '" data-field="party"' + dis + '>' +
  '<option value=""' + (!v.party ? " selected" : "") + '>---</option>' +
  '<option value="Athena"' + (v.party === "Athena" ? " selected" : "") + '>Athena</option>' +
  '<option value="P-O"' + (v.party === "P-O" ? " selected" : "") + '>P-O</option>' +
  '</select></td>' +
```

When sorting Party, normalize missing legacy values before comparison:

```js
if (sortCol === "party") { av = av || ""; bv = bv || ""; }
```

Add `party: ""` to new pending rows. Generic dirty tracking and row-field reading already handle the select string.

- [ ] **Step 5: Update CSV, mobile layout, and docs**

Change the CSV header to:

```js
var header = "Name,Party,Email,Phone,Attending,Plus Ones,Date";
```

Add `csvField(r.party || "---")` after the name value. In `public/admin/index.html`, update both expanded mobile checkbox spans from 7 to 8 rows and correct the related comment. Update README's summary/table/export feature bullets to mention Party.

- [ ] **Step 6: Verify all UI checks**

Run: `node --test`

Expected: all tests pass.

Run: `node --check public/js/admin.js`

Expected: exit code 0.

Run: `git -c core.whitespace=cr-at-eol diff --check`

Expected: exit code 0.

- [ ] **Step 7: Commit**

```powershell
git add -- test/admin-party-ui.test.mjs public/js/admin.js public/admin/index.html README.md
git commit -m "Add Party to admin dashboard"
```

### Task 3: Review and deploy

**Files:** None

- [ ] **Step 1: Run final local verification**

Run: `node --test; node --check netlify/functions/admin.mjs; node --check netlify/functions/rsvp.mjs; node --check public/js/admin.js`

Expected: all tests and syntax checks pass with a clean worktree.

- [ ] **Step 2: Fast-forward main and push**

Merge the reviewed feature branch into main with `git merge --ff-only`, then push `HEAD:main` over the authenticated HTTPS GitHub remote.

- [ ] **Step 3: Wait for Netlify production**

Poll the linked site's latest deploy until its commit matches local HEAD and state is `ready` with no error.

- [ ] **Step 4: Verify the live browser without mutations**

Using the existing read and write credentials:

- Read-only: Party shows `---` for legacy rows, its select is disabled/ARIA-disabled, and Athena/P-O cards are visible.
- Write: Party select is enabled and offers exactly `---`, `Athena`, `P-O`.
- Confirm the Party cards equal the attending-headcount formula shown by the current saved data; do not save or delete any RSVP.
