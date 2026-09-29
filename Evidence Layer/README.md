# PRAMAN Evidence Graph — Continuous Waterfall

This package provides the current dataset-driven PRAMAN Evidence Graph. It uses the existing `PRAMAN_DATA` CSVs and does not maintain a second static copy of business data.

## Current interaction model

The Evidence Graph is one continuous, accumulative waterfall. The initial screen shows dataset-derived summary values, Search Parcel, Filters, and one primary **PLAY FULL RECONCILIATION LIFECYCLE** action. Playback progressively reveals evidence downward; already-rendered evidence remains visible. There is no user-facing slideshow, stage stepper, Previous/Next Stage control, stage card carousel, or manually advanced phase screen.

The logical processing operations remain internally sequenced because progressive reveal, URL restoration, and graph ordering require stable operation boundaries:

Sources → Adapters → Normalization → Matching → Conflict Detection → Reconciliation → Authority / Review → Canonical State → History / Lineage

`src/evidence-graph/replay/stages.mjs` is the internal operation registry used by that single continuous controller. It is not a parallel stage/slideshow implementation.

## Current architecture

- `src/evidence-graph/data/` — CSV parsing and the PRAMAN data layer.
- `src/evidence-graph/replay/projection.mjs` — the single locality/parcel graph derivation path.
- `src/evidence-graph/replay/ReplayController.mjs` — the single continuous playback controller.
- `src/evidence-graph/replay/individualParcelMode.mjs` — focused parcel projection through the same graph model.
- `src/evidence-graph/replay/explorationFilters.mjs` — dataset-supported graph filters.
- `src/evidence-graph/replay/provenanceAudit.mjs` — node/edge provenance validation.
- `src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs` — continuous waterfall layout and rendering.
- `src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs` — Search, Filters, playback controls, inspection, and integration.
- `src/evidence-graph/integration/` — route, navigation, and cross-dashboard context links.

## Playback controller

`createEvidenceReplayController({ dataLayer, mode, parcelId, filters })` exposes one continuous state machine with `idle`, `running`, `paused`, and `completed` states.

Current public methods used by the application are:

- `play()`
- `pause()`
- `replay()`
- `setPlaybackSpeed(speed)`
- `setFilters(filters)` / `clearFilters()`
- `selectNode(nodeId)`
- `subscribe(listener)`
- `getSnapshot()`
- `destroy()`

`jumpToStage()` and `seekTimeline()` remain internal restoration helpers because URL/deep-link state can restore an in-progress lifecycle position. They are not exposed as manual lifecycle navigation controls.

## Dataset integrity

Graph evidence is created only from current PRAMAN records, project-defined adapter routing over real source observations, or deterministic relationships derived directly from recorded fields. The graph does not fabricate adapter execution logs, pairwise classifier probabilities, solver internals, structured distortion results, conflicts, human review, split/merge history, rollback events, or other optional branches when the dataset does not contain them.

Search accepts real canonical/historical parcel identifiers and real source parcel identifiers that can be resolved through recorded observation membership. Filters are restricted to dataset-supported dimensions and are applied to the same projection used by playback and replay.

## Validation

The latest end-to-end audit is documented in `FINAL_FULL_AUDIT.md`. Data provenance is documented in `DATA_INTEGRITY_AUDIT.md`, and search/filter integration is documented in `SEARCH_FILTER_INTEGRATION_VALIDATION.md`.
