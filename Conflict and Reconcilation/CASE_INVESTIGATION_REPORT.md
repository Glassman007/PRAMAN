# Prompt 4 — Conflict Case Investigation Workspace

## What changed

The parcel-case detail screen is now an investigation workspace rather than a stack of generic conflict cards.

### Case and conflict selection

The header is built from the current `ParcelConflictCase`: parcel lifecycle state, locality when present, associated/open/resolved conflict counts, human-review requirement, and the severity/criticality values represented in the case.

Every constituent `conflict_id` remains independent. The left-side selector shows each conflict's dataset type, status, severity, criticality, affected attribute/geometry, and source pair. Selecting one changes the investigation context without opening reconciliation.

### Evidence joins

For a selected conflict the runtime derives:

`CONFLICTS.conflict_id`
→ `CONFLICT_EVIDENCE.conflict_id`
→ `SOURCE_OBSERVATIONS.observation_id` when present
→ `SOURCE_GEOMETRIES.geometry_id` when present
→ `SOURCE_METADATA.source_type` when present.

Evidence originating from canonical state, lineage, reconciliation state, GeoGit, or other non-observation sources is retained even when no `SOURCE_OBSERVATIONS` row exists. Missing joins are not replaced with synthetic fields.

### Source comparison and provenance

Source cards are generated from the source types participating in the selected conflict and its evidence. There is no fixed three-column source model.

The provenance expansion exposes available source authority, acquisition date, metadata CRS, nominal accuracy, metadata reliability, observation IDs, source record IDs, observation dates, confidence fields, record status, and actual source geometry CRS values.

### Spatial evidence

`GeometryEvidenceMap.jsx` draws only parsed dataset geometry. It overlays source A, source B, additional evidence geometry, and the current authoritative/historical parcel geometry when available. The SVG viewport is computed from the combined coordinate bounds and the legend is generated from the geometries actually being displayed.

Spatial conflicts receive the prominent map treatment. When a non-spatial conflict still carries observation geometry, the same real geometry is shown as a more compact spatial-context panel instead of presenting it as the disputed fact.

### History shortcut

A compact expandable section exposes supporting `GEOGIT_EVENTS`, `PARCEL_LINEAGE`, `HISTORICAL_PARCELS`, and geometry versions for the current parcel case. It does not attempt to replace the separate Parcel History/Lineage dashboard.

### Reconciliation handoff

The primary `Open Reconciliation` action is located at the end of the investigation. It is enabled only when the parcel case has at least one open conflict.

The route carries:

- parcel ID;
- selected conflict ID;
- open conflict IDs;
- a parcel-conflict-case context marker.

`ReconciliationEntry.jsx` reconstructs the parcel case and selected conflict from the shared dataset model after navigation or refresh, rather than relying on an in-memory React object.
