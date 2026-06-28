import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hidden admin controls stay hidden", async () => {
  const html = await readFile(
    new URL("../public/admin/index.html", import.meta.url),
    "utf8"
  );

  assert.match(
    html,
    /\[hidden\]\s*\{[^}]*display:\s*none\s*!important\s*;?[^}]*\}/
  );
});
