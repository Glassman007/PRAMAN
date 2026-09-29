import fs from "node:fs";
import assert from "node:assert/strict";
import { createSourceSchemaMappingService } from "../src/sourceSchemaMappingService.js";

const path = process.argv[2];
if (!path) throw new Error("alternate contract path is required");
const contract = JSON.parse(fs.readFileSync(path, "utf8"));
const service = createSourceSchemaMappingService({ contract });
const sources = service.getSources();

assert.equal(sources.length, contract.sources.length);
assert.ok(sources.some((source) => source.sourceName === "Replacement Dataset Source"));
const replacement = sources.find((source) => source.sourceName === "Replacement Dataset Source");
assert.ok(replacement);
assert.ok(service.getSourceFieldProfiles(replacement.sourceId).some((field) => field.field === "replacement_probe_field"));
assert.ok(service.getExceptionCategories(replacement.sourceId).some((row) => row.category === "UNDECLARED_SOURCE_KEY"));
assert.ok(Object.prototype.hasOwnProperty.call(service.getTransformationRules(replacement.sourceId).geometry.methods, "REPLACEMENT_TEST_METHOD"));
assert.ok(service.getSchemaMappingModel(replacement.sourceId).sourceName === "Replacement Dataset Source");
console.log("replacement service harness passed");
