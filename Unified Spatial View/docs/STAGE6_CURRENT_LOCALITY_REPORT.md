# Stage 6 — Complete current Unified Spatial View

The default view now covers the complete current locality. The validated pilot remains at `?mode=pilot`, the flat cadastral fabric at `?mode=fabric`, and all 42 calibrated assets at `?mode=calibration`. No historical animation or conflict overlay was added.

## Data and placement results

Counts below come from the generated cell plans and runtime validation, not a fixed parcel loop. Detailed GLBs load near the camera; these totals describe the entire placement plan, not models simultaneously drawn at the overview.

| Measure | Count |
|---|---:|
| Active parcels rendered at overview | 1000 |
| Historical records stored | 60 |
| Cells | 10 |
| Actual building records | 961 |
| Building/construction GLB placements | 361 |
| Marker-only building records | 600 |
| Parcels with zero buildings | 132 |
| Parcels with one building | 775 |
| Parcels with multiple buildings | 93 |
| Trees | 770 |
| Standalone props | 190 |
| All placements including markers | 1925 |

| Asset category | GLB placements |
|---|---:|
| apartments | 124 |
| buildings | 121 |
| commercial | 90 |
| government | 0 |
| parks | 4 |
| props | 216 |
| trees | 770 |

The props category includes 26 construction models counted among building placements, plus 130 benches and 60 lights. These categories must not be added to the building total twice. Government assets remain available in the registry but none passed the placement rules for this locality. No inappropriate substitute was used.

All 961 building identities come from actual records. The preserved semantic engine uses deterministic stable IDs, parcel/available footprint orientation, calibrated uniform scales, setbacks and clearance. It supports zero, one and multiple buildings. Models and overview placement envelopes are illustrative, not surveyed building footprints.

## Cells and measured rendering

| Cell | Active | Building GLBs | Markers | Measured draw calls | Measured triangles |
|---|---:|---:|---:|---:|---:|
| CELL-01 | 100 | 26 | 70 | 79 | 152840 |
| CELL-02 | 100 | 48 | 50 | 74 | 498734 |
| CELL-03 | 100 | 52 | 38 | 58 | 107568 |
| CELL-04 | 100 | 11 | 118 | 31 | 87994 |
| CELL-05 | 100 | 63 | 25 | 92 | 169352 |
| CELL-06 | 100 | 53 | 44 | 81 | 157082 |
| CELL-07 | 100 | 32 | 64 | 85 | 134990 |
| CELL-08 | 100 | 5 | 93 | 126 | 174912 |
| CELL-09 | 100 | 30 | 59 | 71 | 154820 |
| CELL-10 | 100 | 41 | 39 | 97 | 207690 |

These are camera-dependent snapshots during a visit to each filtered cell, not a sum to estimate a full-detail city frame. The overview uses 49 draw calls and 2,722 triangles, with zero GLB loads. It shows all 1,000 parcel identities and illustrative placement footprints. The tour loaded 18 distinct GLB templates once and reused them. The other supplied assets remain available without unnecessary loading.

Cell bounds drive indexing, camera/frustum visibility, filtering, aggregation and detailed model loading. Detail loads within 350 m of a cell and is retained to 450 m to avoid repeated loading at a boundary. Render batches are further partitioned into 60 m spatial buckets; GLB visibility is limited to 180 m, trees to 150 m. These buckets do not change cadastral cells or parcel positions. Instance buffers are released on eviction; reusable templates remain cached. Reset restored the full overview and unloaded detailed cells.

Static-eligible assets use shared material/geometry batches and InstancedMesh. Clone-only models retain the existing safe path. An exact drawn-vertex and triangle audit passed for all 17 static-eligible templates used. Parcel batching retains triangle-to-parcel identity; all 1,000 identities and positions were compared with the normalized source. Independent parcel and building instance picking passed.

Headless Chromium with software SwiftShader measured animation-frame turnaround (including scheduling): overview median 16.8 ms / p95 19.0 ms; near-detail median 104.7 ms / p95 238.5 ms. These are not hardware GPU measurements. Close-up performance remains a limitation: further model LOD and profiling on target hardware are required before claiming smooth production performance. Source GLB bytes and calibrated sizes were not degraded to improve these figures.

## Search, labels and interface

Search indexes actual current/historical canonical IDs, observation/source record/source parcel IDs, source metadata IDs, building IDs, cell IDs and supplied `khasra_plot_no`, `plot_no`, and `building_id` fields. No Khata field was found or fabricated. Reconciliation associations link source results to canonical parcels. Results are capped at 30 with refinement guidance; keyboard navigation, focus, selection highlight and opening the inspector are supported. Historical search draws only the selected historical outline on demand.

Far views show cell context, medium views show parcel fabric, and near views show selected/relevant IDs and model detail. Labels are created lazily. Hover is throttled to 120 ms; 100 synchronous pointer moves caused one hover pick. Diagnostic calibration code is loaded only when requested. Toolbar/search typography remains readable; the inspector shifts the map rather than covering it. Browser checks and screenshot inspection covered 1366×768.

## Cadastral and road integrity

The normalized data SHA-256 remains `f9f9b76fb2e9f98e72ffd999c4dfaf57b41e63c0422464bddc7b883a65a35c0e`. EPSG:4326 → EPSG:32643 → local metres is preserved, with origin E717000, N3174000, X=E−originE and Z=originN−N. Existing source rectangular patterns, adjacency and inter-cell spacing were not altered.

The 15 actual ROAD_ACCESS_CORRIDOR parcels provide road context. No legal road network or regular decorative grid was invented. Parking paint and model placement envelopes are explicitly illustrative. Evaluation-only ground truth remains isolated from the application data.

## Validation and known limitations

The browser regression suites passed: full city, pilot, dataset, all-42 asset audit, renderer foundation and UI smoke. Python import, pilot and full-city geometry checks passed. Full-city checks found zero setback violations, zero overlap/clearance violations among placements, zero missing building identities and zero parcel identity mismatches. All browser errors were empty. Tests verify cell eviction, filters, search, parcel/building picking, label limits and preserved diagnostic modes. Playwright remains an exact development-only dependency with a lockfile.

- 600 building records use restrained markers because an appropriate calibrated GLB did not fit; visual occupancy was not forced.
- 747 source-observed footprints cross their associated canonical parcel and were excluded as placement orientation evidence. They were not silently repaired.
- 32 of 36 park parcels could not fit a composite park GLB; appropriate landscaping/benches remain. Four park GLBs fit.
- 29 parking parcels could not fit supplied parking assemblies; illustrative parking paint is used instead.
- The inherited dataset has 135 canonical overlap pairs and two unresolved building references, documented in Stage 4. This stage does not repair cadastral truth.
- Asset repetition and stylized/composite pack limitations remain. Full-locality screenshots do not certify performance on user hardware.

Evidence: `city-runtime-validation.json`, `city-placement-validation.json`, `stage6-locality.png`, and `stage6-cell-detail.png`. Prior stage reports retain their historical context.
