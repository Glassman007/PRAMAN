import assert from "node:assert/strict";
import fs from "node:fs";
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const root = new URL("../", import.meta.url);
const jsx = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
const dts = fs.readFileSync(new URL("../src/sourceSchemaMappingService.d.ts", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const base = JSON.parse(fs.readFileSync(new URL("../data-contract.json", import.meta.url), "utf8"));

// Static UI regressions from the final audit.
assert.match(jsx, /summary\.mappingCoverage/, "Quality view must render dynamic mapping coverage");
assert.doesNotMatch(jsx, /Mapping coverage:\s*<strong>\{NA\}/, "Mapping coverage must not be hard-wired unavailable");
assert.match(jsx, /config\?\.sourceToCanonicalMapping/, "History must render source→canonical mapping dynamically");
assert.match(jsx, /qualitySummary\?\.geometryValidityAvailable/, "Source drawer must use dynamic geometry validity");
assert.match(jsx, /valueDictionary\?\.available/, "History must surface available categorical dictionaries");
assert.match(jsx, /transforms\?\.nonGeometry/, "History must surface available non-geometry transforms");
assert.doesNotMatch(jsx, /Coverage matrix|Source × canonical domain|function CanonicalMatrix/, "Coverage Matrix UI must be removed from Overview");
assert.match(jsx, /focusedDomainId = context\?\.domainId/, "Schema view must consume domain context");
assert.match(jsx, /fieldNames = service\.getSourceFieldProfiles/, "Overview global search must include source fields");
assert.match(jsx, /issueNames = service\.getExceptionCategories/, "Overview global search must include issue categories");
assert.match(jsx, /const globalQuery = \(search \|\| ""\)/, "Quality must consume global search");
assert.match(jsx, /const historyQuery = \(search \|\| ""\)/, "History must consume global search");
assert.match(jsx, /activeRelationIds\.filter\(id => visibleRelationshipIds\.has\(id\)\)/, "Filtered relationship selection must remove hidden relationships without auto-selecting a replacement");
assert.doesNotMatch(jsx, /setSelectedRelationId\(relationships\[0\]\.id\)/, "Schema mapping must not auto-select the first visible relationship and recreate connector clutter");
assert.match(jsx, /explicit_source_to_canonical_mapping"\) onPreferencesChange\?\.\(\{ schemaRightMode: "canonical" \}\)/, "Canonical relationship selection must reveal canonical target panel");
assert.match(jsx, /normalized_common"\)\.map\(f => \{ const rels=relationForField/, "Normalized common fields must expose represented relationships without inventing undocumented connectors");
assert.match(jsx, /<ConnectionOverlay/, "Field-to-field connector overlay must exist");
assert.match(jsx, /Browse normalized source records/, "General normalized record browser must exist when a loader is available");
assert.match(jsx, /getVersionComparison/, "History must support actual version comparison when version schemas exist");
assert.match(jsx, /useDialogAccessibility/, "Drawers must include keyboard/focus behavior");
assert.match(jsx, /role="separator" tabIndex=\{0\}/, "Schema resizers must be keyboard focusable");
assert.match(dts, /getAttributeProvenance\([^\n]+recordContext\?/, "Type declaration must accept recordContext");
assert.match(entry, /SourceSchemaMappingWorkspace.*\.\/dashboard\/SourceSchemaMappingWorkspace\.jsx/, "Primary module entry must export the workspace");

// Service behavior: direct source versions must be visible in History and comparable.
const contract = structuredClone(base);
const source = contract.sources[0];
source.versioning = source.versioning || {};
source.versioning.source_dataset_version_metadata_available = true;
source.versioning.versions = [
  { source_id: source.source_id, version: "v1", fields: [{ field_name: "alpha", data_type: "string" }, { field_name: "beta", data_type: "number" }] },
  { source_id: source.source_id, version: "v2", fields: [{ field_name: "alpha", data_type: "number" }, { field_name: "gamma", data_type: "string" }] },
];
const service = createSourceSchemaMappingService({ contract });
const history = service.getSourceSchemaHistory(source.source_id);
assert.equal(history.available, true);
assert.equal(history.schemaVersions.length, 2, "Direct source versions must appear in History");
const comparison = service.getVersionComparison(source.source_id);
assert.equal(comparison.available, true);
assert.deepEqual(comparison.addedFields, ["gamma"]);
assert.deepEqual(comparison.removedFields, ["beta"]);
assert.deepEqual(comparison.datatypeChanges, [{ field: "alpha", from: "string", to: "number" }]);

// Current contract must remain truthful where metadata is absent.
const current = createSourceSchemaMappingService({ contract: base });
for (const s of base.sources) {
  const q = current.getSourceQualitySummary(s.source_id);
  assert.ok(q, `quality summary missing for ${s.source_id}`);
  if (!current.getMappings(s.source_id).explicitSourceToCanonicalMappings.length) {
    assert.equal(q.mappingCoverage, NOT_AVAILABLE, `mapping coverage must not be fabricated for ${s.source_id}`);
  }
}

console.log("final UI audit regression test passed");
