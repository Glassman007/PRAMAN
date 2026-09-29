# PRAMAN Stage 3 — asset audit and calibration

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
| assets/apartments/app-1.glb | 9.643 | 7.060 | 12.000 | 2.5732936 | height: 12 m | Yes |
| assets/apartments/app-2.glb | 9.945 | 9.280 | 12.000 | 2.1136551 | height: 12 m | Yes |
| assets/apartments/app-3.glb | 20.513 | 7.077 | 12.000 | 2.5641026 | height: 12 m | Yes |
| assets/apartments/app-4.glb | 6.451 | 9.292 | 12.000 | 2.1136551 | height: 12 m | Yes |
| assets/apartments/app-5.glb | 15.456 | 6.001 | 16.000 | 2.7038127 | height: 16 m | Yes |
| assets/apartments/app-6.glb | 7.936 | 5.505 | 11.000 | 2.2143446 | height: 11 m | Yes |
| assets/apartments/app-7.glb | 11.850 | 9.839 | 14.000 | 2.5517094 | height: 14 m | Yes |
| assets/buildings/building-1.glb | 55.952 | 29.334 | 54.000 | 0.14388454 | height: 54 m | No — clone |
| assets/buildings/building-10.glb | 23.144 | 21.883 | 24.000 | 0.13708520 | height: 24 m | Yes |
| assets/buildings/building-2.glb | 41.477 | 42.594 | 150.000 | 0.20382088 | height: 150 m | No — clone |
| assets/buildings/building-3.glb | 33.124 | 32.584 | 96.000 | 0.20100497 | height: 96 m | No — clone |
| assets/buildings/building-4.glb | 92.586 | 92.413 | 160.000 | 0.13580494 | height: 160 m | No — clone |
| assets/buildings/building-5.glb | 35.471 | 31.957 | 180.000 | 0.16257504 | height: 180 m | No — clone |
| assets/buildings/building-6.glb | 92.575 | 79.883 | 160.000 | 0.16820841 | height: 160 m | No — clone |
| assets/buildings/building-7.glb | 152.030 | 86.148 | 60.000 | 0.073837362 | height: 60 m | No — clone |
| assets/buildings/building-8.glb | 80.831 | 80.831 | 160.000 | 0.082764738 | height: 160 m | No — clone |
| assets/buildings/building-9.glb | 16.520 | 11.322 | 18.000 | 0.50058457 | height: 18 m | Yes |
| assets/commercial/com-1.glb | 18.852 | 10.934 | 18.000 | 0.39057117 | height: 18 m | Yes |
| assets/commercial/com-2.glb | 23.506 | 23.506 | 120.000 | 0.18018013 | height: 120 m | No — clone |
| assets/commercial/com-3.glb | 32.302 | 32.301 | 150.000 | 0.14448147 | height: 150 m | No — clone |
| assets/government/gov-1.glb | 45.000 | 33.796 | 24.738 | 0.44302763 | width: 45 m | Yes |
| assets/government/gov-2.glb | 56.549 | 55.619 | 120.000 | 0.14890505 | height: 120 m | No — clone |
| assets/government/gov-3.glb | 39.878 | 55.000 | 26.379 | 0.42004774 | maxFootprint: 55 m | Yes |
| assets/parks/park-1.glb | 24.000 | 24.000 | 11.938 | 11.937824 | maxFootprint: 24 m | No — clone |
| assets/parks/park-2.glb | 45.000 | 30.386 | 8.506 | 0.27702595 | maxFootprint: 45 m | Yes |
| assets/parks/park-3.glb | 27.838 | 40.000 | 8.335 | 0.48308769 | maxFootprint: 40 m | No — clone |
| assets/props/barn.glb | 5.878 | 6.255 | 6.000 | 0.76076746 | height: 6 m | Yes |
| assets/props/bench.glb | 1.800 | 0.601 | 0.503 | 0.27068820 | width: 1.8 m | Yes |
| assets/props/construction.glb | 16.392 | 9.267 | 24.000 | 0.70900288 | height: 24 m | Yes |
| assets/props/construction_prop.glb | 7.684 | 11.359 | 3.300 | 0.86136959 | height: 3.3 m | Yes |
| assets/props/lantern-2.glb | 0.479 | 1.148 | 4.000 | 3.6354590 | height: 4 m | Yes |
| assets/props/lantern-3.glb | 0.423 | 0.423 | 3.500 | 3.2098864 | height: 3.5 m | Yes |
| assets/props/lantern.glb | 1.889 | 0.611 | 4.500 | 1.0195419 | height: 4.5 m | No — clone |
| assets/props/park_bench.glb | 2.200 | 0.504 | 0.645 | 0.010728925 | width: 2.2 m | Yes |
| assets/props/parking_lot.glb | 36.000 | 17.227 | 7.069 | 1.0008978 | width: 36 m | No — clone |
| assets/props/toninos_parking_lots.glb | 65.000 | 12.065 | 12.263 | 0.49660512 | width: 65 m | No — clone |
| assets/props/warehouse_building_construction_site.glb | 53.093 | 60.000 | 19.311 | 0.031268641 | maxFootprint: 60 m | Yes |
| assets/props/windmill.glb | 6.943 | 4.373 | 10.000 | 0.87617330 | height: 10 m | Yes |
| assets/trees/tree-1.glb | 2.213 | 2.711 | 6.000 | 1.7359252 | height: 6 m | Yes |
| assets/trees/tree-2.glb | 3.118 | 3.557 | 5.500 | 1.9752637 | height: 5.5 m | Yes |
| assets/trees/tree-3.glb | 3.462 | 5.289 | 6.500 | 2.0814717 | height: 6.5 m | Yes |
| assets/trees/tree-4.glb | 3.808 | 5.590 | 5.000 | 2.0156725 | height: 5 m | Yes |

## Native diagnostics (unknown units)

| Asset ID | W | D | H | Lowest Y | Meshes | Triangles | Materials | Textures | Grounded at native origin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| apartments-app-1 | 3.747 | 2.744 | 4.663 | -0.001 | 7 | 16620 | 7 | 0 | No |
| apartments-app-2 | 4.705 | 4.391 | 5.677 | -0.013 | 6 | 7004 | 6 | 0 | No |
| apartments-app-3 | 8.000 | 2.760 | 4.680 | -0.020 | 7 | 38756 | 7 | 0 | No |
| apartments-app-4 | 3.052 | 4.396 | 5.677 | -0.013 | 5 | 5242 | 5 | 0 | No |
| apartments-app-5 | 5.716 | 2.219 | 5.918 | -0.013 | 7 | 15072 | 7 | 0 | No |
| apartments-app-6 | 3.584 | 2.486 | 4.968 | -0.022 | 7 | 5160 | 7 | 0 | No |
| apartments-app-7 | 4.644 | 3.856 | 5.487 | -0.015 | 7 | 9740 | 7 | 0 | No |
| buildings-building-1 | 388.871 | 203.873 | 375.301 | 1.503 | 9 | 20237 | 9 | 2 | No |
| buildings-building-10 | 168.829 | 159.634 | 175.074 | -0.000 | 53 | 13457 | 53 | 5 | Yes |
| buildings-building-2 | 203.498 | 208.977 | 735.940 | 3.404 | 8 | 18287 | 6 | 1 | No |
| buildings-building-3 | 164.794 | 162.107 | 477.600 | 2.244 | 8 | 23630 | 6 | 2 | No |
| buildings-building-4 | 681.756 | 680.482 | 1178.160 | -5.496 | 11 | 20254 | 5 | 2 | No |
| buildings-building-5 | 218.185 | 196.565 | 1107.181 | 2.344 | 18 | 19284 | 8 | 4 | No |
| buildings-building-6 | 550.361 | 474.907 | 951.201 | -0.120 | 7 | 19067 | 5 | 1 | No |
| buildings-building-7 | 2058.988 | 1166.726 | 812.597 | -1.306 | 14 | 17793 | 8 | 5 | No |
| buildings-building-8 | 976.640 | 976.640 | 1933.190 | -1.190 | 11 | 15803 | 9 | 6 | No |
| buildings-building-9 | 33.002 | 22.618 | 35.958 | -1.332 | 65 | 16852 | 15 | 12 | No |
| commercial-com-1 | 48.269 | 27.995 | 46.086 | -1.642 | 16 | 20201 | 3 | 0 | No |
| commercial-com-2 | 130.458 | 130.458 | 666.000 | -0.000 | 5 | 16602 | 3 | 0 | Yes |
| commercial-com-3 | 223.571 | 223.568 | 1038.195 | -30.456 | 8 | 22308 | 6 | 0 | No |
| government-gov-1 | 101.574 | 76.284 | 55.838 | 0.000 | 1 | 1945 | 1 | 1 | No |
| government-gov-2 | 379.767 | 373.519 | 805.883 | -0.700 | 7 | 15082 | 5 | 0 | No |
| government-gov-3 | 94.937 | 130.937 | 62.800 | 5.000 | 1 | 108 | 1 | 1 | No |
| parks-park-1 | 2.010 | 2.010 | 1.000 | -0.000 | 40 | 11886 | 40 | 2 | Yes |
| parks-park-2 | 162.440 | 109.686 | 30.706 | -2.808 | 3 | 16110 | 1 | 1 | No |
| parks-park-3 | 57.626 | 82.801 | 17.253 | -0.921 | 38 | 15413 | 11 | 11 | No |
| props-barn | 7.727 | 8.222 | 7.887 | -0.004 | 14 | 4224 | 4 | 0 | No |
| props-bench | 6.650 | 2.219 | 1.856 | -1.127 | 1 | 276 | 1 | 0 | No |
| props-construction | 23.120 | 13.070 | 33.850 | -0.017 | 13 | 7559 | 13 | 9 | No |
| props-construction_prop | 8.920 | 13.187 | 3.831 | -0.000 | 2 | 14230 | 1 | 2 | Yes |
| props-lantern-2 | 0.132 | 0.316 | 1.100 | -0.000 | 3 | 2486 | 3 | 0 | No |
| props-lantern-3 | 0.132 | 0.132 | 1.090 | -0.000 | 3 | 1028 | 3 | 0 | No |
| props-lantern | 1.853 | 0.600 | 4.414 | -0.038 | 5 | 15056 | 4 | 0 | No |
| props-park_bench | 205.053 | 47.010 | 60.114 | -0.465 | 2 | 2924 | 2 | 6 | No |
| props-parking_lot | 35.968 | 17.212 | 7.062 | -0.083 | 28 | 7069 | 25 | 41 | No |
| props-toninos_parking_lots | 130.889 | 24.294 | 24.693 | -20.500 | 27 | 18538 | 6 | 4 | No |
| props-warehouse_building_construction_site | 1697.969 | 1918.855 | 617.569 | -0.000 | 16 | 10469 | 10 | 9 | Yes |
| props-windmill | 7.924 | 4.991 | 11.413 | -0.034 | 8 | 7827 | 7 | 0 | No |
| trees-tree-1 | 1.275 | 1.562 | 3.456 | -0.072 | 3 | 1584 | 3 | 0 | No |
| trees-tree-2 | 1.579 | 1.801 | 2.784 | -0.110 | 3 | 1352 | 3 | 0 | No |
| trees-tree-3 | 1.663 | 2.541 | 3.123 | -0.054 | 2 | 2952 | 2 | 0 | No |
| trees-tree-4 | 1.889 | 2.773 | 2.481 | -0.042 | 2 | 2888 | 2 | 0 | No |

## Unusable / problematic models

No model failed loading or calibrated-bound validation. 26 are eligible for the current static instancing helper; 16 must use clones. Eligibility is conservative: transparent materials are excluded because batch sorting is not equivalent to object sorting. Mirrored world transforms also disable the static path. Both paths are automatically tested. No animation, skinned or morph feature is silently flattened.

- **apartments-app-5**: Source node nonuniform scales retained; calibration adds only one uniform scalar.
- **buildings-building-1**: Clone-only: transparent materials require per-object sorting.
- **buildings-building-2**: Clone-only: transparent materials require per-object sorting.
- **buildings-building-3**: Clone-only: transparent materials require per-object sorting.
- **buildings-building-4**: Manual placement required. Includes broad base/site geometry; envelope is not a building-only footprint. Clone-only: transparent materials require per-object sorting.
- **buildings-building-5**: Manual placement required. Sparse/open-looking facade or very stylized tower in preview; verify close-up suitability before city placement. Clone-only: transparent materials require per-object sorting.
- **buildings-building-6**: Clone-only: transparent materials require per-object sorting.
- **buildings-building-7**: Manual placement required. Includes broad base/site geometry; envelope is not a building-only footprint. Sparse/open-looking facade or very stylized tower in preview; verify close-up suitability before city placement. Clone-only: transparent materials require per-object sorting.
- **buildings-building-8**: Manual placement required. Includes broad base/site geometry; envelope is not a building-only footprint. Sparse/open-looking facade or very stylized tower in preview; verify close-up suitability before city placement. Clone-only: transparent materials require per-object sorting.
- **buildings-building-9**: Manual placement required. 
- **commercial-com-1**: Source node nonuniform scales retained; calibration adds only one uniform scalar.
- **commercial-com-2**: Manual placement required. Sparse/open-looking facade or very stylized tower in preview; verify close-up suitability before city placement. Clone-only: transparent materials require per-object sorting.
- **commercial-com-3**: Manual placement required. Sparse/open-looking facade or very stylized tower in preview; verify close-up suitability before city placement. Clone-only: transparent materials require per-object sorting.
- **government-gov-1**: Manual placement required. 
- **government-gov-2**: Manual placement required. Sparse/open-looking facade or very stylized tower in preview; verify close-up suitability before city placement. Clone-only: transparent materials require per-object sorting.
- **government-gov-3**: Manual placement required. 
- **parks-park-1**: Manual placement required. Clone-only: transparent materials require per-object sorting. Composite asset already contains landscaping/structures; do not duplicate them blindly.
- **parks-park-2**: Manual placement required. Composite asset already contains landscaping/structures; do not duplicate them blindly.
- **parks-park-3**: Manual placement required. Mirrored source transforms retained unchanged; static instancing disallowed. Source node nonuniform scales retained; calibration adds only one uniform scalar. Clone-only: negative transforms, transparent materials require per-object sorting. Composite asset already contains landscaping/structures; do not duplicate them blindly.
- **props-barn**: Manual placement required. 
- **props-lantern**: Clone-only: transparent materials require per-object sorting.
- **props-parking_lot**: Clone-only: transparent materials require per-object sorting.
- **props-toninos_parking_lots**: Manual placement required. Mirrored source transforms retained unchanged; static instancing disallowed. Source node nonuniform scales retained; calibration adds only one uniform scalar. Clone-only: negative transforms.
- **props-warehouse_building_construction_site**: Manual placement required. 
- **props-windmill**: Manual placement required. 

## Per-asset bounds, pivot and correction ledger

### apartments-app-1

- Native minimum: [-1.874, -0.001, -1.372]; maximum: [1.874, 4.662, 1.372].
- Native bottom-center: [0.000, -0.001, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.003. Uniform scale: 2.5732936095524197.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible low-rise storey/roof form; chosen display height, not survey evidence.
- Form / placement: low-rise residential block; footprint; suggested uses: residential, mixed-use.
- Instancing: eligible.

### apartments-app-2

- Native minimum: [-2.353, -0.013, -2.195]; maximum: [2.353, 5.664, 2.195].
- Native bottom-center: [0.000, -0.013, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.028. Uniform scale: 2.1136550664832567.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible low-rise storey/roof form; chosen display height, not survey evidence.
- Form / placement: low-rise residential block; footprint; suggested uses: residential, mixed-use.
- Instancing: eligible.

### apartments-app-3

- Native minimum: [-4.000, -0.020, -1.380]; maximum: [4.000, 4.660, 1.380].
- Native bottom-center: [0.000, -0.020, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.051. Uniform scale: 2.564102647948132.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible low-rise storey/roof form; chosen display height, not survey evidence.
- Form / placement: low-rise residential block; footprint; suggested uses: residential, mixed-use.
- Instancing: eligible.

### apartments-app-4

- Native minimum: [-1.526, -0.013, -2.201]; maximum: [1.526, 5.664, 2.195].
- Native bottom-center: [0.000, -0.013, -0.003]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.006], vertical 0.028. Uniform scale: 2.1136550664832567.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible low-rise storey/roof form; chosen display height, not survey evidence.
- Form / placement: low-rise residential block; footprint; suggested uses: residential, mixed-use.
- Instancing: eligible.

### apartments-app-5

- Native minimum: [-2.858, -0.013, -1.110]; maximum: [2.858, 5.905, 1.110].
- Native bottom-center: [0.000, -0.013, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.035. Uniform scale: 2.7038126559309132.
- Source transforms: 0 negative determinant nodes; 1 nonuniform-scale nodes; 0 singular nodes. 1 nodes flagged unusual in the JSON ledger.
- Calibration: Visible low-rise storey/roof form; chosen display height, not survey evidence.
- Form / placement: low-rise residential block; footprint; suggested uses: residential, mixed-use.
- Instancing: eligible.

### apartments-app-6

- Native minimum: [-1.792, -0.022, -1.243]; maximum: [1.792, 4.946, 1.243].
- Native bottom-center: [0.000, -0.022, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.049. Uniform scale: 2.2143446294048057.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible low-rise storey/roof form; chosen display height, not survey evidence.
- Form / placement: low-rise residential block; footprint; suggested uses: residential, mixed-use.
- Instancing: eligible.

### apartments-app-7

- Native minimum: [-2.322, -0.015, -1.928]; maximum: [2.322, 5.472, 1.928].
- Native bottom-center: [0.000, -0.015, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.037. Uniform scale: 2.551709353418424.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible low-rise storey/roof form; chosen display height, not survey evidence.
- Form / placement: low-rise residential block; footprint; suggested uses: residential, mixed-use.
- Instancing: eligible.

### buildings-building-1

- Native minimum: [-196.115, 1.503, -104.133]; maximum: [192.755, 376.804, 99.741].
- Native bottom-center: [-1.680, 1.503, -2.196]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.242, 0.316], vertical -0.216. Uniform scale: 0.14388454366416156.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; footprint; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-10

- Native minimum: [-81.347, -0.000, -79.430]; maximum: [87.482, 175.074, 80.205].
- Native bottom-center: [3.068, -0.000, 0.388]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.421, -0.053], vertical 0.000. Uniform scale: 0.13708520242101374.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible mid-rise storeys; illustrative 24 m total height.
- Form / placement: mid-rise block; footprint; suggested uses: residential, commercial, mixed-use.
- Instancing: eligible.

### buildings-building-2

- Native minimum: [-88.705, 3.404, -99.079]; maximum: [114.794, 739.345, 109.897].
- Native bottom-center: [13.044, 3.404, 5.409]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-2.659, -1.102], vertical -0.694. Uniform scale: 0.20382087543256258.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; footprint; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-3

- Native minimum: [-83.144, 2.244, -81.328]; maximum: [81.650, 479.844, 80.779].
- Native bottom-center: [-0.747, 2.244, -0.275]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.150, 0.055], vertical -0.451. Uniform scale: 0.20100497328897157.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; footprint; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-4

- Native minimum: [-341.138, -5.496, -340.898]; maximum: [340.618, 1172.665, 339.584].
- Native bottom-center: [-0.260, -5.496, -0.657]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.035, 0.089], vertical 0.746. Uniform scale: 0.13580494140813856.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; compound; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-5

- Native minimum: [-108.477, 2.344, -98.313]; maximum: [109.709, 1109.525, 98.252].
- Native bottom-center: [0.616, 2.344, -0.031]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.100, 0.005], vertical -0.381. Uniform scale: 0.16257503729293685.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; footprint; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-6

- Native minimum: [-295.504, -0.120, -254.147]; maximum: [254.857, 951.081, 220.760].
- Native bottom-center: [-20.324, -0.120, -16.693]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [3.419, 2.808], vertical 0.020. Uniform scale: 0.1682084087314468.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; footprint; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-7

- Native minimum: [-761.884, -1.306, -556.790]; maximum: [1297.104, 811.291, 609.936].
- Native bottom-center: [267.610, -1.306, 26.573]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-19.760, -1.962], vertical 0.096. Uniform scale: 0.0738373623308342.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; compound; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-8

- Native minimum: [-486.938, -1.190, -487.635]; maximum: [489.703, 1932.000, 489.005].
- Native bottom-center: [1.383, -1.190, 0.685]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.114, -0.057], vertical 0.098. Uniform scale: 0.08276473771965799.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible tower form; chosen illustrative total height including roofs/antennae.
- Form / placement: tower; compound; suggested uses: residential, commercial, mixed-use.
- Instancing: disabled — transparent materials require per-object sorting.

### buildings-building-9

- Native minimum: [-13.942, -1.332, -15.278]; maximum: [19.060, 34.626, 7.340].
- Native bottom-center: [2.559, -1.332, -3.969]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-1.281, 1.987], vertical 0.667. Uniform scale: 0.5005845698484468.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Total height includes tall antenna; not a generic residential tower.
- Form / placement: low-rise antenna building; footprint; suggested uses: residential, commercial, mixed-use.
- Instancing: eligible.

### commercial-com-1

- Native minimum: [-24.134, -1.642, -13.997]; maximum: [24.134, 44.444, 13.997].
- Native bottom-center: [0.000, -1.642, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.641. Uniform scale: 0.3905711656026969.
- Source transforms: 0 negative determinant nodes; 9 nonuniform-scale nodes; 0 singular nodes. 9 nodes flagged unusual in the JSON ledger.
- Calibration: Visible building form; total display height chosen, not inferred from native units.
- Form / placement: column-front commercial block; footprint; suggested uses: commercial, office.
- Instancing: eligible.

### commercial-com-2

- Native minimum: [-62.736, -0.000, -68.173]; maximum: [67.722, 666.000, 62.285].
- Native bottom-center: [2.493, -0.000, -2.944]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.449, 0.530], vertical 0.000. Uniform scale: 0.18018013047176928.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible building form; total display height chosen, not inferred from native units.
- Form / placement: commercial tower; footprint; suggested uses: commercial, office.
- Instancing: disabled — transparent materials require per-object sorting.

### commercial-com-3

- Native minimum: [-111.692, -30.456, -111.780]; maximum: [111.880, 1007.740, 111.789].
- Native bottom-center: [0.094, -30.456, 0.004]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.014, -0.001], vertical 4.400. Uniform scale: 0.14448147499148375.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible building form; total display height chosen, not inferred from native units.
- Form / placement: commercial tower; footprint; suggested uses: commercial, office.
- Instancing: disabled — transparent materials require per-object sorting.

### government-gov-1

- Native minimum: [-50.787, 0.000, -36.270]; maximum: [50.787, 55.839, 40.014].
- Native bottom-center: [0.000, 0.000, 1.872]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, -0.829], vertical -0.000. Uniform scale: 0.44302763492132524.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible complex/tower envelope; no evidence of actual government use.
- Form / placement: civic complex; compound; suggested uses: government, institutional.
- Instancing: eligible.

### government-gov-2

- Native minimum: [-189.539, -0.700, -186.760]; maximum: [190.227, 805.183, 186.760].
- Native bottom-center: [0.344, -0.700, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.051, -0.000], vertical 0.104. Uniform scale: 0.14890504660175366.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Visible complex/tower envelope; no evidence of actual government use.
- Form / placement: tower; footprint; suggested uses: government, institutional.
- Instancing: disabled — transparent materials require per-object sorting.

### government-gov-3

- Native minimum: [-835213.684, 5.000, 815744.092]; maximum: [-835118.746, 67.800, 815875.029].
- Native bottom-center: [-835166.215, 5.000, 815809.561]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [350809.683, -342678.964], vertical -2.100. Uniform scale: 0.42004774208569606.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 1 nodes flagged unusual in the JSON ledger.
- Calibration: Visible complex/tower envelope; no evidence of actual government use.
- Form / placement: civic complex; compound; suggested uses: government, institutional.
- Instancing: eligible.

### parks-park-1

- Native minimum: [-0.990, -0.000, -0.990]; maximum: [1.021, 1.000, 1.021].
- Native bottom-center: [0.016, -0.000, 0.016]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.187, -0.187], vertical 0.000. Uniform scale: 11.937823716219732.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Whole supplied park footprint capped as a local amenity, including built-in trees and structures.
- Form / placement: composite park; compound; suggested uses: park, recreation.
- Instancing: disabled — transparent materials require per-object sorting.

### parks-park-2

- Native minimum: [-77.318, -2.808, -65.027]; maximum: [85.121, 27.898, 44.659].
- Native bottom-center: [3.902, -2.808, -10.184]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-1.081, 2.821], vertical 0.778. Uniform scale: 0.27702594930691166.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Whole supplied park footprint capped as a local amenity, including built-in trees and structures.
- Form / placement: composite park; compound; suggested uses: park, recreation.
- Instancing: eligible.

### parks-park-3

- Native minimum: [-28.678, -0.921, -39.788]; maximum: [28.948, 16.332, 43.013].
- Native bottom-center: [0.135, -0.921, 1.612]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.065, -0.779], vertical 0.445. Uniform scale: 0.48308769227590687.
- Source transforms: 2 negative determinant nodes; 1 nonuniform-scale nodes; 0 singular nodes. 3 nodes flagged unusual in the JSON ledger.
- Calibration: Whole supplied park footprint capped as a local amenity, including built-in trees and structures.
- Form / placement: composite park; compound; suggested uses: park, recreation.
- Instancing: disabled — negative transforms; transparent materials require per-object sorting.

### props-barn

- Native minimum: [-3.863, -0.004, -4.063]; maximum: [3.863, 7.883, 4.160].
- Native bottom-center: [0.000, -0.004, 0.049]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.000, -0.037], vertical 0.003. Uniform scale: 0.7607674621174998.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 6 m barn height; specialized storage scene, not generic Delhi housing.
- Form / placement: barn; footprint; suggested uses: storage.
- Instancing: eligible.

### props-bench

- Native minimum: [-3.325, -1.127, -1.129]; maximum: [3.325, 0.729, 1.090].
- Native bottom-center: [0.000, -1.127, -0.020]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.005], vertical 0.305. Uniform scale: 0.27068819777149106.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 1.8 m human-scale seating width; source proportions produce a 0.50 m total height.
- Form / placement: backless bench; point; suggested uses: park, public-space.
- Instancing: eligible.

### props-construction

- Native minimum: [-23.720, -0.017, 0.291]; maximum: [-0.600, 33.833, 13.361].
- Native bottom-center: [-12.160, -0.017, 6.826]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [8.622, -4.840], vertical 0.012. Uniform scale: 0.7090028768210395.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 24 m total unfinished building height.
- Form / placement: unfinished multi-storey building; footprint; suggested uses: under-construction.
- Instancing: eligible.

### props-construction_prop

- Native minimum: [-4.420, -0.000, -6.724]; maximum: [4.500, 3.831, 6.463].
- Native bottom-center: [0.040, -0.000, -0.130]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.034, 0.112], vertical 0.000. Uniform scale: 0.8613695880322845.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 3.3 m structural storey height.
- Form / placement: single-storey structural frame; footprint; suggested uses: under-construction.
- Instancing: eligible.

### props-lantern-2

- Native minimum: [-0.066, -0.000, -0.158]; maximum: [0.066, 1.100, 0.158].
- Native bottom-center: [0.000, -0.000, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.000. Uniform scale: 3.6354590033067784.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 3.5–4.5 m street-light height, with original arm proportions preserved.
- Form / placement: street light; point; suggested uses: public-space, pedestrian-access.
- Instancing: eligible.

### props-lantern-3

- Native minimum: [-0.066, -0.000, -0.066]; maximum: [0.066, 1.090, 0.066].
- Native bottom-center: [0.000, -0.000, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.000. Uniform scale: 3.20988643286896.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 3.5–4.5 m street-light height, with original arm proportions preserved.
- Form / placement: street light; point; suggested uses: public-space, pedestrian-access.
- Instancing: eligible.

### props-lantern

- Native minimum: [-0.926, -0.038, -0.300]; maximum: [0.926, 4.376, 0.300].
- Native bottom-center: [0.000, -0.038, 0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.000], vertical 0.039. Uniform scale: 1.0195419361033597.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 3.5–4.5 m street-light height, with original arm proportions preserved.
- Form / placement: street light; point; suggested uses: public-space, pedestrian-access.
- Instancing: disabled — transparent materials require per-object sorting.

### props-park_bench

- Native minimum: [-102.533, -0.465, -16.852]; maximum: [102.520, 59.649, 30.158].
- Native bottom-center: [-0.007, -0.465, 6.653]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, -0.071], vertical 0.005. Uniform scale: 0.010728925038791925.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 2.2 m seating width; source proportions yield a low 0.64 m back. Do not stretch to alter seat/back anatomy.
- Form / placement: low-back bench; point; suggested uses: park, public-space.
- Instancing: eligible.

### props-parking_lot

- Native minimum: [-17.915, -0.083, -8.606]; maximum: [18.052, 6.979, 8.606].
- Native bottom-center: [0.069, -0.083, -0.000]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.069, 0.000], vertical 0.083. Uniform scale: 1.0008978410735223.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 3 nodes flagged unusual in the JSON ledger.
- Calibration: 36 m lot width; preserves its included lights and markings.
- Form / placement: surface parking lot; compound; suggested uses: parking.
- Instancing: disabled — transparent materials require per-object sorting.

### props-toninos_parking_lots

- Native minimum: [-20.000, -20.500, -10.000]; maximum: [110.889, 4.193, 14.294].
- Native bottom-center: [45.444, -20.500, 2.147]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-22.568, -1.066], vertical 10.180. Uniform scale: 0.49660512184652644.
- Source transforms: 24 negative determinant nodes; 3 nonuniform-scale nodes; 0 singular nodes. 27 nodes flagged unusual in the JSON ledger.
- Calibration: 65 m full garage complex width; not a single parking bay.
- Form / placement: multi-level parking complex; compound; suggested uses: parking.
- Instancing: disabled — negative transforms.

### props-warehouse_building_construction_site

- Native minimum: [-848.984, -0.000, -962.063]; maximum: [848.984, 617.569, 956.792].
- Native bottom-center: [0.000, -0.000, -2.636]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.000, 0.082], vertical 0.000. Uniform scale: 0.031268640544132364.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 1 nodes flagged unusual in the JSON ledger.
- Calibration: 60 m maximum whole-site footprint; includes crane and site props.
- Form / placement: construction site with crane; compound; suggested uses: under-construction.
- Instancing: eligible.

### props-windmill

- Native minimum: [-3.948, -0.034, -2.586]; maximum: [3.976, 11.380, 2.405].
- Native bottom-center: [0.014, -0.034, -0.090]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.012, 0.079], vertical 0.029. Uniform scale: 0.876173304926913.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: 10 m thematic landmark; use only when explicitly requested.
- Form / placement: thematic windmill; point; suggested uses: thematic-landmark.
- Instancing: eligible.

### trees-tree-1

- Native minimum: [-0.704, -0.072, -0.792]; maximum: [0.571, 3.384, 0.770].
- Native bottom-center: [-0.067, -0.072, -0.011]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.116, 0.019], vertical 0.125. Uniform scale: 1.7359252346685925.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Small/medium urban tree display height; all standalone trees remain below the calibrated residential blocks.
- Form / placement: tree; point; suggested uses: landscaping.
- Instancing: eligible.

### trees-tree-2

- Native minimum: [-1.102, -0.110, -1.118]; maximum: [0.476, 2.675, 0.682].
- Native bottom-center: [-0.313, -0.110, -0.218]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [0.618, 0.431], vertical 0.217. Uniform scale: 1.97526367491145.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Small/medium urban tree display height; all standalone trees remain below the calibrated residential blocks.
- Form / placement: tree; point; suggested uses: landscaping.
- Instancing: eligible.

### trees-tree-3

- Native minimum: [-0.820, -0.054, -0.937]; maximum: [0.843, 3.069, 1.604].
- Native bottom-center: [0.012, -0.054, 0.333]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.024, -0.694], vertical 0.112. Uniform scale: 2.0814716784254363.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Small/medium urban tree display height; all standalone trees remain below the calibrated residential blocks.
- Form / placement: tree; point; suggested uses: landscaping.
- Instancing: eligible.

### trees-tree-4

- Native minimum: [-0.918, -0.042, -1.174]; maximum: [0.971, 2.438, 1.599].
- Native bottom-center: [0.027, -0.042, 0.212]; model origin: [0, 0, 0].
- Orientation: Upright Y-up confirmed in rendered preview; no axis correction. Heading/front not georeferenced.
- Metre offsets: horizontal [-0.054, -0.428], vertical 0.086. Uniform scale: 2.0156724807587536.
- Source transforms: 0 negative determinant nodes; 0 nonuniform-scale nodes; 0 singular nodes. 0 nodes flagged unusual in the JSON ledger.
- Calibration: Small/medium urban tree display height; all standalone trees remain below the calibrated residential blocks.
- Form / placement: tree; point; suggested uses: landscaping.
- Instancing: eligible.

## Validation and reproducibility

Run npm ci, npm run test:install-browser, then npm test from layer2. Playwright 1.62.1 is pinned in devDependencies and package-lock.json; it is not a production runtime dependency. The test runner starts and closes its own local HTTP server. No external server or CDN is required by the tests. Three.js remains locally vendored at 0.180.0.

Automated tests passed: exact inventory and category counts, unique IDs, all paths, original SHA-256 hashes, all GLTF loads, native mesh/triangle/material/texture diagnostics, positive finite scales, finite calibrated bounds, calibrated width/depth/height, ground contact within 0.00001 m numerical tolerance, recorded instancing eligibility, supported/rejected instancing paths, switching through all 42 assets, both comparison modes, camera controls/reset, independent parcel/building picking, caching, cell hooks and existing business-panel regressions. Browser tests produced zero page errors or failed resource requests. The existing panel test uses only an in-memory fixture; no parcel dataset is imported into the application.

Screenshots: calibration-residential.png and calibration-civic.png. Machine-readable calibrated measurements and results: asset-validation.json. Regenerate this report with npm run report after deliberately editing registry calibration metadata. Changing models requires re-auditing native diagnostics and original hashes, not blindly regenerating them.

Software-rendered Chromium validation is not a full-city GPU benchmark. Full city placement, terrain alignment, geographic CRS conversion and land-use reconciliation remain outside Stage 3.

Native preview contact sheets: native-contact-1.jpg through native-contact-3.jpg. Each model is independently framed there for form/orientation inspection; those sheets do NOT depict relative calibrated scale. Use the live comparison viewer or calibration screenshots for relative scale.
