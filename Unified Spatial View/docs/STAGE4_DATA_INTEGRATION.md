# Stage 4 — actual dataset integration

Only the supplied active parcel fabric renders by default. No roads, buildings, parks, trees, history animation or conflict overlays were created. Stage 3 assets and calibration are preserved at `index.html?mode=calibration`.

## Source selection and inspection

Integrated the newer `dataset (1)(1).zip` CSV export, rather than mixing it with `PRAMAN_FINAL_BUILD.xlsx`. Inspected all 21 CSV table headers/counts and the workbook's 20 sheets. The workbook lacks SOURCE_GEOMETRIES; its CONFLICT_EVIDENCE has 1,498 rows versus 1,715 in the export. Several audit/schema counts also differ. Core canonical, historical, reconciliation, observation, conflict, lineage and event counts agree. This is a row-count/schema comparison, not a claim that all workbook cells equal the export. See `workbook-comparison.json`. Exact imported CSV paths, columns, record counts and SHA-256 hashes are in `dataset-validation.json` and runtime metadata.

| Meaning | Actual source and join | Normalized collection |
|---|---|---|
| Active canonical | `7 Authoritative_state/CANONICAL_PARCELS.csv`: canonical_parcel_id; explicit parcel_status; current_geometry_id | parcels |
| Historical records | `8 History/HISTORICAL_PARCELS.csv`: canonical_parcel_id; historical_geometry_id; retirement metadata | historicalParcels |
| Canonical and version geometry | `7 Authoritative_state/GEOMETRY_VERSIONS.csv`: geometry_id → parcel current/historical geometry ID; identity, accepted_status and geometry_status checked | geometryVersions; parcel.geometry |
| Cells | canonical/historical cell_id; no cell polygon table supplied | cells; membership lists and explicitly derived bounding boxes |
| Land use | CANONICAL_PARCELS.land_use; source observations kept separately | parcel.land_use |
| Building records | `9 Visual World/BUILDINGS.csv`: building_id, canonical_parcel_id, footprint_area, floors | buildingRecords; area does not generate footprint coordinates |
| Building footprint evidence | MATCHING_INPUT_VIEW source_type=BUILDING_GIS; source_specific_details.building_id; geometry_id → SOURCE_GEOMETRIES | buildingFootprints, source-observed evidence only |
| Observations/input | `3 Adapter/MATCHING_INPUT_VIEW.csv`, observation_id | observations; excludes candidate and evaluation hints |
| Rich observation archive | `4 Matching/SOURCE_OBSERVATIONS.csv`, 4,366 records; candidate and lineage hints inspected but not imported | not shipped |
| Observed geometry | `2 Source_geometry/SOURCE_GEOMETRIES.csv`: geometry_id, original and normalized WKT/CRS, normalization_method | sourceGeometry |
| Accepted/reviewed associations | `6 Reconciliation/RECONCILED_PARCELS.csv`: matched_source_ids → observation_id; canonical_parcel_id | sources; reconciliation retains proposed versus authoritative states separately |
| Conflicts | `5 Conflicts/CONFLICTS.csv`: conflict_id and canonical_parcel_id | conflicts; benchmark_case_ids removed |
| Conflict evidence | `5 Conflicts/CONFLICT_EVIDENCE.csv`: conflict_id, observation_id, geometry_id, evidence_id | conflictEvidence |
| Retired conflict provenance | CONFLICTS_REJECTED_PROVENANCE, 73 rows; may contain restored duplicates | not imported as active conflicts |
| Lineage | `8 History/PARCEL_LINEAGE.csv`: parent_parcel_id → child_parcel_id, event ID/status/date | lineage |
| Version events | `8 History/GEOGIT_EVENTS.csv`: event_id, parcel_id, previous_version, resulting_version | history and geoGitReferences; no fabricated commits or URLs |
| Source/schema | `1 Source_inputs/SOURCE_METADATA.csv` and SOURCE_SPECIFIC_SCHEMA.csv | sourceMetadata, sourceSchema |
| Complex membership | `9 Visual World/SOCIETIES_AND_COMPLEXES.csv`, 6 rows | inspected; not required for parcel rendering; no fabricated complex geometry |
| Evaluation | all five `99 Eval only` files | excluded entirely |

Reconciliation association is provenance, not a claim that source observations are ground truth. Building GIS has 765 geometric observations; these are not substituted for cadastral polygons. Two reference absent BUILDINGS IDs: OBS-004358 → SEM-BLD-01-043 and OBS-004359 → SEM-BLD-02-023. They remain explicitly unresolved evidence.

## Independent result

| Check | Result |
|---|---:|
| Canonical records / active | 1,000 / 1,000 |
| Inactive in canonical table | 0 |
| Separate historical records | 60 |
| Total stored identities | 1,060 |
| Duplicate / malformed identities | 0 / 0 |
| Missing / individually invalid active geometries | 0 / 0 |
| Missing / individually invalid historical geometries | 0 / 0 |
| Geometry version records | 1,143 |
| Source geometries / matching observations | 4,312 / 4,366 |
| Invalid normalized source geometries | 0 |
| Cells | 10, each containing 100 active parcels |
| Spatial extent | 1,586.512850 × 616.874649 metres |
| Local X bounds | 253.759859 to 1,840.272709 m |
| Local Z bounds | −1,029.827631 to −412.952982 m |

CELL-01 through CELL-10 each have 100 active records. These counts are calculated from rows, never used to generate geometry. ID validation checks the observed IN-DL-postcode-cell-parcel structure without fixing the last component's range. Every current geometry resolves to an accepted authoritative record with the same parcel identity. Historical records are selectable through the data API but are not drawn.

## CRS and reversibility

Canonical GEOMETRY_VERSIONS.crs explicitly declares EPSG:4326. SOURCE_GEOMETRIES declares 3,296 originals in EPSG:32643 and 1,016 in EPSG:4326; all 4,312 normalized geometries declare EPSG:4326. Source WKT coordinates are longitude, latitude, consistent with the independent centroid columns and the supplied projected-source locality. No unspecified CRS is accepted.

Pipeline: **EPSG:4326 WKT (longitude, latitude) → WGS 84 / UTM zone 43N, EPSG:32643 → fixed local origin E=717000, N=3174000 metres**. UTM 43N covers this locality and is also the projected CRS declared by the source data. Projection uses pinned pyproj/PROJ with `always_xy=True`, not a degrees-to-metres approximation. PROJ reference: https://proj.org/en/stable/operations/projections/utm.html; axis-order reference: https://pyproj4.github.io/pyproj/stable/api/transformer.html.

`X = E − 717000`, `Z = 3174000 − N`, `Y = 0`. North is negative Z. Y=0 is the flat display plane, not a surveyed elevation. The renderer uses tiny visual offsets to prevent z-fighting. Reverse with `E=X+717000`, `N=3174000−Z`, then inverse EPSG:32643 → EPSG:4326. Stored source WKT, geometry identity, source CRS, projected WKT, fixed origin, axis convention, importer versions and source hashes provide traceability. Maximum measured canonical/historical round-trip error: 2.01e-14 degrees.

## Geometry and topology

Shapely validates closed, finite, nondegenerate 2D rings, Polygon/MultiPolygon validity, holes and projected validity. Missing or invalid geometry receives a diagnostic record and is not rendered. Unsupported/missing CRS is rejected. No snapping, buffering, auto-repair, simplification, relocation, reordering or inferred shape is applied. Winding is handled by Three.js shape triangulation; tests cover holes in both orientations and MultiPolygon conversion. All 5,455 geometry-version/source records currently use Polygon; no supplied holes or MultiPolygons were found.

**The source itself is grid-like.** The visual check shows ten rectangular cells arranged in two rows. 956 active polygons are exactly axis-aligned rectangles in their source geographic CRS. This is not a renderer-generated grid. Every rendered vertex is checked against its normalized source coordinate (within Float32 GPU precision), and IDs/cells are assigned by joins. Altering this appearance would violate the requirement to preserve cadastral topology.

There are **3,053 touching pairs and 135 positive-area overlapping pairs in the source canonical fabric**. Total pairwise overlap area is 2,256.407938 m²; largest pair overlap is 92.013543 m². These are individually valid polygons but not an overlap-free cadastral partition. Full overlap IDs and areas are in `dataset-validation.json`. All tested DE-9IM pair relationships are unchanged by projection. The overlaps are preserved and must be reviewed upstream before treating the fabric as exclusive cadastral ground truth.

## Runtime boundary and safety

Rendering imports only normalized geometry, cells and identity. Workbook column knowledge stays in `tools/import_dataset.py`. `data/data-adapter.js` validates identities/lifecycle/references/rings and supplies existing Sources/Conflicts/History panels. Source geometry references are resolved without falling back to canonical shape. UI source-type mappings (revenue, GNSS survey, municipal, planning) are explicit presentation mappings; source overlays remain unbuilt.

Raw workbooks, CSV archives, evaluation files and SOURCE_OBSERVATIONS are not shipped. The importer allowlists operational tables and fields; matching observations come only from MATCHING_INPUT_VIEW. Benchmark linkage columns are omitted. Tests recursively reject evaluation/candidate keys in runtime data. No evaluation oracle contributes to matching inputs, visible geometry or source associations.

## Validation and reproduction

- `npm ci`, `npm run test:install-browser`, `npm test`: actual fabric coordinates, picking, cells, visibility, zero GLB loads, empty non-parcel render groups, source exclusion, hole/winding triangulation, no browser errors; existing 42-asset and foundation/UI regression suites preserved at calibration mode.
- `python -m pip install -r tools/requirements-import.txt`, then `python tests/test_import.py`: holes, MultiPolygon, invalid/self-intersecting/unclosed/missing rings and missing CRS.
- To regenerate: `python tools/import_dataset.py /path/to/PRAMAN_DATA`. Uses supplied CSVs and writes normalized JSON plus diagnostics; no evaluation files read.
- `docs/stage4-parcel-fabric.png`: visually checked full extent. Camera reset fits dataset bounds. No buildings are placed.

Remaining risks: source overlaps; two unresolved observed building references; source-observed footprints are not accepted surveyed footprints; no supplied authoritative cell boundary geometries or elevation; the 13+ MB normalized development bundle and 1,000 individual parcel meshes are suitable for this diagnostic stage but should be split into cell/evidence fetches before later production population. Cell-loading foundation remains preserved, not falsely claimed as wired to this full-fabric debug mode.
