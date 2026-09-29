import assert from "node:assert/strict";
import contract from "../data-contract.json" with { type: "json" };
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const service = createSourceSchemaMappingService({ contract });
const sources = service.getSources();
assert.equal(sources.length, contract.sources.length);
assert.ok(sources.every(s => s.sourceName));
for (const source of sources) {
  const overview = service.getSourceOverview(source.sourceId);
  const fields = service.getSourceFieldProfiles(source.sourceId);
  const stages = service.getArchitectureStages(source.sourceId);
  assert.equal(overview.recordCount, source.recordCount);
  assert.ok(overview.fieldCount > 0);
  assert.ok(fields.length > 0);
  assert.equal(stages.length, 7);
  assert.equal(overview.mappingCoverage, NOT_AVAILABLE);
}
const matrix = service.getSourceCanonicalMatrix();
assert.equal(matrix.available, false);
assert.equal(service.getCanonicalDomains().length, 0);
console.log("dashboard selector tests passed");
