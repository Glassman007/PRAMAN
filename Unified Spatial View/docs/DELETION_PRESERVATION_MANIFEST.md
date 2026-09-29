# Stage 1 deletion / preservation manifest

Prepared after inspecting the complete archive, before code edits.

## A — Delete / replace
- webgl-map.js: entire raw WebGL renderer. Remove shaders, array-index lot placement, scaling/translation of parcels, generated heights/prisms, road grid, circular parks, tree billboards, camera/picking/label implementation and its events.
- data/data-bundle.js: remove ONLY after the replacement empty-data adapter exists. Inspected all 13 collections: five source tables, canonical GeoJSON, conflicts, recommendations, history, metrics, source quality and flood impact. This is the old 128-parcel fixture, not the replacement dataset.
- assets/tree-green.png, assets/tree-pink.png, assets/map-background.png: old sprites and decorative map texture; remove all runtime references.
- app.js: remove area-scaled source geometry, canonical geometry substituted for missing sources, rectangle overlap/gap/merge metrics, text-parsed P-number peer identity, single-row-per-parcel indexes and old schema-dependent panel bindings. Preserve their useful UI purposes through normalized records.
- index.html/styles.css: replace canvas/labels/WebGL fallback/orbit hints and renderer-only CSS. Keep shared layout and panel styling.
- README.md / UPDATE_NOTES.txt: replace obsolete rendering and dataset claims.

## B — Preserve / refactor
- app.js: selection, layer order, stack, URL layer requests, panel open/close, Overview/Sources/Conflicts/History/Documents tabs, comparison intent, dataset summary, state notifications and formatting utilities.
- Flood assessment drawer and record-driven readiness cards: retain/refactor; no new eligibility decisions.
- layer1-integration.js / LAYER1_INTEGRATION.txt: preserve navigation and rename visible product wording.
- All supplied GLBs (apartments, buildings, commercial, government, parks, props, trees) and compression reports: preserve bytes. Do not load or place assets in this stage.

## C — Review decisions
- Satellite: old implementation is only a colored quad, not imagery. Remove quad; retain unavailable layer option awaiting georeferenced imagery.
- Flood: old extent is fabricated from scene bounds. Remove extent; retain optional data-driven assessment and unavailable map option until sourced geometry is integrated.
- Source-derived geometry: remove frontend fabrication; future adapter must deliver explicit geometry and CRS/provenance. Missing remains missing.
- Metrics: remove bbox overlap presented as polygon overlap and approximate adjacency calculations. Display only supplied comparison metrics with method/provenance.
- History: retain chronological records, expand from numeric-year snapshots to supplied dates and explicit lifecycle data; do not invent events.

## Inspection scope
All archive paths inventoried, all JS/HTML/CSS/docs read, all data collections inspected programmatically. GLB headers/JSON asset metadata inspected; no model modification required. Full symbol change ledger will be appended to STAGE1_REPORT.md after implementation.
