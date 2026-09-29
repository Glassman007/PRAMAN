# PRAMAN Unified Spatial View — final integration report

## 1. Functionality integrated and actually tested

No new conceptual map feature was added. The existing full locality, source comparison, unique shared edges, conflict inspection, reconciliation/evidence navigation, temporal reconstruction, GeoGit history and split/merge/boundary playback remain connected to their normalized models.

Validation passed: 18 Node model/integrity tests, 8 Python geometry/placement tests, and all 9 browser suites (responsive UI, evidence, temporal, full city, pilot regression, dataset, all assets, foundation and shell). The final performance profile additionally exercises the COMPLETE city application, source/historical modes, a real split animation and an actual browser parcel click. Test files/logs are included. No console/page errors or missing network resources were reported by the final exercised browser scenarios. The pilot is only a regression, not the final performance result.

Representative records tested: ordinary current, vacant, residential, apartment, commercial, government, park, multiple buildings, historical, split, merge, boundary correction, cross-cell relation, source overlay, shared edge, geometry/ownership conflict, proposal, under review, rejected, time machine, parcel-history navigation, Evidence Graph and Reconciliation handoff. The actual IDs are in FINAL_UI_VALIDATION.json and the temporal/evidence validation JSONs.

## 2. Files changed

Runtime, test and dependency files:

- `layer2/map/ui-shell.js`
- `layer2/tests/final-integrity.mjs`
- `layer2/tests/production-ui.cjs`
- `layer2/tests/production-profile.cjs`
- `layer2/styles.css`
- `layer2/package-lock.json`
- `layer2/package.json`
- `layer2/app.js`
- `layer2/index.html`
- `layer2/map/temporal-view.js`
- `layer2/map/main.js`
- `layer2/map/current-city.js`
- `layer2/map/evidence-view.js`
- `layer2/map/city-fabric.js`
- `layer2/map/temporal-renderer.js`
- `layer2/tests/city.cjs`
- `layer2/tests/temporal.cjs`
- `layer2/tests/evidence.cjs`
- `layer2/tests/run.cjs`
- `layer2/data/evidence-model.js`

README, final report, screenshots and machine-readable audit results are also included. Full file inventory: FINAL_CHANGE_MANIFEST.json. No application files were deleted. 76 protected data/vendor/asset files were byte-compared with Stage 8 and remain unchanged. The evidence model code was refactored; the evidence dataset was not regenerated.

## 3. Dataset counts and authority integrity

- Current authoritative records: **1000**.
- Historical records: **60**; cells: **10**.
- Unique canonical/historical IDs and all required canonical geometry, cell, building-parcel, conflict, lineage and GeoGit references pass.
- 961 building records; 765 observed building footprints; 715 conflicts; 1,715 conflict-evidence records; 74 lineage rows; 5,602 history / GeoGit records; 1,143 geometry versions.
- 135 positive-area canonical overlap pairs are reported, not repaired.
- Two source building IDs do not resolve to BUILDINGS: SEM-BLD-01-043 (OBS-004358) and SEM-BLD-02-023 (OBS-004359). Their existing `buildingRecordResolved:false` flags are preserved; they are not accepted canonical buildings.

Authority regressions explicitly reject historical, proposed, under-review and rejected overrides even when confidence is 1, accuracy is 0 and the timestamp is in 2099. Proposal geometry never replaces the authoritative geometry reference. Actual historical/proposed/rejected cases are also tested. These adversarial cases are controlled tests, not altered production records.

Canonical SHA-256: `f9f9b76fb2e9f98e72ffd999c4dfaf57b41e63c0422464bddc7b883a65a35c0e`.

## 4. Model and instance counts

The unchanged full-city plan contains **1,925 placements**: **1,325 GLB placements** and **600 marker-only building records**. Of the GLB placements, 361 are associated with building records (including 26 construction representations), 770 are trees, 190 are other props and 4 are park models. Parcels with zero / one / multiple building records: **132 / 775 / 93**.

Asset-family counts: apartments 124; general buildings 121; commercial 90; props 216 (including the 26 construction representations); trees 770; parks 4; government family 0. The supplied calibrated registry still has all 42 assets, and all 42 load in validation. The placement constraints select 18 distinct assets for this dataset. Government and other unsuitable/unfitted records remain record markers rather than semantically wrong GLBs. Counts above distinguish logical placements from the primitive instances below.

## 5. Performance before / after

Both profiles run the complete-city default application using Chromium 138 with software SwiftShader, 1366×768 for the detailed measurements, the same stable parcel targets, and the same profiling script. The before profile is the untouched Stage 8 ZIP. Values are single-run browser observations, not statistically significant benchmarks or hardware GPU timer measurements. Each frame summary uses 11 sampled intervals after 3 warmup frames; p95 is the largest of this small sample.

| Scenario | Draw calls before → after | Triangles before → after | Median frame interval ms | Sample p95 ms |
|---|---:|---:|---:|---:|
| overview | 49 → 49 | 2,722 → 2,722 | 16.7 → 16.7 | 17.1 → 18.6 |
| detail | 108 → 108 | 208,476 → 208,476 | 16.5 → 16.6 | 17.8 → 18.5 |
| source | 61 → 10 | 125,325 → 216 | 16.8 → 16.7 | 17.7 → 17.3 |
| historical | 64 → 13 | 125,857 → 748 | 16.9 → 16.6 | 17.1 → 16.9 |
| event | 5 → 5 | 8 → 8 | 16.7 → 16.6 | 17.1 → 21.9 |

| Action (ms) | Before | After |
|---|---:|---:|
| hoverPickMs | 0.26 | 0.30 |
| clickSelectionMs | 15.70 | 18.00 |
| layerToggleMs | 35.40 | 123.00 |
| sourceCompareMs | 134.90 | 200.90 |
| historicalModeMs | 19.00 | 27.10 |
| Actual browser parcel click to next frame, including driver round trips | 22.56 | 29.96 |

`clickSelectionMs` measures the focus/selection command, separately from the actual browser click. Action samples include asynchronous rendering and may overlap loading/garbage collection; several timings worsened in the final sample. **No general latency speedup is claimed.** Hover is the mean of 10 direct pick calls; the existing throttling regression confirms bounded pointer work. Active split playback measured median 16.70 → 16.70 ms and p95 17.30 → 17.30 ms over 20 frame intervals.

| After scenario | Cumulative GLB template loads | Scene objects | Primitive instances, including hidden | Materials / textures in scene | Renderer geometries |
|---|---:|---:|---:|---:|---:|
| overview | 0 | 96 | 600 | 5 / 0 | 40 |
| detail | 17 | 1435 | 2225 | 94 / 29 | 86 |
| source | 18 | 494 | 1038 | 74 / 20 | 92 |
| historical | 18 | 106 | 600 | 14 / 0 | 94 |
| event | 18 | 101 | 600 | 10 / 0 | 89 |

Reported JS heap was approximately 76.6 MB; browser memory reporting is coarse and includes retained data/caches. Exact GPU bytes were not measurable. Cumulative template loads reached 18 in the profile; all 10 cells are independently exercised by the full-city regression. Per-cell detail, batching identities, geometry equality, frustum/distance culling and lazy labels remain intact.

Applied optimizations: cached normalized observation joins; lightweight visible-cell lookup instead of traversing the detailed city merely to query cell IDs; skip rebuilding unchanged evidence/marker meshes; suppress contextual 3D during cadastral/evidence/combined historical inspection. Existing instancing, geometry/material reuse, cell loading and hover throttling are preserved. The clear reduction is inspection-mode draw/triangle work; ordinary city complexity is unchanged. Canonical identity and topology were not sacrificed.

## 6. UI corrections

The actual before and after application was rendered and visually inspected. Search and view state remain visible. Layers, Filters, Issues, Compare and History expand on demand. Empty permanent side regions were removed; the 360 px inspector opens only for a selected parcel. Essential authority/parcel fields appear first; evidence and event records use progressive disclosure. Evidence and Lineage use the existing inspector rather than duplicate panels. Unavailable satellite/flood controls are folded away with their reasons.

At 1366×768 the unselected map grew from 956×404 to **1366×554** pixels (approximately 96% more area). At 1440×900 it is 1440×686; at 1920×1080 it is 1920×866. The selected inspector leaves a useful map, closes correctly, and does not overlap it. All toolbar groups were opened and bounds-checked at all three sizes. Visible text is at least 12 px; body/control text generally 13–14 px. No horizontal page overflow was found.

CURRENT / AUTHORITATIVE is explicit. Historical geometry remains ghosted/dashed; source outlines remain dashed and labelled; proposal/review/rejected states use different line styles and labels. A state key is available in Layers. Selection uses a subdued blue fill. No thousand-label flood occurs. Comparison modes hide context objects without deleting their placement data. Empty selection, no conflicts, absent lineage, missing source geometry, no history/proposal and no filter results have deliberate messages; absent-source-geometry coverage uses an explicitly controlled fixture because every actual observation has geometry.

## 7. Defects found

Permanent history/summary regions consumed map space; old typography included 7–11 px rules; system evidence overwhelmed Overview; context models obscured comparison; proposed and under-review geometry shared an indistinguishable style; evidence rebuilt unchanged meshes and used an unnecessarily expensive visibility query. During integration, moved controls exposed container-scoped selector assumptions and the inspector tab API initially lacked the newly grouped destinations. Screenshot inspection also caught a transient empty band during the old panel slide transition.

## 8. Fixes and reproducibility

All defects above were corrected and relevant browser suites passed afterward. Selector ownership now tolerates toolbar regrouping; inspector routes include Evidence and Lineage; the unstable panel transition was removed. Labels/legends and contextual status messages remain explicit. Zero runtime syntax/import/old-ID/CDN findings were found by the final static scan, and browser suites load the real locally vendored renderer and all GLBs.

`npm ci` succeeded in a clean directory with the pinned manifest/lockfile. The earlier offline attempt failed because Three.js was absent from the local npm cache; it was an environment cache limitation, not a package-resolution failure. Playwright remains dev-only and requires browser installation for new test environments. Python requirements are pinned in the existing import requirements. Runtime viewing requires only an HTTP server and the local files, not a CDN.

## 9. Dataset limitations retained

Synthetic locality; 135 canonical overlaps; two unresolved observed building IDs; 600 marker-only building records; limited safe asset fits/repetition; no fabricated missing legal geometry, building identity, edge approval or causal AI explanation. Source observations have mixed dates. No edge-level source attribution/correction ruling table is supplied. Historical reconstruction retains the known early-geometry gaps, two cross-cell split union mismatches and rollbacks without geometry snapshots. See Stage 7/8 reports for those source limitations.

## 10. Remaining known limits / scope of claims

External Layer 1, Evidence Graph and Reconciliation applications must be mounted by the host. Their configured route payload/return-context tests pass; this ZIP does not deploy them or prove authenticated cross-dashboard production operation. The local parcel-history reader navigation is browser-tested. No backend approval persistence was added.

The evidence diagnostic JSON remains approximately 19 MB uncompressed and is loaded once at startup; comparison meshes are lazy, but the JSON is not streamed by cell. HTTP compression is advisable. Close-up asset complexity and primitive instance memory remain hardware-dependent; this pass does not guarantee 60 fps on user hardware. Chromium/software-renderer tests are not Safari/Firefox, touchscreen or mobile certification. No untested scope is presented as complete.
