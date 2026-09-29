# PRAMAN Schema Mapping — Scroll / Overflow / Selection Stability Validation

## Scope

This pass changes only Schema Mapping presentation and interaction behavior. It does not change mapping semantics, source data, data-contract content, mapping audit results, or service-layer mapping logic.

## Changes applied

- Made Source Schema, PRAMAN Schema, and Relationship / Mapping Details real independent native vertical scroll containers.
- Added the flex sizing required for overflow to work reliably inside the fixed-height mapping workspace (`flex: 1 1 auto; min-height: 0`).
- Added visible, unobtrusive native scrollbar styling for Chromium/WebKit and Firefox, with a stable scrollbar gutter so the thumb does not cover field content.
- Preserved native mouse-wheel, trackpad, scrollbar-drag, keyboard-focus, and touch/pointer panning behavior.
- Added direct scroll listeners for Source/PRAMAN/Details panes so the selected connector path is recalculated when either endpoint moves.
- Selection state is not coupled to scroll events; scrolling does not call `setSelectedRelationId`, `setActiveRelationIds`, or `setSelectedField`.
- Selecting a documented source-field relationship auto-reveals its PRAMAN destination with short native smooth scrolling.
- Selecting a documented PRAMAN destination auto-reveals its source field.
- Selecting a relationship from the inspector reveals both endpoints.
- Changing source resets the three panel scroll positions to the top without modifying mapping semantics.
- Selecting a new relationship resets the inspector to its top so the new relationship heading/details are immediately visible.
- Added wrapping/ellipsis safeguards for long field names and datatypes.
- At widths <= 1000px the mapping panes stack vertically and remain independently scrollable; the connector overlay is hidden in that stacked layout. At 1024px and standard wider laptop sizes the declared three-column minimum widths fit without permanent horizontal clipping.

## Regression coverage

A new test, `test/schemaMappingScrollInteraction.test.mjs`, verifies:

- all three independent scroll containers exist;
- native overflow and scrollbar styling are present;
- touch/pointer vertical panning remains enabled;
- auto-reveal calls are wired for source → destination and destination → source interactions;
- connector geometry subscribes directly to schema-pane scroll events;
- scrolling does not mutate selection state;
- narrow layouts stack before three-column minimums become inaccessible;
- first, middle, and final displayed fields are valid for every detected source;
- every documented relationship among those tested fields resolves to a real PRAMAN destination and retains an audited inspector entry;
- switching to another source and returning produces the same source-field model.

## Validation results

`npm test` passed in full against the current PRAMAN dataset used for the mapping audit.

### Module / UI regression

- Service contract tests: PASS
- Dashboard selector tests: PASS
- Schema Mapping workspace selector tests: PASS
- Quality / Lineage / History selector tests: PASS
- Metadata variation tests: PASS
- Future metadata activation tests: PASS
- Record-specific provenance regression: PASS — 2,216 cases
- Final UI audit regression: PASS
- Overview cleanup regression: PASS
- Mapping relationship audit tests: PASS
- Schema Mapping presentation regression: PASS
- New scroll / selection interaction regression: PASS

### Dataset / mapping integrity

- Contract reproducibility: PASS
- Full data-integrity audit: PASS — 7 detected sources
- Controlled dataset replacement test: PASS
- Represented relationships: 48
- Source-native retention: 34
- Geometry normalization: 14
- No documented raw-field derivation: 112
- Invalid represented relationships: 0
- Observed value-alignment candidates: 4

## Source-of-truth integrity

The following files are byte-for-byte unchanged from the input UI-cleaned build:

- `data-contract.json`
- `mapping-relationship-audit.json`
- `src/sourceSchemaMappingService.js`

Therefore this pass does not change mapping logic or mapping evidence.

## Browser-rendering limitation

The installed Chromium 144 binary was detected, but headless launch does not complete in this container because browser/system-bus initialization hangs. Therefore no claim is made that a Chromium screenshot/visual smoke test passed. Responsive behavior was validated through the actual CSS constraints plus the interaction regression suite, while all data/mapping integrity tests ran against the current PRAMAN dataset.
