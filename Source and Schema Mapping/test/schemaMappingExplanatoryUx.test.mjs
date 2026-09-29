import assert from "node:assert/strict";
import fs from "node:fs";
import contract from "../data-contract.json" with { type: "json" };
import { createSourceSchemaMappingService } from "../src/sourceSchemaMappingService.js";

const jsx = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard/sourceSchemaMapping.css", import.meta.url), "utf8");
const service = createSourceSchemaMappingService({ contract });

// Major reviewer-facing explanations must be present without changing scope to matching/canonicalization.
assert.match(jsx, /represented and stored by PRAMAN before parcel matching/);
assert.match(jsx, /Selected source/);
assert.match(jsx, /This panel shows the fields PRAMAN can attribute to the selected source in the current pre-match dataset/);
assert.match(jsx, /normalized\/source-state destinations PRAMAN uses internally/);
assert.match(jsx, /pre-matching representations, not automatic canonical parcel facts/);
assert.match(jsx, /retained, transformed, derived, normalized, or left without a documented derivation/);
assert.match(jsx, /Does not establish cross-source parcel identity/);
assert.match(jsx, /an honest mapping-coverage percentage and mapped\/unmapped totals cannot be calculated here/);

// Requested technical definitions are present and only render when the corresponding real field is rendered.
const expectedExplanations = {
  observation_id: "Unique identifier for this individual source observation inside PRAMAN.",
  source_record_id: "Identifier that links the normalized observation back to the record identifier supplied by this source.",
  source_parcel_id: "Parcel identifier supplied or interpreted within this source.",
  normalized_crs: "Coordinate reference system PRAMAN uses after spatial normalization.",
  normalized_geometry_wkt: "Normalized geometry representation stored for spatial processing after coordinate-system normalization.",
  source_specific_details: "Source-native information retained because the current contract does not document a trustworthy direct equivalent in the common normalized schema.",
};
for (const [field, copy] of Object.entries(expectedExplanations)) {
  assert.ok(jsx.includes(copy), `${field} needs its plain-English definition`);
}
assert.match(jsx, /MATCHING_INPUT_VIEW|text\(model\.normalizedTable\)/, "Normalized pre-matching table must remain visible");
assert.match(jsx, /normalized pre-matching representation used by the later parcel-matching process/);

const allActualFields = new Set();
for (const source of service.getSources()) {
  const model = service.getSchemaMappingModel(source.sourceId);
  for (const f of [...model.sourceFields, ...model.geometryFields, ...model.normalizedFields, ...model.geometryNormalizedFields]) allActualFields.add(f.field);
  assert.doesNotMatch(model.sourceName, /Synthetic/i, `${source.sourceId} selected-source presentation must remain cleaned`);
}
for (const field of Object.keys(expectedExplanations)) assert.ok(allActualFields.has(field), `${field} explanation must correspond to a real PRAMAN field`);

// Help stays concise and accessible; it must not add fake coverage/confidence metrics.
for (const term of ["Normalized", "Source-native", "Transformation", "Validation", "Relationship evidence", "Affected records"]) {
  assert.ok(jsx.includes(`<HelpTerm term="${term}" />`), `${term} help must be surfaced`);
}
assert.match(jsx, /aria-label=\{`\$\{term\}: \$\{help\}`\}/);
assert.match(css, /\.ssm-help-tooltip/);
assert.match(css, /\.ssm-section-explanation/);
assert.doesNotMatch(jsx, /coverage confidence|completeness score|mapping score/i, "Explanatory UX must not invent coverage/confidence/completeness scoring");

console.log("schema mapping explanatory UX regression test passed");
