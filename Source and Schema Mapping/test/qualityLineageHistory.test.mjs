import assert from "node:assert/strict";
import fs from "node:fs";
import contract from "../data-contract.json" with { type: "json" };
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const service = createSourceSchemaMappingService({ contract });
let totalExceptions = 0;
let sourcesWithExceptions = 0;

for (const source of service.getSources()) {
  const raw = service.getSource(source.sourceId);
  const summary = service.getSourceQualitySummary(source.sourceId);
  const fields = service.getFieldQualityProfiles(source.sourceId);
  const exceptions = service.getExceptionQueue(source.sourceId);
  const categories = service.getExceptionCategories(source.sourceId);

  assert.ok(summary);
  assert.ok(summary.completenessRatio === null || (summary.completenessRatio >= 0 && summary.completenessRatio <= 1));
  assert.equal(summary.schemaConformanceIssues, exceptions.length);
  assert.equal(categories.reduce((sum, x) => sum + x.count, 0), exceptions.length);
  assert.ok(fields.length >= service.getSourceFieldProfiles(source.sourceId).length);
  assert.equal(summary.mappingCoverage, NOT_AVAILABLE);

  totalExceptions += exceptions.length;
  if (exceptions.length) {
    sourcesWithExceptions += 1;
    const issue = exceptions[0];
    const comparison = service.getExceptionRecordComparison(source.sourceId, issue.issue_id);
    assert.equal(comparison.issue.issue_id, issue.issue_id);
    assert.equal(comparison.originalSourceRecordAvailable, false);
    assert.ok(comparison.originalSourceRecordNote.includes("raw source-record"));
    if (issue.observation_id) {
      assert.equal(comparison.normalizedSourceRecord.observation_id, issue.observation_id);
    }
  }

  const subjects = service.getProvenanceSubjects(source.sourceId);
  assert.ok(subjects.length > 0);
  const geometrySubject = subjects.find(x => x.relationId?.startsWith("geometry:"));
  if (geometrySubject) {
    const provenance = service.getAttributeProvenance(source.sourceId, geometrySubject.key);
    assert.equal(provenance.completeness, "complete_for_recorded_geometry_transform");
    assert.ok(provenance.stages.some(x => x.label === "Transformation" && x.value !== NOT_AVAILABLE));
    const impact = service.getMappingImpact(source.sourceId, geometrySubject.relationId);
    assert.ok(impact.affectedRecords > 0);
    assert.equal(impact.downstreamPipelineDependencies, NOT_AVAILABLE);
  }

  const history = service.getSourceSchemaHistory(source.sourceId);
  assert.equal(history.available, false);
  assert.deepEqual(history.events, []);
  assert.deepEqual(history.schemaVersions, []);

  const config = service.getCurrentMappingConfiguration(source.sourceId);
  const exported = service.getExportableMappingConfiguration(source.sourceId);
  assert.equal(exported.sourceId, source.sourceId);
  assert.deepEqual(exported.relationships, config.relationships);
  assert.equal(exported.sourceToCanonicalMapping, NOT_AVAILABLE);
  assert.equal(exported.editableMappingState, false);
  assert.equal(config.relationships.length, service.getMappings(source.sourceId).relationships.length);
  assert.deepEqual(config.validationConfiguration.requiredKeys, raw.declared_source_schema.required_keys);
  for (const relation of service.getMappings(source.sourceId).relationships) {
    assert.ok(Number.isInteger(relation.validationIssueCount));
    assert.ok(relation.validationIssueCount >= 0);
    if (relation.validationIssueCount === 0) assert.match(relation.validationStatus, /No detected validation exceptions/);
  }
}

assert.ok(totalExceptions >= 0);
assert.ok(sourcesWithExceptions >= 0 && sourcesWithExceptions <= service.getSources().length);

const ui = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
assert.ok(ui.includes("No exceptions detected for the current selection."));
assert.ok(ui.includes("Original source record unavailable"));
assert.ok(ui.includes("No source/schema history is available in the current dataset."));
assert.ok(!ui.includes("Quality Score"));
assert.ok(!ui.includes("Authoritative Canonical Parcel"));

console.log("quality, lineage and history selector tests passed");
