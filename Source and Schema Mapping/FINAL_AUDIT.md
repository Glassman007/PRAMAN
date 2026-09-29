# PRAMAN Source & Schema Mapping — Final Corrective Audit

This package incorporates the defects identified in the supplied Final UI / Function Audit and preserves the dashboard's pre-matching semantic boundary.

## Scope

`RAW SOURCE → INGESTION / ADAPTER → VALIDATION → SCHEMA DETECTION → FIELD RELATIONSHIPS / MAPPING → TRANSFORMATION → NORMALIZED SOURCE STATE`

It does not infer parcel matching, conflict resolution, reconciliation, or authoritative state.

## Corrective fixes applied

### Dynamic UI state
- Quality renders actual mapping coverage when explicit source→canonical mappings exist.
- History renders actual source→canonical mapping availability/count.
- Source Inspector renders geometry-validity metadata when supplied.
- History renders categorical dictionaries and non-geometry transformation rules when supplied.
- Direct `source.versioning.versions` and history schema versions are merged and deduplicated.
- Schema version comparison calculates added fields, removed fields, and datatype changes when at least two field-bearing versions exist.

### Navigation / search / mapping interaction
- Canonical matrix drill-down preserves the selected canonical domain and focuses the Schema Mapping view on that domain.
- Overview global search includes source names/IDs/types, source fields, geometry fields, represented relationships, and issue categories.
- Quality and History consume the global search; Quality's global and local exception searches are independent filters.
- Schema global search and local schema search are independent filters rather than one silently overriding the other.
- The source-registry Filter control is shown only on Overview, where it has an actual effect.
- If relationship filtering hides the selected relationship, selection moves to the first visible relationship or clears when none remain.
- Selecting an explicit source→canonical relation automatically exposes the Canonical Reference panel.
- Normalized-common fields visually indicate represented relationships.
- Overview terminology distinguishes `Source → canonical` availability from other represented field relationships.

### Visual mapping
- Actual SVG field-to-field connector paths are drawn between visible source and target nodes for represented relationships.
- Paths recompute on scrolling/resizing and visually emphasize selection.
- Field/relation cards are kept above paths so connector lines do not paint over readable text.
- On narrow layouts the overlay is hidden and the relationship-card representation remains available.

### Record inspection
- Exception-backed record comparison remains record-specific.
- When the host application supplies the PRAMAN table loader, Quality can browse arbitrary normalized source records.
- Raw upstream records are never fabricated. If raw tables are unavailable, the UI explicitly reports that boundary.

### Provenance / lineage
- Exception-driven provenance is bound to the exact `observation_id`; it no longer substitutes another record's sample value.
- Regression coverage checks every current exception-backed provenance case in the bundled contract.

### Accessibility / integration
- Source Registry, quality-field rows, and exception rows support keyboard activation.
- Mapping, exception, and source drawers support Escape-to-close, focus containment, initial focus, and focus restoration.
- Schema resizers support keyboard arrows as well as pointer dragging.
- `src/index.js` exports both the service factory and `SourceSchemaMappingWorkspace`.
- Type declarations include the provenance `recordContext`, `canLoadSourceRecords`, and version-comparison APIs.

## Current bundled contract snapshot

The bundled generated contract currently contains 7 sources. Production UI values are derived from the contract/service and are not embedded as source-specific React constants.

The current contract also correctly reports that several metadata classes are absent, including explicit source→canonical mappings, canonical domains, raw upstream source records, adapter names, categorical normalization rules, mapping-confidence evidence, editable mapping state, source/schema history, and geometry-validity metadata. Those states remain unavailable rather than being fabricated.

## Validation performed on this corrected package

- Module selector/service regression suite: passed.
- Record-specific provenance regression: passed for all exception-backed cases represented by the bundled contract.
- Future-metadata activation regression: passed.
- Final UI-audit regression test: passed.
- Contract arithmetic across all 7 sources: passed.
- Exception-category arithmetic: passed.
- Relative import resolution: passed.
- JavaScript syntax validation: passed.
- JSX parse with TypeScript compiler: passed.
- Python compile validation: passed.
- JSON parse validation: passed.
- Production-source scan for current dataset-specific source IDs/names/source-native field literals: passed.
- Missing-dataset behavior: `npm run test:dataset` returns non-zero rather than silently skipping when `../PRAMAN_DATA` is absent.

## Verification boundaries

### Real source dataset
The module ZIP does not contain the external `../PRAMAN_DATA` directory. Therefore this audit does **not** claim a fresh contract reproduction against the real source files. Place the current PRAMAN dataset at `../PRAMAN_DATA` and run:

```bash
npm run test:dataset
```

The command is intentionally fail-closed if that dataset is missing.

### Browser bundle
React/Vite dependencies are declared but are not vendored in this ZIP. Dependency installation was attempted in the audit environment but could not complete, so a real Vite/browser render is not claimed. JSX syntax, relative imports, UI-state source paths, responsive CSS, and module regressions were validated statically/programmatically.

### Other PRAMAN dashboards
This artifact contains the Source & Schema Mapping module rather than the complete PRAMAN application route tree, so runtime regressions in Unified Spatial View, Conflict Explorer/Reconciliation, Evidence Graph, or Parcel History/Lineage cannot be claimed from this isolated package. No unrelated module files were introduced into this package.
