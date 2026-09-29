# PRAMAN Schema Mapping UI Cleanup Validation

## Scope

Presentation-only reorganization of the existing Schema Mapping workspace after the mapping-validity audit.

The audited mapping semantics were not changed for visual convenience.

## Implemented flow

The primary workspace now reads:

**Source Schema → PRAMAN Schema → Relationship / Mapping Details**

- Left: selected source fields, grouped only by categories already represented by the current service/data model.
- Center: relevant normalized/source-state PRAMAN destinations, geometry outputs, retained source-native destinations, plus the existing canonical reference mode.
- Right: persistent mapping/field inspector backed by `getMappingAudit()`.

## Connector behavior

- No relationship connector is drawn in the default unselected state.
- Selecting a source field activates only relationships originating from that field.
- Selecting a PRAMAN destination activates only relationships connected to that destination.
- Other relationships remain hidden instead of forming an overlapping spider-web.
- Undocumented raw-field derivations never receive a fabricated connector.

## Right-side details

For audited relationships, the panel exposes:

- source field
- PRAMAN destination
- relationship category
- source and destination datatypes
- transformation rule
- retention rule
- normalization rule
- affected-record count and unit
- validation status/result
- relationship exceptions
- mapping evidence
- plain-English explanation
- real sample values when represented

For populated normalized fields with no documented raw-field derivation, the panel uses the existing audit entry and explicitly states that no connector can be justified.

## Preserved behavior

The pass preserves:

- source selection
- relationship filtering
- field search
- source/target field selection
- mapping inspection
- affected-record counts
- datatype information
- mapping evidence
- validation state
- Export mapping
- identifier interpretation
- classification sections
- normalized/canonical reference switching
- downstream Quality, Lineage/Impact, History/Configuration tabs

## Source-of-truth integrity

The following files are byte-for-byte unchanged from the relationship-audited input:

- `data-contract.json`
- `src/sourceSchemaMappingService.js`
- `mapping-relationship-audit.json`

Therefore the cleanup does not change mappings, mapping counts, transformations, retention rules, validation results, or source-of-truth data.

## Validation results

- JSX syntax parse: PASS
- JSX transpilation check: PASS
- Module/regression suite: PASS
- 2,216 record-specific provenance cases: PASS
- Mapping audit regression: PASS
- New Schema Mapping presentation regression: PASS
- Contract reproducibility against current PRAMAN_DATA: PASS
- Full dataset integrity audit for 7 sources: PASS
- Controlled dataset replacement test: PASS
- Row-level mapping audit: PASS
  - represented relationships: 48
  - source-native retention: 34
  - geometry normalization: 14
  - undocumented raw-field derivations: 112
  - invalid represented relationships: 0
  - observed value-alignment candidates: 4
