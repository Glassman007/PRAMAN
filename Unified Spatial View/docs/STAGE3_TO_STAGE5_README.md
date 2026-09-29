# PRAMAN — Unified Spatial View, Stage 3

Full audit and uniform display calibration of all 42 supplied GLBs, continuing the Stage 2 renderer. No city or parcel dataset is populated. Models are byte-identical to the upload; the folder is now assets/apartments/.

## Run the calibration viewer

From the directory containing layer2:

```sh
python -m http.server 8000
```

Open http://localhost:8000/layer2/ . HTTP is required for modules and model loading. Runtime dependencies are local; no npm installation or CDN is needed to use the viewer.

Use the asset selector or Previous/Next to inspect all 42 models. Two buttons show building/apartment/tree/bench and commercial/government/parking/light comparisons. Displayed dimensions are measured from each calibrated scene object. Enable bounding boxes to inspect the envelope. Drag to orbit, right-drag to pan, wheel to zoom and Reset view to return to the current calibration framing.

## Results

- docs/STAGE3_ASSET_REPORT.md: **every calibrated dimension**, native diagnostics, origin/ground correction, orientation review, judgment calls and problematic models.
- data/asset-registry.json: authoritative metadata and full-precision calibration for all 42 assets.
- data/asset-native-audit.json: loaded-scene native diagnostics; unknown native units, never assumed to be metres.
- data/asset-inventory.json: paths, unique IDs, original hashes and file sizes.
- docs/asset-validation.json: automated calibrated measurement results.
- docs/calibration-residential.png and docs/calibration-civic.png: comparison screenshots.

Targets are illustrative display calibration, not survey measurements. Scale comes exclusively from the registry and is uniform. Native mirrored/nonuniform transforms remain unchanged and documented. 26 assets are eligible for static instances; 16 require clones. No model failed to load, but specialized sites, sparse/stylized towers and composite models have placement caveats.

## Reproducible development tests

From layer2:

```sh
npm ci
npm run test:install-browser
npm test
```

Three.js 0.180.0 stays pinned and locally vendored. Playwright 1.62.1 is an exact **development-only** dependency with a lockfile. npm test launches its own local test server and runs the complete asset audit, rendering-foundation checks and existing panel checks. Test fixture records remain in memory and are never shipped as application data. Optional environment variables CHROMIUM_EXECUTABLE and PRAMAN_SOFTWARE_GPU support a preinstalled software-rendered Chromium environment.

`npm run report` rebuilds the human-readable report from the reviewed registry. `map/asset-audit.js` performs diagnostics on GLTFLoader objects; no custom GLB parser exists. The developer audit page tools/audit.html exposes runAudit() for re-inspection and preview generation. Calibration judgments must be reviewed, not auto-inferred from native units.

## Preserved foundation

Ten scene groups, metric world units, camera controls, independent parcel and building picking, the template cache, geometry/material sharing, cloning, guarded instancing, spatial index and cell manager remain. The calibration viewer is in map/calibration-viewer.js and uses at most four assets at once. Main composition is map/main.js. UI/business data stays in app.js and data/data-adapter.js; source geometry, history and conflict rendering remain pending.

The optional Layer 1 bridge is unchanged; the existing back link expects ../layer1/index.html. Stage 1 and Stage 2 reports are historical records, not current startup instructions.

## Stage 4: supplied parcel fabric

Default entry now shows the actual new dataset in flat debug mode. Use `?mode=calibration` for the preserved Stage 3 asset viewer. See `docs/STAGE4_DATA_INTEGRATION.md` for table mapping, CRS, independently calculated counts, source-overlap risks, safety boundaries and reproduction instructions. `npm test` includes the dataset browser suite. Offline import dependencies are pinned separately in `tools/requirements-import.txt` and are not browser/runtime dependencies. No decorative city has been built.

## Stage 5: pilot neighbourhood (historical default)

The default page now shows only the 42-parcel pilot. Start with `python -m http.server 8000` from this directory and open http://localhost:8000. Stage 4's full flat fabric is at `?mode=fabric`, and the asset calibration viewer is at `?mode=calibration`. Actual parcel boundaries are preserved; decorative models and parking paint are labelled illustrative. Click a model for its identity and parcel panel; Alt-click for the land beneath it. Detailed acceptance results and limits are in `docs/STAGE5_PILOT_REPORT.md`. The pilot is not approval to populate all 1,000 parcels.
