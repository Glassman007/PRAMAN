# PRAMAN Source & Schema Mapping — Explanatory UX Validation

## Scope

This pass changes explanatory presentation only. It does not change mapping logic, the audited mapping structure, the data contract, source identifiers, transformation rules, affected-record calculations, or source-state data.

## Reviewer-facing UX changes

- Added a plain-English Schema Mapping introduction that explicitly keeps the page pre-matching.
- Kept the selected source name and source ID visible beside the introduction.
- Added purpose/context explanations for Source Schema, PRAMAN Schema, and Relationship / Mapping Details.
- Added field-level plain-English descriptions for real normalized/common and source-geometry fields, including observation/source identifiers, CRS/WKT geometry, source-specific details, confidence/accuracy fields, and normalized source-state values.
- Source-native fields without a documented semantic definition are described conservatively as retained source-specific evidence; no field meaning is invented.
- Original contract field definitions remain available through the field-card hover title where present.
- Added concise terminology help for Normalized, Source-native, Transformation, Validation, Relationship evidence, and Affected records.
- Added a full Identifier Interpretation explanation emphasizing traceability and the fact that source identifiers do not establish cross-source parcel identity.
- Added a Classification explanation stating what can and cannot be classified from current metadata. It explicitly states that mapping-coverage percentages and mapped/unmapped totals cannot be calculated honestly because the current pre-match contract lacks explicit non-geometry raw-field mapping and selected-source → canonical mapping metadata.
- `MATCHING_INPUT_VIEW` is described as PRAMAN's normalized pre-matching representation used by the later matching stage, not as canonical parcel state.

## Source-of-truth integrity

The following files are byte-for-byte unchanged from the input build:

- `data-contract.json`
- `mapping-relationship-audit.json`
- `src/sourceSchemaMappingService.js`

## Validation results

Full `npm test` passed against the current PRAMAN dataset:

- 7 detected sources
- 48 represented relationships
- 34 source-native retention relationships
- 14 geometry-normalization relationships
- 112 normalized fields explicitly classified as having no documented raw-field derivation
- 0 invalid represented relationships
- 4 observed value-alignment candidates remain candidates only
- 2,216 record-specific provenance regression cases passed
- contract reproducibility passed
- full data-integrity audit passed
- controlled dataset replacement test passed
- mapping audit regeneration/cross-check passed
- explanatory UX regression test passed
- TypeScript JSX parser reported no syntax diagnostics for `SourceSchemaMappingWorkspace.jsx`

No mapping coverage percentage, completeness score, confidence score, or undocumented mapping was introduced by this pass.
