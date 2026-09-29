import assert from "node:assert/strict";
import fs from "node:fs";
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const contract = JSON.parse(fs.readFileSync(new URL("../data-contract.json", import.meta.url), "utf8"));
const audit = JSON.parse(fs.readFileSync(new URL("../mapping-relationship-audit.json", import.meta.url), "utf8"));
const jsx = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard/sourceSchemaMapping.css", import.meta.url), "utf8");
const service = createSourceSchemaMappingService({ contract });
const sources = service.getSources();

assert.equal(sources.length, 7, "current contract should expose all seven source datasets");
assert.ok(contract.sources.some((s) => /\bSynthetic\b/i.test(s.metadata?.source_name || "")), "underlying source-of-truth names should remain untouched");
assert.doesNotMatch(jsx, /\bSynthetic\b/i, "dashboard JSX must not expose Synthetic as presentation copy");

const expectedFlow = ["source", "adapter", "validation", "schema", "mapping", "transformation", "normalized"];
for (const listed of sources) {
  const raw = service.getSource(listed.sourceId);
  const overview = service.getSourceOverview(listed.sourceId);
  const spatial = service.getSpatialMetadata(listed.sourceId);
  const stages = service.getArchitectureStages(listed.sourceId);

  assert.ok(raw, `raw source missing for ${listed.sourceId}`);
  assert.equal(raw.source_id, listed.sourceId, `source ID changed for ${listed.sourceId}`);
  assert.equal(raw.source_type, listed.sourceType, `source type changed for ${listed.sourceId}`);
  assert.doesNotMatch(listed.sourceName, /\bSynthetic\b/i, `visible source name still contains Synthetic for ${listed.sourceId}`);
  assert.equal(overview.recordCount, raw.normalized_source_state.record_count, `record count mismatch for ${listed.sourceId}`);
  assert.equal(overview.fieldCount, Object.keys(raw.normalized_source_state.common_field_profile || {}).length + Object.keys(raw.normalized_source_state.source_specific_field_profile || {}).length, `field count mismatch for ${listed.sourceId}`);
  assert.deepEqual(spatial, raw.spatial_metadata, `geometry/CRS metadata changed for ${listed.sourceId}`);
  assert.notEqual(overview.adapter, NOT_AVAILABLE, `adapter unresolved for ${listed.sourceId}`);
  assert.deepEqual(stages.map((stage) => stage.key), expectedFlow, `architecture flow changed for ${listed.sourceId}`);

  const model = service.getSchemaMappingModel(listed.sourceId);
  const mappings = service.getMappings(listed.sourceId);
  const identifiers = service.getIdentifierInterpretation(listed.sourceId);
  const quality = service.getSourceQualitySummary(listed.sourceId);
  const fieldQuality = service.getFieldQualityProfiles(listed.sourceId);
  const exceptions = service.getExceptionQueue(listed.sourceId);
  const provenance = service.getProvenanceSubjects(listed.sourceId);
  const history = service.getSourceSchemaHistory(listed.sourceId);
  const config = service.getCurrentMappingConfiguration(listed.sourceId);
  const transforms = service.getTransformationRules(listed.sourceId);

  assert.ok(model && mappings && identifiers && quality && history && config && transforms, `one or more dashboard views lack data for ${listed.sourceId}`);
  assert.ok(Array.isArray(fieldQuality), `field quality unavailable for ${listed.sourceId}`);
  assert.ok(Array.isArray(exceptions), `exception queue unavailable for ${listed.sourceId}`);
  assert.ok(Array.isArray(provenance), `lineage subjects unavailable for ${listed.sourceId}`);
  for (const relation of mappings.relationships || []) {
    const impact = service.getMappingImpact(listed.sourceId, relation.id);
    assert.ok(impact, `impact lookup failed for ${listed.sourceId}/${relation.id}`);
  }
  if (provenance.length) {
    const subject = provenance[0];
    const key = subject.key || subject.subjectKey || subject.field || subject.provenanceKey;
    if (key) assert.ok(service.getAttributeProvenance(listed.sourceId, key), `lineage lookup failed for ${listed.sourceId}/${key}`);
  }
}

const utility = sources.find((source) => source.sourceType === "UTILITY_INFRASTRUCTURE");
assert.ok(utility, "utility source missing");
assert.equal(service.getSourceOverview(utility.sourceId).adapter, "Context Feature", "negated cadastral wording must not create a Parcel / Spatial-Unit adapter assignment");

assert.doesNotMatch(jsx, /Coverage matrix|Source × canonical domain|function CanonicalMatrix/i, "Coverage Matrix UI returned");
assert.doesNotMatch(css, /ssm-relations|ssm-relation__|ssm-mapping-inspector|ssm-transform-view|ssm-timeline-event|ssm-issue-grid|ssm-issue\b/, "proven-dead legacy UI styles remain after cleanup");

assert.deepEqual(audit.summary, {
  representedRelationshipCount: 48,
  sourceNativeRetentionCount: 34,
  geometryNormalizationCount: 14,
  noDocumentedRawFieldDerivationCount: 112,
  directNormalizationCount: 0,
  derivedFieldCount: 0,
  identifierNormalizationCount: 0,
  explicitSourceToCanonicalCount: 0,
  invalidRepresentedRelationshipCount: 0,
  observedValueAlignmentCandidateCount: 4,
});
for (const sourceAudit of audit.sources) {
  for (const relation of sourceAudit.representedRelationships || []) {
    assert.equal(relation.destinationExists, true, `${relation.relationId}: destination missing`);
    assert.equal(relation.destinationPopulated, true, `${relation.relationId}: destination unpopulated`);
    assert.equal(relation.valuesActuallyPopulateDestination, true, `${relation.relationId}: values do not populate destination`);
    assert.equal(relation.affectedCountVerified, true, `${relation.relationId}: affected count not independently verified`);
    assert.equal(relation.preMatchingScope, true, `${relation.relationId}: relationship escaped pre-matching scope`);
    assert.equal(relation.crossSourceIdentityClaim, false, `${relation.relationId}: relationship wrongly claims cross-source identity`);
  }
}
const khasra = audit.sources.flatMap((s) => s.representedRelationships || []).find((r) => r.sourceField === "khasra_plot_no");
assert.ok(khasra, "khasra retention relationship missing");
assert.equal(khasra.destinationField, "source_specific_details.khasra_plot_no");
assert.equal(khasra.relationshipCategory, "Source-native retention");
assert.equal(khasra.affectedRecords, 1061);
assert.equal(khasra.destinationDatatype, "string");

assert.match(jsx, /Source Schema[\s\S]*PRAMAN Schema[\s\S]*Relationship \/ Mapping Details/, "mapping workspace reading order changed");
assert.match(jsx, /<ConnectionOverlay gridRef=\{gridRef\} relationships=\{activeRelationships\}/, "connector overlay must receive active relationships only");
assert.doesNotMatch(jsx, /setSelectedRelationId\(relationships\[0\]\.id\)/, "schema workspace must not auto-select the first mapping");
assert.match(jsx, /Does not establish cross-source parcel identity/, "identifier interpretation must state its pre-matching limitation");
assert.match(jsx, /pre-matching representations, not automatic canonical parcel facts/, "PRAMAN Schema explanation must remain pre-matching");

for (const phrase of [
  "Schema Mapping", "Source Schema", "PRAMAN Schema", "Relationship / Mapping Details",
  "Identifier interpretation", "Classification", "Quality & Exceptions", "Quality Profile",
  "Field-Level Quality", "Lineage & Impact", "Lineage", "Impact", "History & Configuration",
  "Configuration", "History"
]) assert.match(jsx, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `missing explanatory section: ${phrase}`);

assert.match(css, /\.ssm-schema-scroll\{[\s\S]*?overflow-y:auto/, "schema panels must use native vertical scrolling");
assert.match(css, /scrollbar-gutter:stable/, "scrollbar gutter must be reserved");
assert.match(css, /touch-action:pan-y pinch-zoom/, "touch/pointer scrolling support missing");
assert.match(jsx, /panel\.addEventListener\("scroll", update, \{ passive: true \}\)/, "connector overlay must update on independent panel scroll");
assert.match(jsx, /scrollTo\(\{ top: Math\.max\(0, scroller\.scrollTop \+ delta\), behavior: "smooth" \}\)/, "connected field auto-reveal missing");
assert.match(jsx, /setWorkflowContext\(\{ relationId: null, field: null, issueId: null, observationId: null, provenanceKey: null, domainId: null \}\)/, "source changes must clear stale workflow context");
assert.match(jsx, /setViewPreferences\(\{ schemaSearch: "", schemaKindFilter: "all", schemaRightMode: "normalized", qualitySearch: "", qualityCategory: "all" \}\)/, "source changes must clear stale per-source filters/preferences");

console.log("final end-to-end dashboard audit regression passed");
