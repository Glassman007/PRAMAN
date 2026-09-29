import assert from "node:assert/strict";
import fs from "node:fs";
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const base = JSON.parse(fs.readFileSync(new URL("../data-contract.json", import.meta.url), "utf8"));
const contract = structuredClone(base);
const source = contract.sources[0];
const canonicalField = contract.canonical_schema_reference.fields[0];
const sourceField = "source_parcel_id";

contract.canonical_schema_reference.domains = [{ id: "identity", name: "Identity", fields: [canonicalField.field_name] }];
contract.canonical_schema_reference.required_optional_metadata_available = true;
contract.canonical_schema_reference.explicit_source_to_canonical_mapping_table_available = true;
canonicalField.required = true;
source.adapter_and_mapping.adapter_registry_available = true;
source.adapter_and_mapping.adapter_name = "Adapter from contract metadata";
source.adapter_and_mapping.source_to_canonical_mappings = [{
  id: "test-map-1",
  source_id: source.source_id,
  source_field: sourceField,
  canonical_field: canonicalField.field_name,
  status: "configured",
  confidence: 0.91,
  evidence: "contract-test metadata",
  affected_records: source.normalized_source_state.record_count,
}];
source.adapter_and_mapping.categorical_normalization_rules = [{
  id: "test-dict-1",
  source_id: source.source_id,
  field: sourceField,
  source_value: "A",
  normalized_value: "A",
  occurrence_count: 1,
  status: "configured",
}];
source.versioning.versions = [{ source_id: source.source_id, version: "v-test" }];
source.versioning.source_dataset_version_metadata_available = true;

const service = createSourceSchemaMappingService({ contract });
const mappings = service.getMappings(source.source_id);
assert.equal(mappings.sourceToCanonicalFieldMapping, "Available");
assert.equal(mappings.explicitSourceToCanonicalMappings.length, 1);
assert.equal(mappings.explicitSourceToCanonicalMappings[0].mappingConfidence, 0.91);

const overview = service.getSourceOverview(source.source_id);
assert.equal(overview.adapter, "Adapter from contract metadata");
assert.notEqual(overview.mappingCoverage, NOT_AVAILABLE);
assert.notEqual(overview.mappedFields, NOT_AVAILABLE);
assert.notEqual(overview.unmappedFields, NOT_AVAILABLE);

const model = service.getSchemaMappingModel(source.source_id);
assert.equal(model.sourceToCanonicalMappingAvailable, true);
const target = model.canonicalFields.find((field) => field.field === canonicalField.field_name);
assert.equal(target.requiredStatus, "Required");
assert.equal(target.domain, "identity");
assert.equal(target.selectedSourceMappingState, "Mapped by selected source");

const unmapped = service.getUnmappedSourceFieldClassification(source.source_id);
assert.equal(unmapped.available, true);
assert.ok(unmapped.mappedFields.includes(sourceField));

const missing = service.getMissingCanonicalFieldClassification(source.source_id);
assert.equal(missing.available, true);
assert.ok(!missing.fields.some((field) => field.field === canonicalField.field_name));

const dictionary = service.getValueDictionary(source.source_id);
assert.equal(dictionary.available, true);
assert.equal(dictionary.rows.length, 1);
assert.equal(dictionary.rows[0].occurrenceCount, 1);

const versions = service.getAvailableVersions(source.source_id);
assert.equal(versions.available, true);
assert.equal(versions.versions.length, 1);

const matrix = service.getSourceCanonicalMatrix();
assert.equal(matrix.available, true);
const row = matrix.rows.find((item) => item.sourceId === source.source_id);
assert.equal(row.cells.find((cell) => cell.domainId === "identity").state, "full");

console.log("future metadata activation test passed");
