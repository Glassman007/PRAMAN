# PRAMAN — Unified Spatial View

Unified Spatial View is the PRAMAN 2D spatial-evidence workspace. It renders the current authoritative parcel fabric, source-observed building footprints, dataset-backed source geometries, conflict/evidence diagnostics, and current/historical/proposed lifecycle states from the packaged PRAMAN runtime data.

## Runtime

The default entry is `index.html`. Serve the directory over HTTP; no client-side build step and no runtime npm dependency are required.

```sh
python -m http.server 8000
```

Then open the served `index.html`.

The production renderer is SVG/2D. There are no model assets, Three.js runtime files, calibration/pilot render modes, or 3D route aliases in this package.

## Spatial data

`data/normalized-map.json` is the primary normalized runtime spatial dataset. Supporting runtime datasets are:

- `data/temporal-details.json` and `data/temporal-geometry-audit.json` for lifecycle/history semantics.
- `data/evidence-map.json` for derived source-vs-canonical diagnostics, shared edges, and evidence geometry. These diagnostics do not create authority or conflict labels.
- `data/dashboard-routes.json` for outbound reconciliation/evidence-dashboard navigation.

Canonical authority is determined from PRAMAN record/geometry status, not newest-record or confidence heuristics. Source geometry and building footprints remain independent layers. Proposed or historical geometry never silently replaces current authority.

## Navigation

Layer 1 should link directly to `index.html`; `layer1-integration.js` is an optional compatibility bridge for an older Layer 1 click handler. The in-app Back link targets `../layer1/index.html`.

`parcel-history.html` is the local history/lineage reader used by Unified Spatial View and preserves parcel/event/version context when returning.

## Validation

The repository has no npm runtime or development dependencies. `npm ci` verifies the lock file and `npm test` runs the retained data/model, layer, routing, and repository-contract checks.

```sh
npm ci
npm test
```

Live browser interaction remains a manual/environment-level validation step; no browser automation package is required by the application.

Geometry/evidence regeneration tests require the pinned Python packages in `tools/requirements-import.txt`.

```sh
python -m pip install -r tools/requirements-import.txt
npm run test:geometry
npm run test:evidence-geometry
```

The retained offline data tools are limited to the active PRAMAN data pipeline: normalized dataset import, temporal metadata/audit, and evidence diagnostics generation. They do not generate models, decorative city placement, or fabricated spatial layers.

See `docs/FINAL_REPOSITORY_CLEANUP.md` for the final cleanup and preservation report.
