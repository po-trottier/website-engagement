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
  assert.match(js, /r\.attending\s*&&\s*r\.party\s*===\s*party/);
  assert.match(js, /1\s*\+\s*\(r\.plusOnes\s*\|\|\s*0\)/);
  assert.match(js, /<select\b(?=[^>\r\n]*\bclass\s*=\s*"edit-field)(?=[^>\r\n]*\bdata-field\s*=\s*"party")[^>\r\n]*>/);
  assert.match(js, /<select[^\r\n]*data-field="party"['"]\s*\+\s*dis\s*\+/);
  assert.match(js, /sortCol\s*===\s*"party"\s*\)\s*\{\s*av\s*=\s*av\s*\|\|\s*"";\s*bv\s*=\s*bv\s*\|\|\s*"";/);
  assert.match(js, /csvField\s*\(\s*r\.party\s*\|\|\s*"---"\s*\)/);
});
