# PRAMAN Layer 4 — Cross-Dashboard Integration

## Scope

This change connects the existing **Parcel History & Lineage** Layer 4 implementation to neighboring PRAMAN dashboards without merging their responsibilities into Layer 4.

Layer 4 still owns only:

- parcel history events and versions
- historical state inspection
- current authoritative state inspection
- proposal visibility
- parcel ancestry / identity transitions through the Lineage sub-view
- focused historical geometry inspection

It does **not** embed Conflict Explorer, Evidence Graph, Unified Spatial View, or a GeoGit dashboard.

## Routing contract

The standalone Layer 4 project already uses URL query state rather than introducing a second router. That convention remains intact:

- `?parcel=<canonical-or-historical-id>` selects a parcel
- `?view=lineage` opens the Parcel Lineage sub-view
- `?event=<normalized-event-key>` preserves the selected Parcel History event
- directory filters such as `q`, `status`, `landUse`, `cell`, `historyType`, and `historical` remain in the URL

No independent top-level `Parcel Lineage` route or navigation entry was created.

### Neighboring PRAMAN routes

All outbound dashboard routes are centralized in `src/layer4DeepLinks.js` and remain configurable:

- `VITE_CONFLICT_EXPLORER_PATH` → default `/conflict-explorer`
- `VITE_EVIDENCE_GRAPH_PATH` → default `/evidence-graph`
- `VITE_UNIFIED_SPATIAL_VIEW_PATH` → default `/unified-spatial-view`

Every outbound link includes a `returnTo` parameter containing the exact Layer 4 path, filters, selected parcel, selected event, current sub-view, and hash where present.

## Conflict Explorer

Layer 4 only links outward.

Conflict Event Inspector records can open their real conflict case. The current authoritative state can also open Conflict Explorer when the canonical record has dataset-backed open conflict IDs.

Layer 4 does not reproduce conflict resolution controls or conflict analytics.

## Evidence Graph

Layer 4 now exposes restrained **VIEW SUPPORTING EVIDENCE** actions from:

- Event Inspector
- conflict event context
- Current Authoritative State
- Historical State
- Proposed Change
- Parcel Lineage node inspector

Evidence links pass only relevant context such as parcel ID, event/source record, state type, geometry/version, reconciliation status, conflict ID, or explicit lineage event IDs.

Layer 4 does not embed Evidence Graph components or render evidence networks.

## Unified Spatial View

Focused Layer 4 geometry remains available for historical inspection. Expanded geometry and geometry-change / split / merge spatial inspections can link outward through **OPEN IN UNIFIED SPATIAL VIEW**.

The link passes parcel, geometry, event and state context when available. Layer 4 still uses only its small lazy SVG polygon renderer; it does not import a city-scale map engine.

## GeoGit

GeoGit remains version/change provenance only.

GeoGit event/commit identifiers and transaction IDs remain exclusively inside the existing **Technical Provenance** disclosure in Event Inspector. No GeoGit dashboard section or top-level navigation entry was added.

## Navigation-state preservation

The selected history event is now URL-backed through `?event=`. This makes it recoverable after returning from another PRAMAN dashboard.

Rules:

- opening a timeline event writes `event` without changing current authoritative state
- closing the Event Inspector clears `event`
- opening Parcel Lineage preserves `event`, so returning to Parcel History reopens the selected event
- an outbound Conflict/Evidence/Spatial link preserves the complete Layer 4 URL through `returnTo`
- switching to a different parcel deliberately clears the previous parcel's selected event
- returning to the parcel directory clears parcel/view/event but preserves the directory search and filters

## Files changed

Existing source files changed:

- `src/App.jsx`
- `src/ParcelTimeline.jsx`
- `src/ParcelLineage.jsx`
- `src/SpatialHistory.jsx`
- `src/layer4DeepLinks.js`
- `src/parcelTimeline.css`
- `src/parcelLineage.css`
- `src/spatialHistory.css`
- `layer4.eventInspector.test.mjs` (updated stale source-level assertions to the centralized route helper and new evidence label)

Added:

- `src/layer4NavigationState.js`
- `layer4.pramanIntegration.test.mjs`

Dataset adapters, generated parcel records, backend timeline service/routes, global navigation behavior, and Layer 4 data semantics were not changed.

## Validation

The integration test verifies:

- Conflict Explorer, Evidence Graph and Unified Spatial View are links rather than imported/embedded dashboards
- return navigation preserves parcel directory filters, selected parcel and selected history event
- `Parcel Lineage` remains `view=lineage` under Layer 4 rather than a duplicate top-level route
- changing parcel clears stale event state
- GeoGit labels remain inside `Technical Provenance`
- the focused spatial renderer does not import Three.js, Mapbox, MapLibre or Leaflet

All previous Layer 4 adapter, landing, history, state-separation, Event Inspector, spatial-history and lineage tests also pass.

A Vite production bundle could not be executed in this container because npm dependency installation timed out. No partial `node_modules`, `package-lock.json`, or stale `dist` output is included in the package.
