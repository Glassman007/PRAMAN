# PRAMAN Source & Schema Mapping — Relationship Audit

## Scope

This pass audits the existing Schema Mapping relationships only. The Schema Mapping UI layout is unchanged.

The current PRAMAN boundary remains:

`source schema → normalized source state`

before parcel matching, conflict resolution, reconciliation, or authoritative-state selection.

## Row-level audit result

The current PRAMAN dataset was used directly for the final count validation:

- `MATCHING_INPUT_VIEW`: 4,366 rows
- `SOURCE_GEOMETRIES`: 4,312 rows
- 7 detected source types

Every displayed relationship was recomputed from those rows rather than copied from UI labels.

Current represented relationships:

- **48 total relationships**
- **34 Source-native retention** relationships
- **14 Geometry normalization** relationships
- **0 invalid represented relationships**
- **0 direct non-geometry raw-field → normalized-field rules documented**
- **0 derived-field rules documented**
- **0 identifier-normalization raw-field rules documented**
- **0 explicit source → canonical field mappings documented**

The current contract also contains 16 common normalized fields per source, excluding the retained JSON container, whose upstream raw-field derivation is undocumented. Across seven sources this produces **112 `No documented raw-field derivation` audit entries**. They are intentionally not converted into UI connectors.

## `khasra_plot_no` decision

The existing relationship:

`khasra_plot_no → source_specific_details.khasra_plot_no`

is technically valid and is preserved.

Row-level validation shows 1,061 Revenue/Cadastral normalized rows with a populated retained `khasra_plot_no` value. The current pre-match contract does **not** document a rule mapping this field to `CANONICAL_PARCELS.parcel_number` or any other canonical field, so no canonical relationship is invented.

## Corrected datatype representation

A technical presentation bug existed for retained JSON-path mappings. The service previously returned the datatype of the whole `source_specific_details` container (`JSON/Text`) as the target datatype.

That is not the datatype of the nested value.

The service now separates:

- `targetDataType` — actual retained leaf-value datatype, recomputed/observed from the source-specific values
- `targetStorageDataType` — storage-container datatype (`JSON/Text`)

For example:

`khasra_plot_no → source_specific_details.khasra_plot_no`

now reports:

- source datatype: `string`
- destination leaf datatype: `string`
- storage container datatype: `JSON/Text`

The relationship itself is unchanged.

## Affected-record count validation

### Source-native retention

Affected-record counts are recomputed by parsing every selected source row's `source_specific_details` JSON and counting actual populated values for the audited key.

The recomputed count is then cross-checked against the generated contract's source-specific field profile.

Examples:

- Revenue `khasra_plot_no`: 1,061 populated rows
- Municipal `built_up_area`: 1,028 populated rows
- UAV `possible_encroachment`: 20 populated rows, with 762 required-value exceptions
- Utility `utility_easement`: 36 populated rows, with 154 required-value exceptions

Historical-nullability remains respected. For example, cadastral fields declared historical-nullable can have missing values without being falsely reported as validation exceptions.

### Geometry normalization

For every geometry relationship, the audit directly counts rows where source field, normalized target, and normalization metadata are present and cross-checks:

- source-field populated count
- target-field populated count
- `SOURCE_GEOMETRIES` rows for the source
- configured `affected_records`

All 14 geometry relationships agree exactly.

Examples:

- Revenue: 1,043 geometry-normalization rows
- Municipal: 1,016
- DDA: 287
- Building GIS: 765
- UAV: 782
- GNSS/CORS: 229
- Utility/Infrastructure: 190

Revenue and Municipal have more normalized source observations than geometry rows because some observations reuse an already referenced geometry; the geometry relationship correctly counts geometry rows rather than pretending each normalized observation owns a unique geometry transformation.

## Exact value alignments that are **not** promoted to mappings

Row-level comparison found four exact source-native/common-field value alignments:

- Municipal `last_update` ↔ `observation_date`: 1,052 / 1,052 rows
- DDA `sanctioned_use` ↔ `land_use`: 287 / 287 rows
- UAV `imagery_date` ↔ `observation_date`: 782 / 782 rows
- GNSS `observed_area` ↔ `observed_area`: 229 / 229 rows

These alignments are stored in the audit structure as **observed value alignment candidates**, not as mappings.

Reason: the current dataset/configuration contains no non-geometry raw-field derivation or transformation-rule table proving that the source-native field generated the normalized field. Exact equality is evidence of alignment, but it is not sufficient proof of pipeline derivation. The UI must therefore not draw new connectors for these cases unless future configuration explicitly documents the rule.

## Identifier boundary

`observation_id`, `source_record_id`, and `source_parcel_id` exist in normalized source state, but the contract states that upstream raw identifier mapping is unavailable.

They remain source-state identifiers. No relationship in this audit claims that `source_parcel_id` or any other source identifier establishes cross-source parcel identity or canonical identity.

## Internal audit structure

The service now exposes:

`getMappingAudit(sourceIdOrType)`

for contract-backed mapping audit information.

The row-level script:

`scripts/audit_mapping_relationships.py`

recomputes the audit against the current CSV dataset and writes:

`mapping-relationship-audit.json`

For each represented relationship the structure records:

- source field
- source datatype and datatype basis
- destination field
- destination leaf datatype
- destination storage datatype
- relationship category
- transformation rule
- retention rule
- normalization rule
- affected records
- affected-record unit and calculation basis
- datatype compatibility
- mapping evidence
- validation result/status
- exceptions
- destination existence
- whether values actually populate the destination
- raw-derivation documentation state
- pre-matching boundary
- cross-source identity safeguard
- explanation

It also contains:

- normalized fields with no documented raw-field derivation
- exact value-alignment candidates that must **not** be promoted to mappings without explicit rule/configuration evidence

This structure is intended for the next Schema Mapping UI pass without changing the current UI in this audit step.
