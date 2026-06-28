# Admin Write Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure production write access and guarantee the read credential cannot create, update, or delete RSVPs.

**Architecture:** Keep the existing two-password API and server-authoritative action gate. Make read access win if both secrets overlap, move the action gate before Blob-store initialization, and prove the boundary with dependency-free Node tests.

**Tech Stack:** Netlify Functions, JavaScript ES modules, Node.js built-in test runner, Netlify CLI

---

### Task 1: Enforce and test the server boundary

**Files:**
- Create: `test/admin-readonly.test.mjs`
- Modify: `netlify/functions/admin.mjs:13-55`

- [ ] **Step 1: Write the failing regression test**

```js
import test from "node:test";
import assert from "node:assert/strict";

const secrets = new Map();
globalThis.Netlify = { env: { get: (name) => secrets.get(name) } };
const { default: admin } = await import("../netlify/functions/admin.mjs");

function setSecrets(read, write) {
  secrets.set("ADMIN_PASSWORD", read);
  secrets.set("ADMIN_WRITE_PASSWORD", write);
}

function request(password, action) {
  return admin(new Request("http://localhost/.netlify/functions/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, action }),
  }));
}

for (const action of ["create", "update", "delete"]) {
  test(`read credential cannot ${action}`, async () => {
    setSecrets("readonly-password", "write-password");
    const response = await request("readonly-password", action);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Readonly mode: write access required" });
  });
}

test("an overlapping read/write credential remains readonly", async () => {
  setSecrets("same-password", "same-password");
  const response = await request("same-password", "create");
  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/admin-readonly.test.mjs`

Expected: FAIL because Blob storage is initialized before the read-only gate and because equal secrets currently resolve to write mode.

- [ ] **Step 3: Apply the minimal implementation**

In `authenticate()`, resolve a read match before a write match:

```js
const isWrite = matches(input, Netlify.env.get("ADMIN_WRITE_PASSWORD"));
const isRead = matches(input, Netlify.env.get("ADMIN_PASSWORD"));
if (isRead) return "readonly";
if (isWrite) return "write";
return null;
```

Move `const store = getStore("rsvps");` below the existing non-list/write-mode rejection so forbidden requests exit before storage access.

- [ ] **Step 4: Verify GREEN and syntax**

Run: `node --test test/admin-readonly.test.mjs`

Expected: 4 tests pass, 0 fail.

Run: `node --check netlify/functions/admin.mjs`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add -- test/admin-readonly.test.mjs netlify/functions/admin.mjs
git commit -m "Enforce admin read-only boundary"
```

### Task 2: Document the two credentials

**Files:**
- Modify: `README.md:54-68,90-93`

- [ ] **Step 1: Update setup instructions**

Add `ADMIN_WRITE_PASSWORD=your-distinct-write-password` to the `.env` example. Describe `ADMIN_PASSWORD` as read-only and `ADMIN_WRITE_PASSWORD` as the full create/update/delete credential. State that both must be at least eight characters, cannot be `changeme`, and should be distinct.

- [ ] **Step 2: Check the documentation diff**

Run: `git diff --check -- README.md`

Expected: exit code 0 with no output.

- [ ] **Step 3: Commit**

```powershell
git add -- README.md
git commit -m "Document admin write password"
```

### Task 3: Configure and verify production

**Files:** None; never store the generated credential in Git.

- [ ] **Step 1: Generate and set a production Functions secret**

Use `RandomNumberGenerator` to generate 24 random bytes, encode them as base64url, and run:

```powershell
netlify env:set ADMIN_WRITE_PASSWORD $password --context production --scope functions --secret --force
```

Print the generated value only after the CLI reports success so it can be handed to the user.

- [ ] **Step 2: Push the reviewed commits to production**

Run: `git push origin HEAD:main`

Expected: a fast-forward update accepted by `origin/main`, triggering the configured Netlify production deploy.

- [ ] **Step 3: Verify the deployed permission modes safely**

Retrieve the site URL and both production credentials into process-local variables. POST only `list` and an unknown non-mutating action:

- The read credential's `list` response reports `mode: "readonly"`.
- The read credential's unknown action receives HTTP 403.
- The write credential's `list` response reports `mode: "write"`.
- The write credential's unknown action reaches routing and receives HTTP 400 without changing data.

- [ ] **Step 4: Report the credential**

Return the new write password once in the final response, along with test and production verification results. Recommend rotating the read password because it was pasted into chat.
