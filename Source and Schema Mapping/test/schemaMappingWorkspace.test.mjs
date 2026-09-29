import assert from "node:assert/strict";
import contract from "../data-contract.json" with { type: "json" };
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const service = createSourceSchemaMappingService({ contract });
const canonicalFields = new Set((contract.canonical_schema_reference?.fields || []).map(f => f.field_name));
const normalizedFields = new Set((contract.normalized_source_schema || []).map(f => f.field_name));

for (const source of service.getSources()) {
  const raw = service.getSource(source.sourceId);
  const model = service.getSchemaMappingModel(source.sourceId);
  const mappings = service.getMappings(source.sourceId);

  assert.equal(model.sourceId, source.sourceId);
  assert.ok(model.sourceFields.length > 0);
  assert.equal(model.sourceToCanonicalMappingAvailable, false);
  assert.equal(model.editableMappingState, false);

  const declared = raw.declared_source_schema.source_specific_keys || [];
  const retained = mappings.relationships.filter(r => r.mappingKind === "source_native_value_retained");
  assert.equal(retained.length, declared.length);
  for (const rel of retained) {
    assert.ok(declared.includes(rel.sourceField));
    assert.equal(rel.normalizedField, "source_specific_details");
    assert.equal(rel.mappingConfidence, NOT_AVAILABLE);
    assert.ok(rel.affectedRecords >= 0);
    if (rel.affectedRecords > 0) assert.notEqual(rel.sampleInput, null);
  }

  const geometry = mappings.relationships.filter(r => r.mappingKind === "explicit_geometry_transformation");
  assert.equal(geometry.length, raw.spatial_metadata.geometry_mapping_relationships.length);
  for (const rel of geometry) {
    assert.equal(rel.transformationAvailable, true);
    assert.notEqual(rel.sampleInput, null);
    assert.notEqual(rel.sampleOutput, null);
    assert.ok(rel.affectedRecords > 0);
    assert.equal(rel.mappingConfidence, NOT_AVAILABLE);
  }

  for (const f of model.normalizedFields) assert.ok(normalizedFields.has(f.field));
  for (const f of model.canonicalFields) assert.ok(canonicalFields.has(f.field));

  const unmapped = service.getUnmappedSourceFieldClassification(source.sourceId);
  const missingCanonical = service.getMissingCanonicalFieldClassification(source.sourceId);
  const dictionary = service.getValueDictionary(source.sourceId);
  assert.equal(unmapped.available, false);
  assert.equal(missingCanonical.available, false);
  assert.equal(dictionary.available, false);

  const ids = service.getIdentifierInterpretation(source.sourceId);
  assert.equal(ids.upstreamRawMappingAvailable, false);
  assert.ok(ids.fields.every(x => normalizedFields.has(x.field)));
}

const ids = service.getSources().map(s => service.getSchemaMappingModel(s.sourceId).sourceId);
assert.deepEqual(ids, service.getSources().map(s => s.sourceId));
console.log("schema mapping workspace selector tests passed");
