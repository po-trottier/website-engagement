import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin dashboard exposes Party assignment and export", async () => {
  const js = await readFile(
    new URL("../public/js/admin.js", import.meta.url),
    "utf8"
  );

  assert.match(js, /data-field="party"/);
  assert.match(js, /Athena Guests/);
  assert.match(js, /P-O Guests/);
  assert.match(js, /Name,Party,Email,Phone,Attending,Plus Ones,Date/);
});
