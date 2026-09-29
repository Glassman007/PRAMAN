# PRAMAN Source & Schema Mapping — Dataset Audit / Data Contract

## Scope decision

- The supplied archive contains the PRAMAN dataset only; no React application, router, loader, or existing source-code architecture is present in this ZIP.
- `PRAMAN_DATA/3 Adapter/MATCHING_INPUT_VIEW.csv` is the safest dataset-backed end state for this module: pre-match normalized source evidence.
- `PRAMAN_DATA/4 Matching/SOURCE_OBSERVATIONS.csv` contains matching-stage fields including `candidate_canonical_parcel_id` and `alternate_candidate_parcel_ids`; it is inspected but not used to populate this pre-match module.
- Conflict, reconciliation, authoritative-state, history, and evaluation outputs are not used to back-fill source mappings or source statistics.

## Detected source datasets

| Source ID | Source type | Source name | Character | Normalized records | Geometry rows | CRS metadata |
|---|---|---|---|---:|---:|---|
| SRC-A-REV | `CADASTRAL_REVENUE` | Synthetic Revenue Cadastral Parcel Map | spatial + attribute | 1061 | 1043 | EPSG:32643 |
| SRC-B-MCD | `MUNICIPAL_PROPERTY` | Synthetic Municipal Property Register | spatial + attribute | 1052 | 1016 | Mixed / linked to EPSG:4326 |
| SRC-C-DDA | `DDA_DEVELOPMENT_AUTHORITY` | Synthetic DDA Scheme & Allotment Register | spatial + attribute | 287 | 287 | EPSG:32643 |
| SRC-D-GIS | `BUILDING_GIS` | Synthetic Building Footprint / Municipal GIS | spatial + attribute | 765 | 765 | EPSG:32643 |
| SRC-E-UAV | `DRONE_ORTHOPHOTO` | Synthetic 2026 Drone Orthophoto Features | spatial + attribute | 782 | 782 | EPSG:32643 |
| SRC-F-GNSS | `GNSS_CORS_SURVEY` | Synthetic GNSS/CORS Field Survey | spatial + attribute | 229 | 229 | EPSG:32643 / CORS-tied |
| SRC-G-UTIL | `UTILITY_INFRASTRUCTURE` | Synthetic Utility / Infrastructure GIS | spatial + attribute | 190 | 190 | EPSG:32643 |

All seven source types have a spatial component in `SOURCE_GEOMETRIES.csv` and an attribute/evidence component in `MATCHING_INPUT_VIEW.csv`.

## Where every dashboard value comes from

| Dashboard concept | Dataset source | Contract rule |
|---|---|---|
| Source identity and metadata | `SOURCE_METADATA.csv` | Direct values only |
| Declared source-native schema | `SOURCE_SPECIFIC_SCHEMA.csv` | Direct values only |
| Pre-match normalized source state | `MATCHING_INPUT_VIEW.csv` | Filter by `source_type` |
| Record counts, null/empty/populated counts, uniqueness and duplicate counts | `MATCHING_INPUT_VIEW.csv` | Calculated from the current rows |
| Source-native field completeness and observed value types | `source_specific_details` + `SOURCE_SPECIFIC_SCHEMA.csv` | Parse JSON, compare against declared keys |
| Spatial feature count and CRS metadata | `SOURCE_GEOMETRIES.csv` | Filter by `source_type` |
| Geometry transformation lineage | `MATCHING_INPUT_VIEW.geometry_id` → `SOURCE_GEOMETRIES.geometry_id` | Explicit join |
| Geometry transformation method | `SOURCE_GEOMETRIES.normalization_method` | Direct |
| Geometry quality categories | `SOURCE_GEOMETRIES.geometry_quality_flag` | Direct category frequencies |
| Normalized-source field definitions / datatypes | `DATA_DICTIONARY.csv`, `sheet_name=MATCHING_INPUT_VIEW` | Direct |
| Canonical field definitions / datatypes | `DATA_DICTIONARY.csv`, `sheet_name=CANONICAL_PARCELS` | Read-only schema reference only |
| Exact adapter name / adapter registry | Not present | `Not available` |
| Non-geometry raw-field → normalized-field rule | Not present | `Not available`; do not infer by similar names |
| Field-level mapping confidence/evidence | Not present | `Not available`; record confidences are not relabeled |
| Source dataset version history | Not present in pre-match tables | `Not available` |

## Source-specific declared schemas and completeness

### CADASTRAL_REVENUE

- Declared keys: `khasra_plot_no`, `map_sheet_no`, `survey_year`, `tenure_category`
- Required keys: `khasra_plot_no`, `map_sheet_no`, `survey_year`, `tenure_category`
- Historical-nullable keys: `map_sheet_no`, `survey_year`, `tenure_category`
- Missing required keys: 0 records
- Invalid `source_specific_details` JSON: 0 records
- Undeclared source-specific keys: 0 records
- Empty values in explicitly historical-nullable fields: map_sheet_no=60, survey_year=60, tenure_category=60
- Purpose: Revenue/cadastral map identity, tenure, vintage and map-sheet evidence.

### MUNICIPAL_PROPERTY

- Declared keys: `built_up_area`, `floor_count`, `last_update`, `municipal_ward`, `property_type`, `tax_status`
- Required keys: `built_up_area`, `floor_count`, `last_update`, `municipal_ward`, `property_type`, `tax_status`
- Historical-nullable keys: `built_up_area`, `floor_count`, `property_type`, `tax_status`
- Missing required keys: 0 records
- Invalid `source_specific_details` JSON: 0 records
- Undeclared source-specific keys: 0 records
- Empty values in explicitly historical-nullable fields: built_up_area=24, floor_count=24, property_type=24, tax_status=24
- Purpose: Municipal property, use, construction and taxation observations.

### DDA_DEVELOPMENT_AUTHORITY

- Declared keys: `allotment_type`, `block`, `lease_freehold_status`, `plot_no`, `sanctioned_use`, `scheme_name`
- Required keys: `allotment_type`, `block`, `lease_freehold_status`, `plot_no`, `sanctioned_use`, `scheme_name`
- Historical-nullable keys: None declared
- Missing required keys: 0 records
- Invalid `source_specific_details` JSON: 0 records
- Undeclared source-specific keys: 0 records
- Purpose: DDA/planning/allotment and sanctioned land-use evidence.

### BUILDING_GIS

- Declared keys: `building_id`, `construction_status`, `extraction_confidence`, `floor_estimate`
- Required keys: `building_id`, `construction_status`, `extraction_confidence`, `floor_estimate`
- Historical-nullable keys: None declared
- Missing required keys: 0 records
- Invalid `source_specific_details` JSON: 0 records
- Undeclared source-specific keys: 0 records
- Purpose: Building footprint and structure evidence.

### DRONE_ORTHOPHOTO

- Declared keys: `boundary_evidence`, `detected_building`, `imagery_date`, `possible_encroachment`, `road_edge`, `vacant_open_land`, `vegetation`, `wall_fence_evidence`
- Required keys: `boundary_evidence`, `detected_building`, `imagery_date`, `possible_encroachment`, `road_edge`, `vacant_open_land`, `vegetation`, `wall_fence_evidence`
- Historical-nullable keys: None declared
- Missing required keys: 0 records
- Invalid `source_specific_details` JSON: 0 records
- Undeclared source-specific keys: 0 records
- Empty values in required fields not declared historical-nullable: possible_encroachment=762, road_edge=589, vacant_open_land=711. The keys are present, so this is a completeness signal rather than a missing-key error.
- Purpose: Recent physical-world evidence from imagery.

### GNSS_CORS_SURVEY

- Declared keys: `crs`, `observed_area`, `surveyed_corner_points`, `surveyor_source`
- Required keys: `crs`, `observed_area`, `surveyed_corner_points`, `surveyor_source`
- Historical-nullable keys: None declared
- Missing required keys: 0 records
- Invalid `source_specific_details` JSON: 0 records
- Undeclared source-specific keys: 0 records
- Purpose: High-accuracy field survey evidence.

### UTILITY_INFRASTRUCTURE

- Declared keys: `utility_easement`, `utility_type`
- Required keys: `utility_easement`, `utility_type`
- Historical-nullable keys: None declared
- Missing required keys: 0 records
- Invalid `source_specific_details` JSON: 0 records
- Undeclared source-specific keys: 0 records
- Empty values in required fields not declared historical-nullable: utility_easement=154. The keys are present, so this is a completeness signal rather than a missing-key error.
- Purpose: Supporting infrastructure/easement evidence; not automatically cadastral authority.

## Spatial / transformation findings

- **CADASTRAL_REVENUE**: 1043 geometry rows; original CRS {'EPSG:32643': 1043}; normalized CRS {'EPSG:4326': 1043}; normalization method(s): CRS normalization + deterministic source-error perturbation + observed-area alignment (1043). 18 additional normalized records reuse an already referenced geometry row.
- **MUNICIPAL_PROPERTY**: 1016 geometry rows; original CRS {'EPSG:4326': 1016}; normalized CRS {'EPSG:4326': 1016}; normalization method(s): CRS normalization + deterministic source-error perturbation + observed-area alignment (1016). 36 additional normalized records reuse an already referenced geometry row.
- **DDA_DEVELOPMENT_AUTHORITY**: 287 geometry rows; original CRS {'EPSG:32643': 287}; normalized CRS {'EPSG:4326': 287}; normalization method(s): CRS normalization + deterministic source-error perturbation + observed-area alignment (287).
- **BUILDING_GIS**: 765 geometry rows; original CRS {'EPSG:32643': 765}; normalized CRS {'EPSG:4326': 765}; normalization method(s): CRS normalization + deterministic source-error perturbation + observed-area alignment (765).
- **DRONE_ORTHOPHOTO**: 782 geometry rows; original CRS {'EPSG:32643': 782}; normalized CRS {'EPSG:4326': 782}; normalization method(s): CRS normalization + deterministic source-error perturbation + observed-area alignment (782).
- **GNSS_CORS_SURVEY**: 229 geometry rows; original CRS {'EPSG:32643': 229}; normalized CRS {'EPSG:4326': 229}; normalization method(s): CRS normalization + deterministic source-error perturbation + observed-area alignment (229).
- **UTILITY_INFRASTRUCTURE**: 190 geometry rows; original CRS {'EPSG:32643': 190}; normalized CRS {'EPSG:4326': 190}; normalization method(s): CRS normalization + deterministic source-error perturbation + observed-area alignment (190).

All nonblank `geometry_id` references resolve to `SOURCE_GEOMETRIES`; no orphan geometry rows were detected by the generated contract.

## Validation-output audit

- **Dataset/documentation discrepancy:** `Matching input leakage isolation` says: “MATCHING_INPUT_VIEW has 17 feature/evidence columns; 0 direct canonical parcel IDs; candidate, alternate-candidate, source parcel and lineage target fields excluded”. Current-file inspection shows: MATCHING_INPUT_VIEW.csv contains the source_parcel_id column. The current CSV structure takes precedence for this module.

`VALIDATION_SUMMARY.csv` is an eval-only artifact. It is useful as audit evidence, but it is not allowed to override the current source files when the two disagree.

## Supported features before UI work

| Feature | Supported? |
|---|---|
| `detected_sources` | Yes |
| `source_metadata` | Yes |
| `declared_source_specific_schema` | Yes |
| `normalized_source_state` | Yes |
| `record_and_field_statistics` | Yes |
| `spatial_metadata` | Yes |
| `geometry_crs_normalization_trace` | Yes |
| `schema_conformance_checks` | Yes |
| `canonical_schema_reference` | Yes |
| `explicit_adapter_names_or_registry` | No / unavailable |
| `explicit_non_geometry_raw_to_normalized_mapping_rules` | No / unavailable |
| `field_mapping_confidence_or_evidence` | No / unavailable |
| `source_dataset_version_history` | No / unavailable |
| `pre_match_lifecycle_metadata` | No / unavailable |

## Missing information / graceful unavailable states

- Exact adapter/processor registry and adapter names are not present in the supplied dataset.
- Explicit non-geometry raw-field → normalized-field mapping rules are not present.
- Field-level mapping confidence/evidence is not present; record-level geometry/attribute/identifier confidence must not be relabeled as mapping confidence.
- Source dataset version identifiers/history are not present in the pre-match source tables.
- Lifecycle metadata fields declared by SOURCE_SPECIFIC_SCHEMA are not exposed by MATCHING_INPUT_VIEW; they appear in the later SOURCE_OBSERVATIONS matching-stage table and are excluded from this pre-match module.

## Canonical-schema boundary

`CANONICAL_PARCELS` is already defined by the PRAMAN data dictionary, so the service exposes that schema as a read-only reference. It does **not** read authoritative parcel values to populate source records, infer mappings, or decide authority.

## Lifecycle-metadata boundary

`SOURCE_SPECIFIC_SCHEMA.csv` declares `record_status`, `lineage_reference`, and `notes`. These are not present in `MATCHING_INPUT_VIEW.csv`; they are present in later `SOURCE_OBSERVATIONS.csv`. The pre-match service therefore reports them unavailable rather than pulling matching-stage state backward.

## Implementation delivered

- `data-contract.json`: generated machine-readable source/schema/quality contract.
- `scripts/build_data_contract.py`: reproducible read-only generator. No UI constants or manually typed statistics are required.
- `src/sourceSchemaMappingService.js`: framework-neutral selectors/services with injected table loading.
- `src/sourceSchemaMappingService.d.ts`: TypeScript declarations.
- `test/service.test.mjs`: selector validation against the supplied dataset.

No dashboard UI is created in this step.
---

## Prompt 3 implementation addendum

The interactive Schema Mapping workspace continues to obey the Prompt 1 audit boundary. The current dataset provides no explicit non-geometry raw-field mapping rules and no source-to-`CANONICAL_PARCELS` mapping table, so the UI does not infer either relationship.

The relationships that can be proven are:

1. Each declared source-specific key is retained under `MATCHING_INPUT_VIEW.source_specific_details.<key>`.
2. `SOURCE_GEOMETRIES` explicitly stores geometry/CRS normalization traces using original values, `normalization_method`, and normalized values.

Prompt 3 adds dataset-derived field profiles, affected-record counts, and real geometry transformation samples to the generated contract so the mapping inspector can remain dataset-backed even in the standalone React preview. Canonical fields remain a read-only schema reference only.

Mapped/unmapped source-field classification, missing required canonical-field classification, field-level mapping confidence, categorical value dictionaries, and manual reviewer mapping persistence remain unavailable because their required metadata is absent from the supplied project data/configuration.

---

## Prompt 4 implementation addendum

### Quality & exception rules

Prompt 4 extends the read-only contract with source/field quality metrics and record-level exceptions generated from current dataset rules. It does not add an aggregate quality score.

The exception validator can emit only conditions that are traceable to current pre-match files/configuration, including invalid `source_specific_details` JSON, missing or empty strict required source-specific fields, undeclared source-specific keys, DATA_DICTIONARY datatype violations, duplicate observation/source-record identifiers, geometry-reference integrity problems, and incomplete recorded geometry transformations.

Empty values for fields explicitly listed as `historical_nullable_keys` remain completeness gaps but are **not** exceptions.

Geometry `geometry_quality_flag` values are displayed as recorded metadata and are not automatically relabelled as geometry-validity failures. The dataset does not provide a defensible geometry-validity result, so geometry validity remains unavailable.

### Original record limitation

No upstream raw source-record tables exist in the supplied PRAMAN archive. `MATCHING_INPUT_VIEW` is already normalized pre-match output. Prompt 4 therefore records `raw_source_records_available=false` and never presents a normalized row as an original source record.

For detected exceptions, the generated contract stores the real normalized record, preserved `source_specific_details`, and associated `SOURCE_GEOMETRIES` row when present so the standalone UI can inspect real evidence without browser-side CSV parsing.

### Provenance and impact

Complete field-level transformation provenance is available only for the explicitly stored geometry normalization relationships. Non-geometry provenance remains partial because no raw-field → normalized-field rule table exists.

Impact analysis is restricted to traceable Source & Schema Mapping dependencies: affected source records, normalized locations, recorded geometry transformation rules, source-specific schema validation rules, and the relevant pre-match configuration/table. It deliberately reports downstream matching/reconciliation dependency as unavailable.

### History

The current dataset contains no pre-match source import/schema/mapping versions, mapping edit events, reviewer approvals/rejections, transformation edit history, or reusable mapping templates. Later `GEOGIT_EVENTS` are parcel/version history outside this module and are not pulled backward into Source & Schema Mapping. The History view therefore renders a real empty state.

### Current mapping export

Prompt 4 exports a machine-readable `PRAMAN_SOURCE_SCHEMA_MAPPING_CONFIG` object built from the same service selectors used by the UI. The export contains the selected source's real visible relationships, geometry transformation methods, identifier representation, and validation configuration. It does not include fabricated canonical mappings, categorical dictionaries, reviewer state, or version metadata.
