import fs from 'node:fs';
const root=new URL('../',import.meta.url);const assets=JSON.parse(fs.readFileSync(new URL('data/asset-registry.json',root)));const num=x=>Number(x).toFixed(3);const vector=a=>a.map(num).join(', ');
let md=`# PRAMAN Stage 3 — asset audit and calibration

All 42 GLBs loaded with the locally vendored Three.js 0.180.0 GLTFLoader. The original model bytes are unchanged; only the apartment directory spelling changed. No city, road network, parcel dataset, history or conflict layer was created.

## Method and meaning of measurements
Native bounds are precise vertex bounds of the default GLTFLoader scene with all source node transforms applied. Native units are unknown and are **not treated as metres**. Triangle counts include mesh occurrences in the default scene, using indexed/nonindexed geometry; material and texture counts are unique objects referenced by those meshes. Unused library resources and alternative scenes are not included. The detailed native bounds, pivot positions, unusual node transforms and counts are preserved in data/asset-native-audit.json and data/asset-registry.json.

Calibration targets are reviewed illustrative display judgments, not measured real-world dimensions. Each asset gets exactly one positive uniform scalar; there is no axis stretching or model-byte edit. All 42 previews were visually reviewed as upright Y-up, so rotationCorrection is [0,0,0]. Front-facing compass direction is not known. Source nonuniform or mirrored node transforms remain intact and are reported; no new nonuniform calibration is added.

Ground correction puts the lowest transformed vertex at Y=0 and centers the horizontal bounding envelope at X=Z=0 inside a placement wrapper. This verifies geometric ground contact, not structural support or ground conformity. A source slab/site remains part of the model. At most four models appear in the comparison viewer; they are display specimens, never canonical parcels.

## Judgment calls
- Apartment files are visibly low-rise blocks, calibrated to 11–16 m rather than artificially enlarged to tower scale.
- General buildings include real tower forms: heights of 54–180 m are deliberately retained for those silhouettes. building-10 is the 24 m ordinary mid-rise comparison; building-9 includes an antenna in its 18 m total height.
- Commercial and government folder labels are supplied categories, not verified uses. Several are towers or civic complexes; automatic category-to-parcel placement would be inappropriate.
- Standalone trees are 5–6.5 m, below every calibrated apartment block. They are small/medium urban-tree choices, not botanical measurements.
- bench.glb is 1.8 m wide and about 0.50 m high. park_bench.glb is 2.2 m wide and about 0.64 m high: its low-back proportions are preserved rather than stretched.
- Lights are 3.5–4.5 m tall. Surface parking is 36 m wide with its source lights retained. The other parking asset is a 65 m multi-level complex, not a parking bay.
- Parks use maximum footprint targets of 24, 45 and 40 m, preserving built-in trees/structures. They must not receive duplicate landscaping without inspection.
- The structural frame uses a 3.3 m storey; unfinished building 24 m; whole construction site maximum footprint 60 m. Barn and windmill are specialized/manual-only, not generic urban residential assets.
- allowedLandUses are proposed display-use tags, not legal land-use authority or a mapping to an absent dataset. manualPlacementOnly must be respected by later placement logic.

## All calibrated dimensions
Widths, depths and heights below are metres. Full precision is retained in the registry; targets describe only the controlling dimension.

| Asset path | W (m) | D (m) | H (m) | Uniform scalar | Target basis | Static instances |
|---|---:|---:|---:|---:|---|---|
`;
for(const a of assets)md+=`| ${a.path} | ${num(a.footprintWidth)} | ${num(a.footprintDepth)} | ${num(a.approxHeight)} | ${a.uniformScale.toPrecision(8)} | ${a.targetDimensions.axis}: ${a.targetDimensions.metres} m | ${a.instancingAllowed?'Yes':'No — clone'} |\n`;
md+=`\n## Native diagnostics (unknown units)\n\n| Asset ID | W | D | H | Lowest Y | Meshes | Triangles | Materials | Textures | Grounded at native origin |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---|\n`;
for(const a of assets)md+=`| ${a.id} | ${num(a.nativeWidth)} | ${num(a.nativeDepth)} | ${num(a.nativeHeight)} | ${num(a.lowestY)} | ${a.meshCount} | ${a.triangleCount} | ${a.materialCount} | ${a.textureCount} | ${a.pivot.groundedAtOrigin?'Yes':'No'} |\n`;
md+=`\n## Unusable / problematic models\n\nNo model failed loading or calibrated-bound validation. ${assets.filter(a=>a.instancingAllowed).length} are eligible for the current static instancing helper; ${assets.filter(a=>!a.instancingAllowed).length} must use clones. Eligibility is conservative: transparent materials are excluded because batch sorting is not equivalent to object sorting. Mirrored world transforms also disable the static path. Both paths are automatically tested. No animation, skinned or morph feature is silently flattened.\n\n`;
for(const a of assets.filter(a=>a.notes.length||a.manualPlacementOnly))md+=`- **${a.id}**: ${a.manualPlacementOnly?'Manual placement required. ':''}${a.notes.join(' ')}\n`;
md+=`\n## Per-asset bounds, pivot and correction ledger\n\n`;
for(const a of assets){md+=`### ${a.id}\n\n- Native minimum: [${vector(a.nativeBounds.min)}]; maximum: [${vector(a.nativeBounds.max)}].\n- Native bottom-center: [${vector(a.pivot.bottomCenter)}]; model origin: [0, 0, 0].\n- Orientation: ${a.orientation.semanticUpright}\n- Metre offsets: horizontal [${vector(a.horizontalOffset)}], vertical ${num(a.groundOffset)}. Uniform scale: ${a.uniformScale}.\n- Source transforms: ${a.negativeTransforms} negative determinant nodes; ${a.nonUniformTransforms} nonuniform-scale nodes; ${a.singularTransforms} singular nodes. ${a.unusualTransforms.length} nodes flagged unusual in the JSON ledger.\n- Calibration: ${a.calibrationBasis}\n- Form / placement: ${a.visualForm}; ${a.placementMode}; suggested uses: ${a.allowedLandUses.join(', ')}.\n- Instancing: ${a.instancingAllowed?'eligible':'disabled — '+a.instancingReasons.join('; ')}.\n\n`;}
md+=`## Validation and reproducibility

Run npm ci, npm run test:install-browser, then npm test from layer2. Playwright 1.62.1 is pinned in devDependencies and package-lock.json; it is not a production runtime dependency. The test runner starts and closes its own local HTTP server. No external server or CDN is required by the tests. Three.js remains locally vendored at 0.180.0.

Automated tests passed: exact inventory and category counts, unique IDs, all paths, original SHA-256 hashes, all GLTF loads, native mesh/triangle/material/texture diagnostics, positive finite scales, finite calibrated bounds, calibrated width/depth/height, ground contact within 0.00001 m numerical tolerance, recorded instancing eligibility, supported/rejected instancing paths, switching through all 42 assets, both comparison modes, camera controls/reset, independent parcel/building picking, caching, cell hooks and existing business-panel regressions. Browser tests produced zero page errors or failed resource requests. The existing panel test uses only an in-memory fixture; no parcel dataset is imported into the application.

Screenshots: calibration-residential.png and calibration-civic.png. Machine-readable calibrated measurements and results: asset-validation.json. Regenerate this report with npm run report after deliberately editing registry calibration metadata. Changing models requires re-auditing native diagnostics and original hashes, not blindly regenerating them.

Software-rendered Chromium validation is not a full-city GPU benchmark. Full city placement, terrain alignment, geographic CRS conversion and land-use reconciliation remain outside Stage 3.
`;
fs.writeFileSync(new URL('docs/STAGE3_ASSET_REPORT.md',root),md);
console.log('Wrote complete asset report with all 42 dimension rows and correction ledgers.');
