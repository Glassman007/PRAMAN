# Stage 2 rendering foundation

## Delivered
- Pinned, local Three.js 0.180.0 plus its official GLTFLoader. No custom GLB parsing, runtime CDN, React or new UI framework.
- One metre per world unit; X/Z local horizontal metres, Y up. Camera distance 5–2,500 m; tilt constrained to 5–70 degrees from vertical (at least 20 degrees above the ground). These are renderer configuration limits, not parcel facts or matching thresholds.
- Pan, zoom, orbit, tilt and reset using OrbitControls.
- Hemisphere and directional light; shadows, postprocessing and cinematic effects disabled. Pixel ratio capped at 1.5; render only after changes/resizing/loading.
- Ten explicit top-level groups: parcels, buildings, roads, parks, trees, props, sourceGeometry, historicalGeometry, conflicts, temporaryAnimations. Historical geometry starts hidden.
- Flat parcel picking surfaces independent of any building mesh. Building identity resolved through the mesh ancestry; instance identity through instanceId. Alt-click filters to parcels. Test objects are marked testOnly and never become canonical records.
- A promise cache deduplicates concurrent and repeat GLB requests by URL. SkeletonUtils clones scene hierarchies while sharing geometry/materials/textures; static InstancedMesh batches support multiple meshes and preserve their transforms and per-instance identity.
- Distance/frustum cell-bounds queries, native mesh frustum culling and a separate asynchronous cell lifecycle manager. These provide hooks, not a complete city streaming policy.
- One supplied building-1.glb displayed with a 12 m test width; uniform scaling, horizontal centring and base at Y=0. This is an explicitly illustrative calibration, pending the full asset dimension audit. The independent 20 × 18 m test footprint is not a source parcel or a fixed-lot generation rule.

## Scope exclusions
No 1,000-parcel city, source polygons, roads, parks, trees, history, split/merge animation or conflict overlays were built. The metre grid is a diagnostic reference, not a road grid. No stored parcel was assigned a building or procedurally relocated. All original supplied GLBs remain byte-identical.

## Files changed
- index.html: local import map, module entry point and compact test-scene control hint.
- styles.css: canvas and hint styles only.
- app.js: renderer status events; business data remains independent.
- README.md, UPDATE_NOTES.txt: current HTTP startup and stage scope.
- tests/smoke.cjs: adapt existing panel checks to the new test scene.

New: map/*.js, data/map-data.js, vendor/three-0.180.0/*, vendor/README.md, package.json, package-lock.json, tests/foundation.cjs, this report.

## Ownership and lifecycle
Templates own shared geometry/materials/textures for the asset cache lifetime. Removing a clone must not dispose shared resources. Dispose each InstancedMesh's instance resources on unload; dispose templates once when the entire cache is retired. Cell loaders return attach/dispose callbacks; selection unregistering and group removal belong in the cell's dispose callback. Pending loads discarded after an unload/dispose request release their result rather than attaching stale objects.

Cell bounds queries are currently linear over cells and use world-space bounds. Static bounds must be refreshed after movement. Query results can drive CellManager.sync; this stage does not automatically stream real cells. Instanced batches should be per-cell for useful culling. Animated/skinned/morph or nested-instanced assets require clones rather than the static instancing helper. Per-instance geometry is not individually frustum-culled within a batch.

## Next-stage requirements / limits
- Add the actual dataset mapping and metric coordinate origin/CRS contract before connecting real parcels.
- Audit asset dimensions/orientation and assign verified metre calibration per asset. Only one GLB is exercised in this stage; the other supplied models are preserved, not certified as correctly scaled or render-compatible.
- Register real asset categories, cell extents and semantic visibility rules. Group visibility and data activity are separate from distance culling.
- Add validated Polygon/MultiPolygon topology and source provenance. The parcel mesh helper accepts already validated local rings/holes; it is not a topology repair engine.
- Add matching-version local decoders only if a future asset requires Draco, KTX2 or Meshopt. Do not add an implicit runtime CDN fallback.
- Building picks emit an event; a building inspector is intentionally deferred.
- Browser tests use software WebGL2, not a real-device performance benchmark. No 1,000-parcel performance claim is made.
- Existing Layer 1 back link targets ../layer1/index.html, outside this ZIP.

## Verification

- PASS: local-only runtime requests; Three.js revision 180 and GLTFLoader load the supplied model.
- PASS: all ten scene groups exist and the test GLB is fetched once despite repeated clones and instancing.
- PASS: test asset width 12 m and base Y=0; clones reuse geometry and materials.
- PASS: separate parcel/building raycast results; parcel picking works with buildings hidden; second instance resolves instanceId=1 and its own identity.
- PASS: real mouse orbit, pan, wheel zoom and reset; polar/distance constraints remain within configured bounds.
- PASS: distance/frustum query, deduplicated cell load, attach/unload cleanup; rendering stops while idle.
- PASS: existing layer preferences, all five parcel tabs, data validation and flood assessment regression tests.
- PASS: zero browser page errors or failed resource requests during the successful test runs.
- PASS: all 42 supplied GLBs byte-identical; vendored dependency hashes match; obsolete city symbols absent from application modules.
- Visual QA: 1440 × 900 test scene inspected. The asset and independent footprint are visible with existing PRAMAN panels preserved.
- Test-scene snapshot: 13 draw calls and 21,327 triangles on software WebGL2. This is diagnostic evidence only, not a target or full-city benchmark.
