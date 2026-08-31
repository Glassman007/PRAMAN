# Layer 2 — Unified GIS Map

Self-contained light-theme Layer 2 frontend for the SIH26013 MVP.

## Run

The screen does not need npm or a build step. It uses a generated JavaScript data bundle, so it can be opened directly in a browser. For normal project development, serving the project root with your existing frontend server is preferred.

Open:

`layer2_unified_gis/index.html`

## Attach it to Layer 1

If the Layer 1 "Unified GIS Map" control is an anchor, point it directly to:

```html
<a href="./layer2_unified_gis/index.html">Unified GIS Map</a>
```

If it is a button and you do not want to touch its component logic yet, add this before the closing `</body>` tag of the Layer 1 page:

```html
<script src="./layer2_unified_gis/layer1-integration.js"></script>
```

The helper searches for a button/link whose visible text contains `Unified GIS Map` and wires it to Layer 2.

## Data provenance

`data/data-bundle.js` was generated directly from `SIH26013_data_pack.zip` and contains:

- Revenue / Land Record
- Registration & Stamps
- Survey
- MCD / ULB
- DDA Planning
- Current parcel GeoJSON
- Conflicts
- Reconciliation recommendations
- Timeline history
- Source quality

### Important geometry rule

Only the current GeoJSON and Survey data provide explicit polygon geometry. Revenue, ULB and DDA Planning display geometries are therefore deterministic MVP derivations from the canonical polygon plus their source area/conflict metadata. The UI marks them with `*` and never presents them as source-native geometry.

`Satellite` and `Flood Extent` are context/scenario visual layers, not authoritative records from the uploaded pack.

## Implemented interactions

- Initially grey layer labels with checkboxes.
- Most recently selected layer renders on top.
- Multi-layer conflict highlighting.
- Parcel click opens a 30% left slide-over Parcel Panel.
- Overview, Sources, Conflicts, History and Documents tabs.
- Source-observation table makes stale/older Revenue observations visible.
- Boundary comparison mode overlays Canonical, Revenue and Survey simultaneously.
- Geometry overlap, area difference and centroid displacement metrics.
- Special adjacent overlap/gap metrics for the relevant parcel cases.
- 2012 / 2016 / 2020 / 2025 timeline where supplied by the dataset.


## 3D WebGL map upgrade

The map renderer is now native WebGL and does not require React, Three.js, npm, or an external CDN.

What changed:

- The same parcel/source polygon footprints are extruded into transparent building-like prisms.
- Structural prism edges are blue; source-specific roof/boundary lines retain their original layer colors so layer comparison still works.
- The parcels are visually re-laid out as a compact three-row cadastral block: a park/open-space block plus P001–P004 on the first row, P005–P012 on the second, and P013–P020 on the third. Straight road corridors occupy the gaps between parcel rows/columns.
- Re-layout uses translation only. Parcel/source polygon shapes, parcel areas, IDs and source discrepancy geometry are not resized, reshaped or rotated.
- `Space + right mouse drag` changes camera azimuth/elevation from near-top-down to near-street-level. Keyboard state is captured at the window level and pointer movement is tracked outside the canvas while dragging so the gesture remains reliable.
- `+` and `−` controls zoom the perspective camera; mouse-wheel zoom is also supported.
- `Fit all` resets the 3D camera.
- The former decorative 2D SVG map/grid/building fallback has been removed. The only base context now drawn in WebGL is the intentional cadastral layout: road corridors and the park/open-space block. Satellite/Flood content still appears only when those actual layers are selected.
- Parcel clicking in 3D calls the existing parcel-selection function, so Overview / Sources / Conflicts / History / Documents behavior is unchanged.
- Boundary Compare continues to use Canonical / Revenue / Survey source rings and is drawn above the selected 3D parcel.

`webgl-map.js` is intentionally isolated from the parcel panel/business logic. `app.js` only exposes a small state/geometry bridge and emits state-change/fit events for the renderer.

## Cleanup in this revision

- Removed the unused legacy SVG renderer, hit layer, SVG projection helpers, SVG map definitions and associated CSS.
- `app.js` now owns UI/state/panel logic only; `webgl-map.js` owns all map rendering, layout and camera interaction.
