# PRAMAN Evidence Graph integration

## Route and host integration

The module is route-scoped and does not replace the PRAMAN shell.

- route: `/evidence-graph`
- nav label: `Evidence Graph`
- source of truth: existing PRAMAN production CSVs served from `/PRAMAN_DATA` unless another dataset base URL is supplied
- first-open state: dataset summary + Search + Filters + central Play action; no graph playback starts automatically
- replay modes: locality-scale overview or focused parcel trace through the same Evidence Graph renderer/controller
- inspection drawer: opens only for a real rendered evidence node

Add `EVIDENCE_GRAPH_NAV_ITEM` to the host navigation registry and `EVIDENCE_GRAPH_ROUTE` to the existing router. Do not create a second navbar or duplicate dashboard shell.

## Continuous replay API

`createEvidenceReplayController({ dataLayer, mode, parcelId, filters })` is independent of DOM rendering. The dashboard uses one instance at a time and destroys/replaces it when the projection context changes.

Application controls use:

- `play()` / `pause()`
- `replay()`
- `setPlaybackSpeed(speed)`
- `setFilters(filters)` / `clearFilters()`
- `selectNode(nodeId)`
- `subscribe(listener)`
- `getSnapshot()`
- `destroy()`

`jumpToStage()` and `seekTimeline()` are retained only to restore persisted URL/deep-link positions. There are no Previous Stage, Next Stage, stage-marker, stepper, carousel, or timeline-scrubber controls in the user interface.

## One graph derivation path

`projection.mjs` is the single overview projection path. `individualParcelMode.mjs` produces a focused parcel trace using the same evidence model, controller, renderer, filters, and provenance conventions. Search does not open a separate visualization.

The internal lifecycle operation registry is stored in `replay/stages.mjs`. Its sequencing metadata is required for cumulative progressive reveal and restoration; it is not an abandoned stage-presentation implementation.

## Data limitations respected by the graph

The current dataset has no adapter execution/run table, pairwise classifier decision table, solver execution log, structured matching-distortion output, or direct GeoGit-event → geometry-version foreign key. The application reports those limitations where relevant and does not manufacture records to fill them.

Optional parcel paths remain optional: a clean parcel does not receive a conflict, human-review, lineage, rollback, or resurvey branch unless corresponding records exist.

## Cross-dashboard context

Existing context links support Unified Spatial View, Conflict Explorer, Source & Schema Mapping, and Parcel History & Lineage. Evidence Graph state is encoded in return/deep-link context without importing or duplicating those dashboards.

Integration events remain:

- `praman:evidence-graph:replay-requested`
- `praman:evidence-graph:parcel-selected`
- `praman:evidence-graph:replay-state`
- `praman:evidence-graph:error`
