import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const contract = JSON.parse(await fs.readFile(new URL("../data-contract.json", import.meta.url), "utf8"));
const service = createSourceSchemaMappingService({ contract });
const sources = service.getSources();

assert.equal(sources.length, contract.sources.length);
assert.ok(sources.length > 0);

for (const source of sources) {
  const raw = service.getSource(source.sourceId);
  assert.ok(raw);
  assert.equal(raw.source_type, source.sourceType);
  assert.equal(service.getSourceStatistics(source.sourceId).recordCount, source.recordCount);
  assert.equal(service.getAvailableVersions(source.sourceId).available, Boolean(contract.source_schema_history?.available));
  assert.equal(service.getMappings(source.sourceId).sourceToCanonicalFieldMapping, NOT_AVAILABLE);
  await assert.rejects(() => service.getSourceRecords(source.sourceId), /Table loader is required/);
}

assert.equal(service.getCanonicalSchema().read_only_reference_only, true);

const geometrySource = sources.find((source) => service.getMappings(source.sourceId)?.explicitGeometryMappings?.length);
if (geometrySource) {
  const relation = service.getMappings(geometrySource.sourceId).explicitGeometryMappings[0];
  const lineage = service.getLineage(geometrySource.sourceId, relation.normalizedField);
  assert.equal(lineage.availability, "available");
}

const partialSource = sources.find((source) => service.getSource(source.sourceId)?.declared_source_schema?.source_specific_keys?.length);
if (partialSource) {
  const field = service.getSource(partialSource.sourceId).declared_source_schema.source_specific_keys[0];
  assert.equal(service.getLineage(partialSource.sourceId, field).availability, "partial");
}

console.log("service contract tests passed");
