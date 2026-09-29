# PRAMAN Layer 4 — Spatial History Inspection

## Scope

This build extends the existing Parcel History & Lineage screen only. It does not add a map-first experience, replace Layer 2 Unified Spatial View, alter global navigation, or load all parcel geometry on history-page entry.

## Lazy geometry contract

The Layer 4 parcel-detail payload continues to contain geometry references and metadata only. WKT coordinates are deliberately excluded from every initial parcel-history JSON file.

The build generator now writes one separate lazy geometry resource per `GEOMETRY_VERSIONS` record:

`/layer4-data/geometries/{geometryId}.json`

A geometry resource is requested only after the user asks to load a geometry preview, spatial before/after comparison, or split/merge relationship geometry.

Generated resources: **1,143**.

## Current authoritative geometry

`CURRENT AUTHORITATIVE STATE` contains an `OFFICIAL GEOMETRY` block bound only to the geometry reference already validated as `AUTHORITATIVE + ACCEPTED` by the Layer 4 data contract.

The coordinates are not fetched automatically. `Load geometry preview` retrieves only that official geometry. Selecting the loaded thumbnail opens a restrained expanded SVG viewer.

## Historical geometry

Historical-state mode contains a separately labelled `HISTORICAL GEOMETRY` block. Its version and historical effective date remain visible. It never receives current/official terminology.

If no geometry is attached to that historical state, the UI shows:

`Geometry version unavailable for this historical event`

No fallback polygon is generated.

## Proposed geometry

A proposal receives a spatial block only when the proposal actually references a separate dataset-backed proposal/rejected geometry.

The block is labelled:

- `PROPOSED GEOMETRY`
- `NOT AUTHORITATIVE`

It uses a dashed non-final visual treatment and never replaces the official geometry.

## Geometry-change events

A `GEOMETRY_CHANGE` Event Inspector now exposes `View spatial change`. Only after that action are the `before` and `after` geometry resources requested.

Available views:

- Side by side: `BEFORE → AFTER`
- Overlay with an explicit Before/After legend

Area before, area after, and area difference use the dataset-provided area values. The difference is calculated only when both source areas are available.

## Split and merge

Split and merge Event Inspectors expose `View relationship geometry`.

Split semantics:

`ONE PARENT → MULTIPLE CHILDREN`

Merge semantics:

`MULTIPLE PARENTS → ONE RESULT`

Related parcel shapes are resolved from the actual Layer 4 parcel records. When a relationship event is historical, the resolver selects a geometry that was effective on or before the event date when one exists. It does not silently substitute a newer current geometry.

## Renderer

The supplied Layer 4 project did not contain an existing client-side parcel-geometry renderer to reuse. The older service contains WKT values but no reusable visual component. This build therefore adds a dependency-free SVG renderer for the dataset's `POLYGON` WKT geometry, keeping Layer 4 independent of map/Three.js infrastructure.

## Files changed / added

Changed existing files:

- `src/api.js`
- `src/ParcelTimeline.jsx`
- `scripts/build-layer4-index.cjs`

Added:

- `src/SpatialHistory.jsx`
- `src/spatialHistory.css`
- `src/spatialGeometry.js`
- `layer4.spatialHistory.test.mjs`
- `public/layer4-data/geometries/*.json`

All other pre-existing project files remain unchanged from the Event Inspector build.
