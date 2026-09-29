# PRAMAN Remaining Tabs Explanatory UX Validation

## Scope

Presentation-only explanatory UX pass for **Quality & Exceptions**, **Lineage & Impact**, and **History & Configuration**. Mapping logic, dataset contract, relationship audit data, and service calculations were not changed.

## Reviewer-facing explanations added

### Quality & Exceptions
- Added a page-level explanation of what quality checking is, why PRAMAN performs it, and what the sections below contain.
- Added a Quality Profile explanation that explicitly states the measurements are not combined into an arbitrary overall quality score.
- Added the current source record count from the existing quality summary; no new metric formula was introduced.
- Added Field-Level Quality explanatory copy that distinguishes available checks from unavailable checks.
- Defined exceptions as real records/conditions that fail defined rules and explicitly stated that example exceptions are not fabricated.
- Added concise help for Completeness, Duplicate values, Datatype validity, Exception, and Validation.
- Kept the existing dataset-backed quality calculations unchanged.

### Lineage & Impact
- Added a page-level explanation that lineage here means **data traceability**, not parcel ownership/history.
- Added a Lineage explanation centered on the question “Where did this value come from?”
- Preserved the service behavior that stops at undocumented raw/transformation steps and surfaces the limitation.
- Added an Impact explanation centered on the question “What parts of PRAMAN rely on this field or transformation?”
- Explicitly states that matching, conflict resolution, reconciliation, and other downstream dependencies are not assumed when they are not recorded.
- Added concise help for Lineage, Provenance, Impact, and Transformation.

### History & Configuration
- Added a page-level explanation that this tab concerns source interpretation/configuration and is **not** Parcel History & Lineage.
- Added plain-English explanations for history, schema-version comparison, version differences, current mapping configuration, and templates/audit.
- Current source/schema history remains unavailable because the current dataset contains no such history; no versions, timestamps, operators, edits, or audit events were fabricated.
- Added explanatory copy for active relationships, transformation rules, identifier normalization, validation configuration, categorical dictionary, configuration scope, and normalized output.
- Added concise help for Configuration, Schema version, Transformation, and Validation rule.

## Regression results

`npm run test:module` passed, including:
- service contract tests
- dashboard selectors
- schema mapping workspace
- quality/lineage/history selectors
- future history metadata activation behavior
- 2,216 record-specific provenance cases
- mapping relationship audit tests
- schema presentation and scrolling interaction tests
- existing Schema Mapping explanatory UX test
- new remaining-tabs explanatory UX regression test

`npm run test:dataset` passed against the current PRAMAN dataset:
- contract reproducibility
- full data-integrity audit for 7 detected sources
- controlled dataset replacement
- mapping audit reproduction

Mapping audit totals remain:
- represented relationships: **48**
- source-native retention: **34**
- geometry normalization: **14**
- no documented raw-field derivation: **112**
- invalid represented relationships: **0**
- observed value-alignment candidates: **4**

## Source-of-truth integrity

The following files are byte-for-byte unchanged from the input build:

```text
c0c92f49c0d3ed053dfc9d6f7a0f3fc4f7fd9d08a6366da1ceb373e53adfe24b  data-contract.json
f1c785dfebbc4e203cc176a4a9b522de7c551ea855283a1f41ac23445faf576f  mapping-relationship-audit.json
e8926f87d545c62dbb3032287a46f47821ca6febb900327da04e90ccf5c93ef4  src/sourceSchemaMappingService.js
```

No mapping semantics, quality formulas, lineage derivations, history records, configuration events, or exceptions were added.
