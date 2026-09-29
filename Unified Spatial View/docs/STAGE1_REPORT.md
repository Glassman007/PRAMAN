# Stage 1 implementation report

## Outcome
The old city implementation is removed. Unified Spatial View loads an intentional empty map shell. No replacement city, parcel relocation, generated buildings, roads or parks were introduced. All 42 supplied GLBs are byte-identical to the upload.

The manifest was created before editing. Its preservation decisions guided the refactor, including the decision to retain the flood assessment record UI while removing fabricated flood extent rendering.

## Files removed
- `assets/map-background.png`
- `assets/tree-green.png`
- `assets/tree-pink.png`
- `data/data-bundle.js`
- `webgl-map.js`

## Files retained / refactored
- `LAYER1_INTEGRATION.txt` — refactored/documentation updated
- `README.md` — refactored/documentation updated
- `UPDATE_NOTES.txt` — refactored/documentation updated
- `app.js` — refactored/documentation updated
- `assets/apartments/app-1.glb` — unchanged
- `assets/apartments/app-2.glb` — unchanged
- `assets/apartments/app-3.glb` — unchanged
- `assets/apartments/app-4.glb` — unchanged
- `assets/apartments/app-5.glb` — unchanged
- `assets/apartments/app-6.glb` — unchanged
- `assets/apartments/app-7.glb` — unchanged
- `assets/buildings/building-1.glb` — unchanged
- `assets/buildings/building-10.glb` — unchanged
- `assets/buildings/building-2.glb` — unchanged
- `assets/buildings/building-3.glb` — unchanged
- `assets/buildings/building-4.glb` — unchanged
- `assets/buildings/building-5.glb` — unchanged
- `assets/buildings/building-6.glb` — unchanged
- `assets/buildings/building-7.glb` — unchanged
- `assets/buildings/building-8.glb` — unchanged
- `assets/buildings/building-9.glb` — unchanged
- `assets/buildings/compression_report.json` — unchanged
- `assets/buildings/compression_report.txt` — unchanged
- `assets/commercial/com-1.glb` — unchanged
- `assets/commercial/com-2.glb` — unchanged
- `assets/commercial/com-3.glb` — unchanged
- `assets/government/gov-1.glb` — unchanged
- `assets/government/gov-2.glb` — unchanged
- `assets/government/gov-3.glb` — unchanged
- `assets/parks/park-1.glb` — unchanged
- `assets/parks/park-2.glb` — unchanged
- `assets/parks/park-3.glb` — unchanged
- `assets/props/barn.glb` — unchanged
- `assets/props/bench.glb` — unchanged
- `assets/props/construction.glb` — unchanged
- `assets/props/construction_prop.glb` — unchanged
- `assets/props/lantern-2.glb` — unchanged
- `assets/props/lantern-3.glb` — unchanged
- `assets/props/lantern.glb` — unchanged
- `assets/props/park_bench.glb` — unchanged
- `assets/props/parking_lot.glb` — unchanged
- `assets/props/toninos_parking_lots.glb` — unchanged
- `assets/props/warehouse_building_construction_site.glb` — unchanged
- `assets/props/windmill.glb` — unchanged
- `assets/trees/tree-1.glb` — unchanged
- `assets/trees/tree-2.glb` — unchanged
- `assets/trees/tree-3.glb` — unchanged
- `assets/trees/tree-4.glb` — unchanged
- `index.html` — refactored/documentation updated
- `layer1-integration.js` — refactored/documentation updated
- `styles.css` — refactored/documentation updated

## New files
- `data/data-adapter.js`: normalized empty-data adapter and atomic validation boundary.
- `docs/DELETION_PRESERVATION_MANIFEST.md`: pre-edit scope decisions.
- `docs/DATA_CONTRACT.md`: importer contract and limits.
- `docs/STAGE1_REPORT.md`: this report.
- `tests/smoke.cjs`: browser regression checks; temporary fixtures stay in memory.

## Functions removed from app.js
`adjacentGapMeters`, `bbox`, `canonicalRing`, `centroid`, `distanceMeters`, `mergePeer`, `notifyWebGLState`, `overlapPeer`, `parseWktPolygon`, `planningRing`, `polygonIoU`, `rectRing`, `referencedPeer`, `revenueRing`, `scaleRing`, `sourceStatus`, `statusClass`, `statusLabel`, `surveyRing`, `syncFloodImpactPanel`, `toggleBoundaryMode`, `ulbRing`

`notifyWebGLState` is replaced by `notifyMapState`. `toggleBoundaryMode` is removed until a replacement renderer can actually display comparisons; its button remains disabled. `boundaryMetrics` is refactored to return supplied comparison records rather than computing approximate geometry. `byParcel` (arrow helper) and old per-source singleton indexes are removed; array filtering preserves multiple observations. Severity-to-status inference is replaced by explicit authority and review status fields. Source verification displays supplied status without marking absent records as verified.

## Functions preserved by name (refactored where required)
`boundaryMetrics`, `closeFloodImpactPanel`, `closePanel`, `conflictRelevant`, `escapeHtml`, `fmtArea`, `formatPercent`, `getFloodImpactSummary`, `impactMetric`, `isYes`, `n`, `openFloodImpactPanel`, `openPanel`, `readinessSortValue`, `renderAll`, `renderCompensationReadiness`, `renderConflicts`, `renderDatasetSummary`, `renderDocuments`, `renderFloodImpactPanel`, `renderHistory`, `renderLayerControls`, `renderLayerStack`, `renderMapState`, `renderOverview`, `renderPanel`, `renderSources`, `selectParcel`, `toggleLayer`

## Removed renderer functions
The complete renderer file was deleted, including:
`addGroundLoop`, `addGroundPolygon`, `addLineSegment`, `addLoopLines`, `addObject`, `addPrism`, `addRoadAndParkContext`, `canCaptureSpace`, `canonicalWorldCenter`, `circlePoints`, `clampCamera`, `createProgram`, `createShader`, `cross`, `dot`, `drawObject`, `fitAll`, `geometryRing`, `hexToRgb`, `identity4`, `lonLatToMeters`, `lookAt`, `mat4Multiply`, `normalize`, `objectDistance`, `parcelHeight`, `perspective`, `pickParcel`, `pickSpread`, `project`, `pushVec3`, `rebuildScene`, `rectPoints`, `render`, `resizeCanvas`, `ringMetrics`, `roadCentersX`, `roadCentersZ`, `sceneBounds`, `transformPoint`, `transformRing`, `updateCamera`, `updateLabels`, `updateTrees`, `zoom`

## Obsolete dependencies / references
- Raw WebGL shader/buffer pipeline and DOM canvas/labels/fallback removed.
- All old tree sprite and map-background image URLs removed.
- CITY lot dimensions, array-index placement, coordinate relocation/scaling, parcel heights, prism geometry, generated roads and circular parks removed.
- Old data script/global, SIH renderer bridge and old state/fit events removed.
- Source polygons no longer synthesized from area; no canonical substitution for missing source geometry.
- Regex-based legacy parcel peer IDs and synthetic metrics removed.
- No package manifest/CDN dependency existed to uninstall. App runtime still needs no external package. Playwright is only a test dependency.
- The optional Layer 1 bridge intentionally recognizes legacy visible wording for navigation compatibility; this is not a dataset or renderer dependency.

## Remaining old-dataset dependence
No runtime reference to the old bundle, old parcel ID format, old parcel count or old source geometry derivation remains. Flood readiness field concepts are retained as a documented optional view model, but no old records or confidence threshold are retained. The initial layer names are still the existing five source families; new sources need explicit mapping in the next-stage importer.

## Risks / required next-stage work
1. The replacement dataset is absent from the ZIP. Implement and validate its workbook/GeoJSON mapping to the documented view model. This stage does not claim the approximately 1,000-parcel workbook is integrated.
2. The replacement renderer, source geometry validation, CRS normalization, asset scale inspection, instancing, picking, visibility and active/historical filtering are pending. No geometry or camera actions execute yet.
3. Missing geometry stays missing. Validated comparison metrics must come from a proper geometry pipeline with method/provenance, not the removed rectangle approximations.
4. Satellite imagery needs a georeferenced source and provenance. Flood extent needs sourced geometry and an explicit assessment/version relationship. Neither unavailable layer silently activates from URL parameters.
5. The retained flood summary explicitly labels its count as parcels with affected buildings. Individual building counts require building-level identities; no one-building-per-parcel placement exists in the new shell.
6. History is a chronological record view, not a complete geometry-version/lineage renderer. Lifecycle, rejected proposals and version chains need explicit mapping from the replacement data.
7. Layer 1 is outside this ZIP. The back link still targets ../layer1/index.html; deployment must retain or update that path. The optional forward bridge now derives its destination from its own script location.
8. The normalized contract validates collection shape, IDs/activity and parcel foreign keys. It is not a full semantic data auditor. Geometry, units, source identifiers, authority and document access require next-stage validation.

## Verification
See final results below.

- PASS: JavaScript syntax for app, adapter and Layer 1 bridge.
- PASS: headless Chromium page load with zero page errors or failed local requests.
- PASS: deliberate empty map persists when layers are toggled; no canvas or generated city exists.
- PASS: URL layer filtering, unavailable Satellite/Flood states, Clear and selection reset.
- PASS: in-memory fixture with 1,000 active plus one historical parcel; unknown selection rejected, stored records not automatically visible.
- PASS: Overview, multiple Sources and Conflicts, chronological History, Documents, panel dismissal and flood assessment drawer.
- PASS: duplicate parcel IDs, missing lifecycle state and dangling references rejected without replacing the current dataset.
- PASS: missing geometry remains null; supplied records are not transformed.
- PASS: all 42 GLBs and both compression reports preserved byte-for-byte.
- PASS: complete runtime reference scan for removed scripts, assets, old data globals and city-generation symbols; all local index script/style targets resolve.
- Visual inspection: 1440 × 900 empty-state screenshot reviewed; header, controls, panel shell and footer render correctly.
- External Layer 1 destination and future real-dataset integration are not testable from this ZIP alone.
