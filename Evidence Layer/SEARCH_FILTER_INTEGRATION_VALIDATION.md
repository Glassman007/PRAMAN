# PRAMAN Evidence Graph — Search + Filter Lifecycle Integration Validation

## Scope

This pass continues from the existing dataset-driven waterfall implementation. It does not rebuild the page, alter the waterfall architecture, or modify PRAMAN_DATA.

## Search Parcel integration

Search is now backed by real identifiers from the current PRAMAN data contract:

- 1,060 canonical/historical parcel identifiers from `CANONICAL_PARCELS` + `HISTORICAL_PARCELS`
- 1,072 distinct source parcel identifiers from `SOURCE_OBSERVATIONS.source_parcel_id`
- 2,132 total searchable identifiers

A source parcel identifier resolves to a canonical/historical parcel only through recorded `RECONCILED_PARCELS.matched_source_ids` observation membership. The test suite verifies every source alias has at least one supporting source observation in the target parcel's recorded matched-source set. No source alias is mapped by name similarity or a fabricated lookup table.

Canonical and source identifiers both instantiate the same `EvidenceReplayController` in `mode: "parcel"` and the same `EvidenceGraphRenderer`. Search does not open a separate visualization. Search starts the focused lifecycle, while `REPLAY THIS PARCEL` restarts the same selected parcel and retains active filters.

## Supported filters

Only categories represented by current PRAMAN_DATA are exposed:

- Source dataset — `SOURCE_METADATA.source_id` / observation `source_type`
- Cell / spatial region — parcel `cell_id`
- Match status — `RECONCILED_PARCELS.match_status`
- Conflict type — `CONFLICTS.conflict_type`
- Conflict state — `CONFLICTS.status`
- Authority state — parsed stored `RECONCILED_PARCELS.authoritative_state.state`
- Human-review flag — `RECONCILED_PARCELS.requires_human_review`
- Current / historical — `RECONCILED_PARCELS.record_status`
- Lineage relationship — `PARCEL_LINEAGE.event_type`
- Unresolved only — `RECONCILED_PARCELS.unresolved_conflicts`

Current catalog sizes: 7 sources, 10 cells, 7 match statuses, 27 conflict types, 2 conflict states (`OPEN`, `RESOLVED`), 2 authority states (`AUTHORITATIVE`, `UNCHANGED_PENDING`), 2 review states, 2 record states, and 5 lineage relationship types. The dataset currently records 286 reconciliations with unresolved-conflict IDs.

Removed from the user-facing filter contract:

- Adapter filter — adapter execution records do not exist in PRAMAN_DATA; adapter routing remains architecture/configuration context in the graph but is not treated as a recorded filter dimension.
- Confidence band filter — the old lower/middle/upper quantile buckets were UI-created thresholds and are not a stored PRAMAN_DATA category.

Previously persisted `reconciliationStatus` URLs are read as `authorityStatus` for backward compatibility; unsupported adapter/confidence filter keys are discarded by normalization.

## Filter + playback behavior

- Filters set before Play are passed into the lifecycle controller that generates the waterfall.
- Filters changed during or after a run invalidate the structural projection cache and immediately emit a regenerated snapshot at the current lifecycle position.
- A completed graph remains completed when filters change; its rendered evidence changes immediately to the current filter state.
- Parcel + filter mode applies the same filter engine to the selected parcel graph.
- If a selected parcel does not satisfy active parcel-level filters, the graph legitimately becomes empty and the UI reports that the selected parcel is excluded rather than fabricating an alternate path.
- Replay preserves the controller's current filters.
- `REPLAY THIS PARCEL` preserves both the selected canonical parcel and active filters.
- `BACK TO RECONCILIATION OVERVIEW` is the explicit parcel-selection reset. It clears the search selection but deliberately preserves active filters.
- Clearing filters restores the same full overview node/edge projection as an unfiltered lifecycle.

## Node inspection

Existing node inspection remains in place and now appends a common `Record provenance` section where data is available. It displays only real node metadata:

- entity type
- record identifier when present
- canonical parcel when present
- source when present
- recorded status when present
- dataset provenance reference (`table · record · field`, or aggregate table + represented-record count)
- recorded confidence fields when the node actually carries them

No pairwise matching confidence is synthesized for candidate relations where the dataset does not store one.

## Acceptance coverage

`tests/search-filter-lifecycle-integration.test.mjs` explicitly validates:

1. full dataset playback
2. canonical/source parcel search
3. filter-only playback
4. parcel + filter playback
5. replay after parcel search
6. replay and regeneration after filters
7. reset to the full lifecycle
8. supported filter/data-contract and inspector-provenance constraints

## Validation results

- Full automated suite: **125 / 125 passed**
- JavaScript syntax check across `src`: **PASS**
- Performance benchmark: final overview remains **60 nodes / 146 edges**
- HTTP smoke checks: index, dashboard module, filter module, and `SOURCE_OBSERVATIONS.csv` returned **200**
- PRAMAN_DATA is checked byte-for-byte against the pre-pass dataset hash manifest before packaging.
