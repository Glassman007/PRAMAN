import assert from "node:assert/strict";
import fs from "node:fs";
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const contract = JSON.parse(fs.readFileSync(new URL("../data-contract.json", import.meta.url), "utf8"));
const jsx = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
const service = createSourceSchemaMappingService({ contract });

// Presentation cleanup must not mutate source-of-truth contract values.
assert.ok(contract.sources.some((source) => /synthetic/i.test(source.metadata?.source_name || "")), "fixture should retain original dataset-backed source names");

for (const source of contract.sources) {
  const listed = service.getSources().find((item) => item.sourceId === source.source_id);
  const overview = service.getSourceOverview(source.source_id);
  const stages = service.getArchitectureStages(source.source_id);
  const sourceStage = stages.find((stage) => stage.key === "source");
  const adapterStage = stages.find((stage) => stage.key === "adapter");

  assert.ok(listed, `source selector entry missing for ${source.source_id}`);
  assert.doesNotMatch(listed.sourceName, /\bsynthetic\b/i, `visible source name still contains Synthetic for ${source.source_id}`);
  assert.equal(listed.sourceId, source.source_id, `source ID changed for ${source.source_id}`);
  assert.equal(listed.recordCount, source.normalized_source_state.record_count, `record count changed for ${source.source_id}`);
  assert.equal(overview.recordCount, source.normalized_source_state.record_count, `overview record count changed for ${source.source_id}`);
  assert.equal(overview.fieldCount, Object.keys(source.normalized_source_state.common_field_profile || {}).length + Object.keys(source.normalized_source_state.source_specific_field_profile || {}).length, `field count changed for ${source.source_id}`);
  assert.deepEqual(service.getSpatialMetadata(source.source_id), source.spatial_metadata, `spatial/CRS metadata changed for ${source.source_id}`);
  assert.equal(sourceStage.primary, listed.sourceName, `architecture source presentation differs for ${source.source_id}`);
  assert.notEqual(overview.adapter, NOT_AVAILABLE, `adapter was not resolved for ${source.source_id}`);
  assert.notEqual(adapterStage.primary, NOT_AVAILABLE, `architecture adapter remains unavailable for ${source.source_id}`);
}

// Explicit contract adapter metadata must continue to override metadata-derived resolution.
const future = structuredClone(contract);
future.sources[0].adapter_and_mapping.adapter_name = "Configured Adapter";
const futureService = createSourceSchemaMappingService({ contract: future });
assert.equal(futureService.getSourceOverview(future.sources[0].source_id).adapter, "Configured Adapter");

// Negated descriptive metadata must not create a false positive adapter assignment.
const utilitySource = contract.sources.find((source) => source.source_type === "UTILITY_INFRASTRUCTURE");
assert.ok(utilitySource, "current contract should contain the utility source used by this regression");
assert.equal(service.getSourceOverview(utilitySource.source_id).adapter, "Context Feature", "utility source must not inherit Parcel / Spatial-Unit from the negated phrase 'not automatically cadastral authority'");

// Coverage Matrix is removed only from presentation; service capability remains available.
assert.doesNotMatch(jsx, /Coverage matrix|Source × canonical domain|function CanonicalMatrix/);
assert.equal(typeof service.getSourceCanonicalMatrix, "function");

console.log("overview presentation cleanup regression test passed");
