# PRAMAN Unified Spatial View — Final Repository Cleanup Report

## Scope and safety boundary

This cleanup starts from the supplied, already validated 2D Unified Spatial View package. It is a deletion/maintenance pass only: no parcel geometry, authority logic, evidence semantics, temporal semantics, or working 2D feature was redesigned. Reference checks were performed before deletion. The supplied archive contains Unified Spatial View and its local Parcel History page, but it does **not** contain the actual Layer 1, Conflict/Reconcile, Source & Schema Mapping, or Evidence Graph application source trees; therefore cross-dashboard source usage outside this archive cannot be independently inspected or opened here. The retained outbound dashboard-route configuration is unchanged.

## Safe-deletion proof

The removed 3D subsystem was no longer reachable from the production entry. `map/bootstrap.js` now imports only the 2D production renderer, and current temporal/evidence views receive their 2D renderers directly. Before deletion, project-wide reference scans separated the obsolete 3D chain from current runtime files. After deletion, 36 resolved local code/import references were checked with **0 missing targets**; the only intentional external navigation target is `../layer1/index.html`, which points outside this supplied package.

The current dataset JSON was not rewritten. The following authoritative runtime files remain byte-identical to the cleanup input:

| Runtime data | Bytes | SHA-256 | Identical |
|---|---:|---|---|
| `data/normalized-map.json` | 14,672,834 | `f9f9b76fb2e9f98e72ffd999c4dfaf57b41e63c0422464bddc7b883a65a35c0e` | Yes |
| `data/evidence-map.json` | 19,385,900 | `b6379fae43c8626bb4761189fa3bbf4b9d489a446c1215dc1d2015c7af1253b7` | Yes |
| `data/temporal-details.json` | 194,539 | `261b7c93c54e7ceaabb18a3387313b075d1c47fa92258a90583f40b7756fc1d1` | Yes |
| `data/temporal-geometry-audit.json` | 14,820 | `8342d1a760bac068ef6721bb936aaa4ba5615f12649c90e8f618162104fa9bc5` | Yes |
| `data/dashboard-routes.json` | 250 | `021fccc0d99888c8809dae29fcc0d036941bc9b13e13de4d0db748df216f5591` | Yes |


## Files removed

A total of **199 pre-cleanup files** were removed because they were verified obsolete in the supplied repository. The exact machine-readable deletion manifest is in `docs/FINAL_REPOSITORY_CLEANUP.json`.

### Assets removed

All **42 GLB model assets** and the two old model-compression reports were removed. No real building-footprint or source geometry data was removed.

- `assets/apartments/app-1.glb`
- `assets/apartments/app-2.glb`
- `assets/apartments/app-3.glb`
- `assets/apartments/app-4.glb`
- `assets/apartments/app-5.glb`
- `assets/apartments/app-6.glb`
- `assets/apartments/app-7.glb`
- `assets/buildings/building-1.glb`
- `assets/buildings/building-10.glb`
- `assets/buildings/building-2.glb`
- `assets/buildings/building-3.glb`
- `assets/buildings/building-4.glb`
- `assets/buildings/building-5.glb`
- `assets/buildings/building-6.glb`
- `assets/buildings/building-7.glb`
- `assets/buildings/building-8.glb`
- `assets/buildings/building-9.glb`
- `assets/buildings/compression_report.json`
- `assets/buildings/compression_report.txt`
- `assets/commercial/com-1.glb`
- `assets/commercial/com-2.glb`
- `assets/commercial/com-3.glb`
- `assets/government/gov-1.glb`
- `assets/government/gov-2.glb`
- `assets/government/gov-3.glb`
- `assets/parks/park-1.glb`
- `assets/parks/park-2.glb`
- `assets/parks/park-3.glb`
- `assets/props/barn.glb`
- `assets/props/bench.glb`
- `assets/props/construction.glb`
- `assets/props/construction_prop.glb`
- `assets/props/lantern-2.glb`
- `assets/props/lantern-3.glb`
- `assets/props/lantern.glb`
- `assets/props/park_bench.glb`
- `assets/props/parking_lot.glb`
- `assets/props/toninos_parking_lots.glb`
- `assets/props/warehouse_building_construction_site.glb`
- `assets/props/windmill.glb`
- `assets/trees/tree-1.glb`
- `assets/trees/tree-2.glb`
- `assets/trees/tree-3.glb`
- `assets/trees/tree-4.glb`

### Components removed

The following old Three.js/model/scene modules were removed after the production 2D path stopped referencing them:

- `map/asset-audit.js`
- `map/asset-loader.js`
- `map/asset-registry.js`
- `map/calibration-viewer.js`
- `map/camera.js`
- `map/city-assets.js`
- `map/city-builder.js`
- `map/city-fabric.js`
- `map/controls.js`
- `map/current-city.js`
- `map/evidence-renderer.js`
- `map/interaction.js`
- `map/main.js`
- `map/parcel-fabric.js`
- `map/parcel-renderer.js`
- `map/pilot-neighbourhood.js`
- `map/scene.js`
- `map/spatial-index.js`
- `map/temporal-renderer.js`

### Routes / modes removed

- Legacy `?mode=pilot` production branch.
- Legacy `?mode=calibration` production branch.
- Legacy generic non-city / Three.js fallback branch.
- No valid current 2D route was removed. `index.html` remains the direct Unified Spatial View entry, and the Layer 1 back contract remains `../layer1/index.html`.

### Dependencies removed

- `three@0.180.0` — old 3D runtime is no longer reachable or present.
- `playwright@1.62.1` — obsolete package-local browser harness was removed; it is not required by the functioning static application.

`package-lock.json` was regenerated. The final npm package has no runtime or development dependencies.

### Duplicate / generated data removed

The following were generated placement/asset copies or legacy bootstrap data, not the active normalized PRAMAN source used by the 2D workspace:

- `data/asset-inventory.json`
- `data/asset-native-audit.json`
- `data/asset-registry.json`
- `data/city/CELL-01.json`
- `data/city/CELL-02.json`
- `data/city/CELL-03.json`
- `data/city/CELL-04.json`
- `data/city/CELL-05.json`
- `data/city/CELL-06.json`
- `data/city/CELL-07.json`
- `data/city/CELL-08.json`
- `data/city/CELL-09.json`
- `data/city/CELL-10.json`
- `data/city/manifest.json`
- `data/map-data.js`
- `data/pilot-plan.json`

No current `normalized-map.json`, evidence map, temporal detail/audit data, or dashboard-route data was deleted.

### Obsolete tools removed

- `tools/audit.html`
- `tools/build_city.py`
- `tools/build_pilot.py`
- `tools/generate-report.mjs`
- `tools/report_pilot.py`
- `tools/report_temporal.py`

The active import/temporal/evidence data pipeline tools were deliberately retained.

### Obsolete tests removed

The old model/pilot/Three.js browser tests were removed. Current 2D semantic, layer, routing, search, history, evidence and geometry tests remain.

- `tests/assets.cjs`
- `tests/city.cjs`
- `tests/dataset.cjs`
- `tests/evidence.cjs`
- `tests/foundation.cjs`
- `tests/pilot.cjs`
- `tests/production-profile.cjs`
- `tests/production-ui.cjs`
- `tests/run.cjs`
- `tests/smoke.cjs`
- `tests/temporal.cjs`
- `tests/test_city.py`
- `tests/test_pilot.py`

### Vendored 3D runtime removed

- `vendor/three-0.180.0/LICENSE`
- `vendor/three-0.180.0/SHA256SUMS.json`
- `vendor/three-0.180.0/addons/controls/OrbitControls.js`
- `vendor/three-0.180.0/addons/loaders/GLTFLoader.js`
- `vendor/three-0.180.0/addons/utils/BufferGeometryUtils.js`
- `vendor/three-0.180.0/addons/utils/SkeletonUtils.js`
- `vendor/three-0.180.0/build/three.core.js`
- `vendor/three-0.180.0/build/three.module.js`

### Historical/generated artifacts removed

The old `docs/` directory contained **92** stage reports, screenshots, generated validation snapshots, and asset/pilot/3D artifacts from superseded implementations. They were removed to prevent obsolete results from being mistaken for current validation. The complete list is below.

- `docs/ASSET_FREE_2D_VALIDATION.md`
- `docs/DATA_CONTRACT.md`
- `docs/DELETION_PRESERVATION_MANIFEST.md`
- `docs/FINAL_CHANGE_MANIFEST.json`
- `docs/FINAL_DATA_INTEGRITY.json`
- `docs/FINAL_FOCUSED_TESTS.txt`
- `docs/FINAL_GEOMETRY_TESTS.txt`
- `docs/FINAL_INSTALL_ONLINE_TEST.txt`
- `docs/FINAL_INSTALL_TEST.txt`
- `docs/FINAL_INTEGRATION_REPORT.md`
- `docs/FINAL_INTEGRITY_TESTS.txt`
- `docs/FINAL_PRESERVATION.json`
- `docs/FINAL_PROFILE_AFTER.json`
- `docs/FINAL_PROFILE_BEFORE.json`
- `docs/FINAL_PROFILE_TEST.txt`
- `docs/FINAL_REGRESSION_TESTS.txt`
- `docs/FINAL_TECHNICAL_HEALTH.json`
- `docs/FINAL_UI_LAST_CHECK.txt`
- `docs/FINAL_UI_VALIDATION.json`
- `docs/ROUTING_ENTRY_FIX_VALIDATION.md`
- `docs/STAGE1_REPORT.md`
- `docs/STAGE2_REPORT.md`
- `docs/STAGE3_ASSET_REPORT.md`
- `docs/STAGE3_TO_STAGE5_README.md`
- `docs/STAGE4_DATA_INTEGRATION.md`
- `docs/STAGE5_PILOT_REPORT.md`
- `docs/STAGE6_CURRENT_LOCALITY_REPORT.md`
- `docs/STAGE7_PRESERVATION_CHECK.json`
- `docs/STAGE7_TEMPORAL_FINAL_TEST.txt`
- `docs/STAGE7_TEMPORAL_REPORT.md`
- `docs/STAGE7_TEST_RESULTS.txt`
- `docs/STAGE8_CHANGE_MANIFEST.json`
- `docs/STAGE8_EVIDENCE_FINAL_TEST.txt`
- `docs/STAGE8_EVIDENCE_REPORT.md`
- `docs/STAGE8_GEOMETRY_TESTS.txt`
- `docs/STAGE8_NAVIGATION_CONTRACT.json`
- `docs/STAGE8_PRESERVATION_CHECK.json`
- `docs/STAGE8_REGRESSION_RETEST.txt`
- `docs/STAGE8_TEST_RESULTS.txt`
- `docs/STAGE_2D_SPATIAL_VALIDATION.json`
- `docs/STAGE_2D_SPATIAL_VALIDATION.txt`
- `docs/STAGE_2D_SPATIAL_WORKSPACE_REPORT.md`
- `docs/STAGE_SEMANTIC_SPATIAL_TESTS.txt`
- `docs/STAGE_SEMANTIC_SPATIAL_VALIDATION.md`
- `docs/asset-validation.json`
- `docs/calibration-civic.png`
- `docs/calibration-residential.png`
- `docs/city-placement-validation.json`
- `docs/city-runtime-validation.json`
- `docs/dataset-validation.json`
- `docs/evidence-model-validation.json`
- `docs/evidence-runtime-validation.json`
- `docs/final-after-1366.png`
- `docs/final-after-1440.png`
- `docs/final-after-1920.png`
- `docs/final-after-detail.png`
- `docs/final-after-event.png`
- `docs/final-after-historical.png`
- `docs/final-after-overview.png`
- `docs/final-after-source.png`
- `docs/final-before-1366.png`
- `docs/final-before-1440.png`
- `docs/final-before-1920.png`
- `docs/final-before-detail.png`
- `docs/final-before-event.png`
- `docs/final-before-historical.png`
- `docs/final-before-overview.png`
- `docs/final-before-source.png`
- `docs/final-ui-1366-inspector.png`
- `docs/final-ui-1366-overview.png`
- `docs/final-ui-1440-inspector.png`
- `docs/final-ui-1440-overview.png`
- `docs/final-ui-1920-inspector.png`
- `docs/final-ui-1920-overview.png`
- `docs/final-ui-source-inspection.png`
- `docs/native-contact-1.jpg`
- `docs/native-contact-2.jpg`
- `docs/native-contact-3.jpg`
- `docs/pilot-browser-validation.json`
- `docs/stage4-parcel-fabric.png`
- `docs/stage5-pilot.png`
- `docs/stage6-cell-detail.png`
- `docs/stage6-locality.png`
- `docs/stage7-boundary-playback.png`
- `docs/stage7-split-playback.png`
- `docs/stage7-time-machine.png`
- `docs/stage8-issues-only.png`
- `docs/stage8-shared-edge.png`
- `docs/stage8-source-comparison.png`
- `docs/temporal-model-validation.json`
- `docs/temporal-runtime-validation.json`
- `docs/workbook-comparison.json`

### Other removed files

- `UPDATE_NOTES.txt`

## Dead CSS / dead code removed

The cleanup removed CSS and application hooks belonging only to the retired scene/calibration/pilot/flood placeholder UI, including the 3D viewport/canvas hints, calibration controls, pilot-note styling, flood-impact/compensation drawer styling, disabled unavailable-layer styling, old renderer status strings, and unreachable flood-impact panel/state hooks. No current 2D parcel, source-layer, evidence, temporal, selected-parcel, search, or navigation styling was intentionally redesigned.

## Files deliberately retained

The following resources remain because they are part of the functioning 2D application or its current data pipeline:

- `index.html`, `styles.css`, `app.js` — production 2D shell, controls and parcel details.
- `map/bootstrap.js`, `map/flat-main.js`, `map/flat-svg.js`, `map/flat-layer-model.js`, `map/geometry-utils.js` — active 2D renderer and geometry model.
- `map/city-search.js` — real-identifier search/focus index.
- `map/temporal-view.js`, `data/temporal-model.js`, `data/temporal-details.json`, `data/temporal-geometry-audit.json` — current/historical/proposed lifecycle behavior.
- `map/evidence-view.js`, `map/evidence-navigation.js`, `data/evidence-model.js`, `data/evidence-map.json` — source evidence, geometry comparison, conflicts and outbound dashboard context.
- `data/normalized-map.json`, `data/data-adapter.js` — current PRAMAN normalized runtime spatial data and adapter.
- `data/dashboard-routes.json` — retained unchanged because it is the outbound contract for Conflict/Reconcile and Evidence Graph.
- `parcel-history.html`, `map/parcel-history-page.js` — local parcel history/lineage reader.
- `layer1-integration.js`, `LAYER1_INTEGRATION.txt` — retained Layer 1 compatibility/navigation contract because the actual Layer 1 app is outside this archive.
- `tools/import_dataset.py`, `tools/import_temporal.py`, `tools/audit_temporal_geometry.py`, `tools/build_evidence.py`, `tools/requirements-import.txt` — active data regeneration/audit pipeline.
- Current tests under `tests/` — retained to protect semantic authority, independent layers, routing, search, evidence, history, geometry, and cleanup invariants.

## Final validation

- **Dependency install:** PASS. `npm ci --ignore-scripts` completed with 0 vulnerabilities and no package dependencies to install.
- **Production build:** Not applicable. This package is a static ES-module application and has no production bundler/build script. No fake build command was added during cleanup.
- **Automated application tests:** PASS. `npm test` completed with **43/43 TAP subtests**, followed by **5/5 routing/layer/cleanup contract scripts**.
- **Geometry tests:** PASS. `tests/test_import.py`: **3/3**. `tests/test_evidence_geometry.py`: **3/3**.
- **JavaScript syntax:** PASS for all retained `.js`, `.mjs`, and `.cjs` files.
- **Reference scan:** PASS. 36 actual code/import/local HTML references checked, 0 missing. The Layer 1 back URL is intentionally outside this package.
- **HTTP smoke test:** PASS. `index.html`, `map/bootstrap.js`, `map/flat-main.js`, `data/normalized-map.json`, `data/evidence-map.json`, and `parcel-history.html` all returned HTTP 200 from a local static server.
- **Unified Spatial View logic:** PASS through the retained semantic/layer/runtime harnesses: canonical parcels, independent building/source layers, combinations, real-identifier search, selection/focus, temporal states and evidence behavior all remain covered.
- **Browser click-through:** **Not claimed.** System Chromium in this execution environment blocks localhost navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`, so refresh/Back/Forward and interactive visual checks could not be truthfully executed in a live browser here.
- **Layer 1:** Actual Layer 1 source is absent. The supplied bridge/back contract tests pass.
- **Parcel History & Lineage:** Present locally; its source/reference checks and HTTP load pass, while live browser interaction is subject to the Chromium restriction above.
- **Conflict/Reconcile, Source & Schema Mapping, Evidence Graph:** Their application source trees are absent from this archive, so a direct regression/open test is not possible here. The existing outbound route configuration was preserved instead of guessed or rewritten.

## Repository size / cleanliness

Before cleanup: **245 files / 61,412,993 bytes** (~58.6 MiB by file-byte sum).

After cleanup: **49 files / 34,543,893 bytes** (~32.9 MiB by file-byte sum), a reduction of **196 files / 26,869,100 bytes (43.8%)**.

The obsolete-file deletion set itself removed **199 files**. Major removed-file bytes by group:

- `UPDATE_NOTES.txt`: 1 files / 399 bytes
- `assets`: 44 files / 15,220,375 bytes
- `data`: 16 files / 2,022,356 bytes
- `docs`: 92 files / 7,242,649 bytes
- `map`: 19 files / 68,858 bytes
- `tests`: 13 files / 72,318 bytes
- `tools`: 6 files / 46,076 bytes
- `vendor`: 8 files / 2,208,384 bytes


The final size is recorded after this report is written in the machine-readable cleanup manifest. Correctness and preservation took precedence over minimizing bytes.

## Complete retained file inventory

The final retained inventory is included in `docs/FINAL_REPOSITORY_CLEANUP.json` so future cleanup passes can compare against an exact machine-readable baseline.
