import assert from "node:assert/strict";
import fs from "node:fs";
import contract from "../data-contract.json" with { type: "json" };
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const jsx = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
const service = createSourceSchemaMappingService({ contract });

// Quality & Exceptions: reviewer-facing purpose without an invented overall score.
assert.match(jsx, /Quality & Exceptions<\/h2>/);
assert.match(jsx, /checks measurable data-quality conditions in the selected source before its normalized information continues through PRAMAN/);
assert.match(jsx, /structural, completeness, consistency, datatype, geometry, or other validation problems only when the current dataset provides evidence/);
assert.match(jsx, /source-level summary of measurable data-quality conditions found in the selected dataset/);
assert.match(jsx, /does not combine these measurements into an arbitrary overall quality score/);
assert.match(jsx, /checks individual fields so the user can see where measurable missing values, repeated values, datatype problems/);
assert.match(jsx, /Exceptions are specific records or conditions that failed a defined validation or quality rule/);
assert.match(jsx, /no example exceptions are fabricated/);
assert.match(jsx, /<Metric label="Source records" value=\{formatNumber\(summary\.recordCount\)\}/);
assert.doesNotMatch(jsx, /overall quality score" value|quality confidence score|quality grade/i);

// Lineage & Impact: explicitly traceability, not parcel history, and no inferred downstream dependency.
assert.match(jsx, /Here, lineage means data traceability, not parcel ownership history or parcel-change history/);
assert.match(jsx, /Lineage answers “Where did this value come from\?”/);
assert.match(jsx, /the chain stops and states that limitation instead of inventing the missing step/);
assert.match(jsx, /Impact answers “What parts of PRAMAN rely on this field or transformation\?”/);
assert.match(jsx, /does not assume that every field affects matching, conflict resolution, reconciliation, or every later dashboard/);
assert.match(jsx, /No matching\/reconciliation impact is inferred/);

// History & Configuration: current-source interpretation, not parcel ownership/history.
assert.match(jsx, /This page records how the selected source is interpreted by PRAMAN/);
assert.match(jsx, /This is not parcel ownership or parcel-change history; that belongs in the Parcel History & Lineage dashboard/);
assert.match(jsx, /rather than fabricating versions, dates, operators, or edits/);
assert.match(jsx, /compares recorded schema or mapping versions only when version records exist/);
assert.match(jsx, /Current mapping configuration/);
assert.match(jsx, /Active relationships define documented source-to-destination storage/);
assert.match(jsx, /Configuration scope:/);
assert.match(jsx, /These are pre-matching source-state settings, not parcel-history records/);
assert.match(jsx, /These identifiers do not prove cross-source parcel identity/);
assert.match(jsx, /Rows are shown only when a real dictionary exists in the current configuration/);
assert.match(jsx, /empty state below is the truthful result rather than a generated audit trail/);

// Concise help terminology is exposed for the three remaining tabs.
for (const term of ["Completeness", "Duplicate values", "Datatype validity", "Exception", "Lineage", "Provenance", "Impact", "Configuration", "Schema version", "Validation rule"]) {
  assert.ok(jsx.includes(`<HelpTerm term="${term}" />`), `${term} should have reviewer-facing help`);
}

// The current source-of-truth still has no source/schema history; the UI must keep saying so.
for (const source of service.getSources()) {
  const quality = service.getSourceQualitySummary(source.sourceId);
  assert.ok(quality);
  assert.ok(Number.isInteger(quality.recordCount));
  assert.ok(quality.completenessRatio === null || (quality.completenessRatio >= 0 && quality.completenessRatio <= 1));
  assert.equal(quality.mappingCoverage, NOT_AVAILABLE, `${source.sourceId} must not gain fabricated mapping coverage`);

  const history = service.getSourceSchemaHistory(source.sourceId);
  assert.equal(history.available, false, `${source.sourceId} must not gain invented history`);
  assert.deepEqual(history.events, []);
  assert.deepEqual(history.schemaVersions, []);
  assert.deepEqual(history.mappingVersions, []);

  const config = service.getCurrentMappingConfiguration(source.sourceId);
  assert.equal(config.scope, "pre_matching_normalized_source_state");
  assert.ok(config.normalizedOutputTable);
}

console.log("remaining tabs explanatory UX regression test passed");
