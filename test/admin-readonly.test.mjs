import assert from "node:assert/strict";
import test from "node:test";

import handler from "../netlify/functions/admin.mjs";

const env = new Map();
globalThis.Netlify = { env: { get: (key) => env.get(key) } };

async function request(password, action) {
  return handler(
    new Request("http://localhost/.netlify/functions/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action }),
    })
  );
}

async function assertReadonly(response) {
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Readonly mode: write access required",
  });
}

test("ADMIN_PASSWORD cannot create, update, or delete", async (t) => {
  env.set("ADMIN_PASSWORD", "read-pass");
  env.set("ADMIN_WRITE_PASSWORD", "write-pass");

  for (const action of ["create", "update", "delete"]) {
    await t.test(action, async () => {
      await assertReadonly(await request("read-pass", action));
    });
  }
});

test("identical read and write passwords stay readonly", async () => {
  env.set("ADMIN_PASSWORD", "same-pass");
  env.set("ADMIN_WRITE_PASSWORD", "same-pass");

  await assertReadonly(await request("same-pass", "create"));
});

test("ADMIN_WRITE_PASSWORD reaches action routing", async () => {
  env.set("ADMIN_PASSWORD", "read-pass");
  env.set("ADMIN_WRITE_PASSWORD", "write-pass");

  const response = await request("write-pass", "probe");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Unknown action" });
});
