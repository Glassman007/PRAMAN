import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync(new URL("../src/sourceSchemaMappingService.js", import.meta.url), "utf8");
for (const pattern of [
  /\?\s*NOT_AVAILABLE\s*:\s*NOT_AVAILABLE/g,
  /getSourceCanonicalMatrix\(\)[\s\S]{0,1200}return\s*\{\s*available:\s*false,[\s\S]*Source-to-canonical matrix data is not represented/g,
]) {
  assert.equal(pattern.test(service), false, `hard-wired unavailable branch remains: ${pattern}`);
}
console.log("no hard-wired unavailable branch regression test passed");
