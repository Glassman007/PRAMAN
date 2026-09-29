import assert from "node:assert/strict";
import fs from "node:fs";
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const contract = JSON.parse(fs.readFileSync(new URL("../data-contract.json", import.meta.url), "utf8"));
const service = createSourceSchemaMappingService({ contract });
const normalizedDefinitions = new Set((contract.normalized_source_schema || []).map((field) => field.field_name));
const geometryDefinitions = new Set((contract.source_geometry_schema || []).map((field) => field.field_name));
let representedCount = 0;
let retainedCount = 0;
let geometryCount = 0;
let undocumentedCount = 0;

for (const sourceSummary of service.getSources()) {
  const source = service.getSource(sourceSummary.sourceId);
  const mappings = service.getMappings(sourceSummary.sourceId);
  const audit = service.getMappingAudit(sourceSummary.sourceId);
  assert.ok(audit, `missing mapping audit for ${sourceSummary.sourceId}`);
  assert.equal(audit.scope, "source_schema_to_normalized_source_state_pre_matching");
  assert.equal(audit.summary.invalidRelationshipCount, 0, `invalid represented relationship for ${sourceSummary.sourceId}`);
  assert.equal(audit.summary.affectedCountReviewCount, 0, `unverified affected count for ${sourceSummary.sourceId}`);
  assert.equal(audit.summary.rawNonGeometryMappingRulesAvailable, false);
  assert.equal(audit.summary.upstreamRawMappingAvailable, false);
  assert.equal(audit.representedRelationships.length, mappings.relationships.length);
  representedCount += audit.representedRelationships.length;

  const byId = new Map(audit.representedRelationships.map((entry) => [entry.relationId, entry]));
  for (const relation of mappings.relationships) {
    const entry = byId.get(relation.id);
    assert.ok(entry, `audit entry missing for ${sourceSummary.sourceId}:${relation.id}`);
    assert.equal(entry.destinationExists, true, `destination missing for ${sourceSummary.sourceId}:${relation.id}`);
    assert.equal(entry.affectedCountVerified, true, `affected count not verified for ${sourceSummary.sourceId}:${relation.id}`);
    assert.equal(entry.preMatchingScope, true);
    assert.equal(entry.crossSourceIdentityClaim, false);

    if (relation.mappingKind === "source_native_value_retained") {
      retainedCount += 1;
      const profile = source.normalized_source_state.source_specific_field_profile[relation.sourceField];
      assert.ok(profile, `source profile missing for ${sourceSummary.sourceId}:${relation.sourceField}`);
      assert.equal(entry.relationshipCategory, "Source-native retention");
      assert.equal(relation.normalizedLocation, `source_specific_details.${relation.sourceField}`);
      assert.equal(entry.affectedRecords, Number(profile.records) - Number(profile.null_or_empty));
      assert.equal(entry.affectedRecords, Number(profile.populated));
      assert.equal(entry.destinationDatatype, (profile.observed_value_types || []).join(" | ") || NOT_AVAILABLE);
      assert.equal(entry.destinationStorageDatatype, "JSON/Text");
      assert.notEqual(entry.retentionRule, NOT_AVAILABLE);
      assert.equal(entry.transformationRule, NOT_AVAILABLE);
      assert.equal(entry.rawFieldDerivationDocumented, false);
      assert.ok(normalizedDefinitions.has("source_specific_details"));
    }

    if (relation.mappingKind === "explicit_geometry_transformation") {
      geometryCount += 1;
      const profiles = source.spatial_metadata.geometry_field_profile;
      const relContract = source.spatial_metadata.geometry_mapping_relationships.find((item) => item.source_field === relation.sourceField && item.target_field === relation.normalizedField);
      assert.ok(relContract);
      assert.equal(entry.relationshipCategory, "Geometry normalization");
      assert.ok(geometryDefinitions.has(relation.sourceField));
      assert.ok(geometryDefinitions.has(relation.normalizedField));
      assert.equal(entry.affectedRecords, source.spatial_metadata.geometry_record_count);
      assert.equal(entry.affectedRecords, profiles[relation.sourceField].populated);
      assert.equal(entry.affectedRecords, profiles[relation.normalizedField].populated);
      assert.equal(entry.affectedRecords, relContract.affected_records);
      assert.notEqual(entry.transformationRule, NOT_AVAILABLE);
      assert.equal(entry.rawFieldDerivationDocumented, true);
    }
  }

  // The current contract explicitly says common non-geometry raw-field derivation is unavailable.
  // These fields must be audited as unproven, not turned into connectors.
  const expectedUndocumented = Object.keys(source.normalized_source_state.common_field_profile)
    .filter((field) => field !== source.adapter_and_mapping.source_native_fields_preserved_in);
  assert.equal(audit.undocumentedNormalizedDerivations.length, expectedUndocumented.length);
  undocumentedCount += audit.undocumentedNormalizedDerivations.length;
  for (const entry of audit.undocumentedNormalizedDerivations) {
    assert.equal(entry.relationshipCategory, "No documented raw-field derivation");
    assert.equal(entry.sourceField, null);
    assert.equal(entry.rawFieldDerivationDocumented, false);
    assert.equal(entry.crossSourceIdentityClaim, false);
    assert.ok(entry.validationResult.includes("no connector should be invented"));
  }

  const sourceParcelId = audit.undocumentedNormalizedDerivations.find((entry) => entry.destinationField.endsWith(".source_parcel_id"));
  assert.ok(sourceParcelId, `source_parcel_id audit missing for ${sourceSummary.sourceId}`);
  assert.equal(sourceParcelId.identifierField, true);
  assert.match(sourceParcelId.explanation, /must not be treated as proof of cross-source parcel identity/);
}

assert.equal(representedCount, 48, "current contract should expose exactly 48 defensible displayed relationships");
assert.equal(retainedCount, 34, "current contract should expose 34 source-native retention relationships");
assert.equal(geometryCount, 14, "current contract should expose 14 geometry normalization relationships");
assert.equal(undocumentedCount, 112, "16 common normalized fields per source must remain unconnected without raw-field derivation evidence");

const revenueAudit = service.getMappingAudit("SRC-A-REV");
const khasra = revenueAudit.representedRelationships.find((entry) => entry.sourceField === "khasra_plot_no");
assert.ok(khasra);
assert.equal(khasra.destinationField, "source_specific_details.khasra_plot_no");
assert.equal(khasra.relationshipCategory, "Source-native retention");
assert.equal(khasra.destinationDatatype, "string");
assert.equal(khasra.destinationStorageDatatype, "JSON/Text");
assert.equal(service.getMappings("SRC-A-REV").explicitSourceToCanonicalMappings.length, 0, "khasra must not be invented as a canonical parcel_number mapping");

console.log("mapping relationship audit tests passed: 48 represented + 112 explicitly unproven normalized derivations");
