# PRAMAN Layer 4 — Parcel History & Lineage Data Audit

Scope: audit the uploaded project archive and the new `PRAMAN_DATA` dataset before any Layer 4 dashboard work. This change set adds only a data/model adapter and tests. No existing route, UI, navigation, Layer 2, Conflict Explorer, Reconciliation, or Evidence Graph file is modified.

## 1. Existing project files/modules relevant to Layer 4

### Existing code
- `dataset.repository.js` — old shared-dataset loader. It expects a **different flat dataset** with files named like `01_revenue_land_records_*.csv`, `06_parcels_*.geojson`, `09_timeline_history_*.csv`, etc.
- `parcelTimeline.service.js` — builds the old parcel timeline and heuristically classifies events from text/field differences. Lineage is limited to a `merge_group` property on the old GeoJSON.
- `parcelTimeline.routes.js` — exposes `/api/timeline/parcels` and `/api/parcels/:parcelId/timeline`.
- `server.js` — mounts those routes and a `/timeline` frontend.
- `src/ParcelTimeline.jsx`, `src/App.jsx`, `src/api.js`, `src/parcelTimeline.css` — existing timeline UI.

### Important compatibility findings
1. The old loader is incompatible with the uploaded new dataset. The new dataset is nested under `PRAMAN_DATA/...` and contains no old flat `01_*`, `06_parcels_*.geojson`, or `09_timeline_history_*` files.
2. The old lineage logic is incompatible with the new model. It uses `merge_group`; the new dataset has an explicit `PARCEL_LINEAGE.csv` many-to-many edge table covering split, merge, cross-cell split/merge, and redevelopment consolidation.
3. The old timeline classifies events heuristically (for example, text matching for geometry/merge/risk). Layer 4 now needs explicit semantic mapping from source tables and event types.
4. As uploaded, `package.json` declares `"type": "module"` while `server.js`, `dataset.repository.js`, routes, and services use CommonJS `require(...)`. Running `node server.js` therefore fails before routing starts. Also, `express`/`cors` are not listed in this uploaded `package.json`, and the server's frontend path (`../frontend/dist`) does not match the flattened archive layout. These pre-existing packaging/runtime issues were **not changed** in this prompt.

## 2. New dataset tables and actual fields available

### `7 Authoritative_state/CANONICAL_PARCELS.csv` — 1,000 rows
`canonical_parcel_id`, `cell_id`, `parcel_number`, `locality`, `parcel_status`, `land_use`, `property_type`, `ownership_category`, `owner_entity`, `tenure_type`, `area_sqm`, `built_up_area_sqm`, `building_count`, `floor_count`, `society_name`, `government_agency`, `current_geometry_id`, `authoritative_version`, `latitude_centroid`, `longitude_centroid`, `special_condition`, `municipal_ward`, `canonical_state_version`, `authoritative_geometry_version`

All 1,000 rows are `parcel_status=ACTIVE`. `current_geometry_id` is the explicit current canonical geometry foreign key. `canonical_state_version` is the canonical parcel-state version; `authoritative_geometry_version` is separately the geometry version label.

### `7 Authoritative_state/GEOMETRY_VERSIONS.csv` — 1,143 rows
`geometry_id`, `canonical_parcel_id`, `version_label`, `effective_date`, `geometry_status`, `source_type`, `area_sqm`, `change_reason`, `accepted_status`, `supersedes_geometry_id`, `geometry_wkt`, `crs`

Observed lifecycle states:
- `AUTHORITATIVE`: 1,000
- `SUPERSEDED`: 61
- `HISTORICAL`: 60
- `PROPOSED`: 20
- `REJECTED`: 2

Observed acceptance states:
- `ACCEPTED`: 1,060
- `SUPERSEDED`: 61
- `PENDING_HUMAN_APPROVAL`: 20
- `REJECTED`: 2

### `8 History/HISTORICAL_PARCELS.csv` — 60 rows
`canonical_parcel_id`, `cell_id`, `parcel_number`, `record_status`, `lineage_status`, `former_owner`, `retired_date`, `retirement_reason`, `historical_geometry_id`

All are `record_status=HISTORICAL_RETIRED`. Lineage outcomes are `RETIRED_SPLIT`, `RETIRED_MERGED`, or `RETIRED_REDEVELOPMENT`.

### `8 History/PARCEL_LINEAGE.csv` — 74 rows
`lineage_event_id`, `event_type`, `parent_parcel_id`, `child_parcel_id`, `effective_date`, `reason`, `source`, `accepted_status`

Actual relationship types:
- `SPLIT`: 24 edges
- `CROSS_CELL_SPLIT`: 4 edges
- `MERGE`: 20 edges
- `CROSS_CELL_MERGE`: 4 edges
- `REDEVELOPMENT_CONSOLIDATION`: 22 edges

All 74 lineage edges are explicitly `ACCEPTED`.

### `8 History/GEOGIT_EVENTS.csv` — 5,602 rows
`event_id`, `parcel_id`, `timestamp`, `event_type`, `previous_version`, `resulting_version`, `source`, `actor_type`, `reason`, `related_parcel_ids`

Actual event types include `PARCEL_CREATED`, `SOURCE_IMPORTED`, `MATCH_PROPOSED`, `CONFLICT_DETECTED`, `EVIDENCE_ADDED`, `HUMAN_REVIEW`, `PROPOSAL_ACCEPTED`, `PROPOSAL_REJECTED`, `CANONICAL_STATE_UPDATED`, `SPLIT`, `MERGE`, `MUTATION_RECORDED`, and `ROLLBACK`.

This is the chronological/version audit trail. It carries parcel-version references such as `V1`, `P1`, `P2`, `V2`, `V2_BAD`, and `RETIRED`.

### `6 Reconciliation/RECONCILED_PARCELS.csv` — 1,060 rows
`canonical_parcel_id`, `record_status`, `lineage_status`, `parent_parcel_ids`, `child_parcel_ids`, `match_status`, `criticality_level`, `criticality_reason`, `source_count`, `matched_source_ids`, `overall_match_confidence`, `geometry_confidence`, `ownership_confidence`, `land_use_confidence`, `lineage_confidence`, `reconciliation_confidence`, `proposed_state`, `authoritative_state`, `requires_human_review`, `unresolved_conflicts`, `reconciliation_timestamp`, `benchmark_case_ids`

The table includes 1,000 active and 60 retired historical parcel records. `proposed_state` and `authoritative_state` are JSON. The authoritative JSON marker is either `AUTHORITATIVE` or `UNCHANGED_PENDING` in this dataset.

### `5 Conflicts/CONFLICTS.csv` — 715 rows
`conflict_id`, `canonical_parcel_id`, `conflict_type`, `source_a`, `source_b`, `attribute_or_geometry`, `source_a_value`, `source_b_value`, `severity`, `criticality`, `explanation`, `status`, `recommended_next_evidence`, `human_review_required`, `benchmark_case_ids`, `source_a_observation_id`, `source_b_observation_id`

### `5 Conflicts/CONFLICT_EVIDENCE.csv` — 1,715 rows
`conflict_evidence_id`, `conflict_id`, `observation_id`, `evidence_role`, `source_type`, `attribute_name`, `observed_value`, `geometry_id`, `temporal_role`, `supports_or_contradicts`, `notes`, `evidence_type`, `evidence_id`, `source_table`

### `4 Matching/SOURCE_OBSERVATIONS.csv` — 4,366 rows
`observation_id`, `source_type`, `source_record_id`, `candidate_canonical_parcel_id`, `alternate_candidate_parcel_ids`, `source_parcel_id`, `owner_name`, `address`, `land_use`, `geometry_id`, `observed_area`, `observation_date`, `source_reliability`, `geometry_confidence`, `attribute_confidence`, `temporal_freshness`, `identifier_confidence`, `positional_accuracy_m`, `record_status`, `source_specific_details`, `lineage_reference`, `notes`

This is where source parcel IDs, source record IDs, observation dates, source owner/land-use claims, source geometry IDs, and source-side lineage references are available.

### `1 Source_inputs/SOURCE_METADATA.csv` — 7 rows
`source_id`, `source_name`, `source_type`, `authority`, `acquisition_date`, `nominal_accuracy`, `temporal_currency`, `reliability`, `CRS`, `update_frequency`

## 3. Requested information: where it actually exists

| Requested concept | Actual source |
|---|---|
| Canonical parcel ID | `CANONICAL_PARCELS.canonical_parcel_id`; same ID field/fk appears in reconciliation, geometry, conflicts; `GEOGIT_EVENTS.parcel_id` |
| Source parcel IDs | `SOURCE_OBSERVATIONS.source_parcel_id` |
| Source record IDs | `SOURCE_OBSERVATIONS.source_record_id` |
| Historical parcel IDs | `HISTORICAL_PARCELS.canonical_parcel_id`; lineage parent/child IDs |
| Active/inactive/retired parcel | `CANONICAL_PARCELS.parcel_status=ACTIVE`; `HISTORICAL_PARCELS.record_status=HISTORICAL_RETIRED` |
| Superseded geometry | `GEOMETRY_VERSIONS.geometry_status=SUPERSEDED`, `accepted_status=SUPERSEDED` |
| Geometry versions | `GEOMETRY_VERSIONS.geometry_id`, `version_label`, `supersedes_geometry_id` |
| Parcel versions | `GEOGIT_EVENTS.previous_version`, `resulting_version`; current `CANONICAL_PARCELS.canonical_state_version` |
| Timestamps | GeoGit `timestamp`; geometry/lineage `effective_date`; source `observation_date`; reconciliation `reconciliation_timestamp`; historical `retired_date` |
| Survey observations | `SOURCE_OBSERVATIONS.source_type=GNSS_CORS_SURVEY`; GeoGit `EVIDENCE_ADDED` is a later audit action, not the survey observation itself |
| Geometry changes | `GEOMETRY_VERSIONS`; GeoGit/version trail can provide surrounding parcel-version audit |
| Mutation/record changes | GeoGit `MUTATION_RECORDED`, `ROLLBACK`; lineage source is `MUTATION_REGISTER_SYNTH` |
| Official approvals/decisions | GeoGit `PROPOSAL_ACCEPTED`, `PROPOSAL_REJECTED`, authority actor/source; geometry/lineage explicit acceptance fields |
| Conflicts | `CONFLICTS` + `CONFLICT_EVIDENCE`; GeoGit has aggregate `CONFLICT_DETECTED` for active cases |
| Split/merge | `PARCEL_LINEAGE` is the relationship source of truth; GeoGit records matching parent-side lifecycle audit events |
| Administrative metadata | GeoGit `PARCEL_CREATED`, `SOURCE_IMPORTED`, `MATCH_PROPOSED`, `HUMAN_REVIEW`, `CANONICAL_STATE_UPDATED`, `EVIDENCE_ADDED` |
| Proposed/reconciled state | `RECONCILED_PARCELS.proposed_state`, `match_status`, confidence fields |
| Current accepted state | `CANONICAL_PARCELS` + its `current_geometry_id`; reconciliation `authoritative_state` is supporting policy/reconciliation context |
| Reviewer/policy decisions | GeoGit `HUMAN_REVIEW`, `PROPOSAL_ACCEPTED`, `PROPOSAL_REJECTED`, `actor_type`, `source`, `reason` |
| GeoGit/version references | `GEOGIT_EVENTS.event_id`, `previous_version`, `resulting_version` |
| Owner/recorded holder | Current: `CANONICAL_PARCELS.owner_entity`; historical: `HISTORICAL_PARCELS.former_owner`; source claim: `SOURCE_OBSERVATIONS.owner_name` |
| Land use | Current canonical and source observations; reconciliation proposal JSON |
| Parcel area | Current canonical `area_sqm`; geometry-version `area_sqm`; source `observed_area` |
| Cell/locality | Current canonical has both; historical has `cell_id` only |
| Geometry status | Explicit in `GEOMETRY_VERSIONS.geometry_status` and `accepted_status` |
| Survey status | **No dedicated canonical `survey_status` field exists** |

## 4. Missing or non-reconstructable information

The adapter must leave these values null/absent instead of inventing them:

1. **Full historical parcel attribute snapshots for active parcels do not exist.** GeoGit tells us version transitions (`V1 -> P1 -> V2`, etc.) but does not store owner/land-use/area snapshots for every state version. A superseded geometry can be shown historically, but prior owner/land-use values cannot be reconstructed as authoritative facts from this dataset.
2. **Historical retired parcels do not contain authoritative land use, locality, tenure, or property type.** They contain former owner, cell, retirement date/reason, lineage status, and historical geometry. Source observations may contain claims, but those are provenance, not authoritative historical attributes.
3. **No actual GeoGit commit hash/branch/tag field exists.** `GEOGIT_EVENTS.event_id` is an audit event ID, not documented as a commit hash. Therefore normalized `related_commit_id` remains null; the adapter exposes the actual GeoGit event ID separately.
4. **No reviewer name/user ID or policy rule ID exists.** Only `actor_type`, `source`, event type, timestamp, and reason are available.
5. **Conflict rows have no timestamp.** Active parcel conflicts can be associated with the parcel-level `CONFLICT_DETECTED` audit event, but historical conflict rows have no explicit event time and must remain undated.
6. **Geometry rows have no independent event ID.** Their `geometry_id` is retained as the source record identifier; normalized `event_id` is null for those rows.
7. **No single source parcel ID exists per canonical parcel.** There may be multiple source observations/source IDs; preserve them as provenance records.
8. **No canonical survey-status field exists.** Presence of a GNSS observation or a GNSS-derived geometry is evidence, not a substitute field to fabricate.

## 5. State-separation rules implemented

### A. Current authoritative state
Primary source: `CANONICAL_PARCELS` only for active canonical parcels.

The adapter resolves `current_geometry_id` and requires that row to be explicitly:
- `geometry_status=AUTHORITATIVE`
- `accepted_status=ACCEPTED`

A proposed/rejected/superseded geometry can never become the current geometry by recency alone.

### B. Historical state
Two forms are preserved:
- retired historical parcel snapshots from `HISTORICAL_PARCELS` + `historical_geometry_id`;
- superseded geometry-only states for active parcels from `GEOMETRY_VERSIONS`.

Superseded geometry states are explicitly marked `stateScope=GEOMETRY_ONLY`; missing historical owner/land-use attributes remain null rather than copying today's canonical values backward in time.

### C. Proposed state
`states.proposed` is populated only when reconciliation explicitly preserves the prior authority as `authoritative_state.state=UNCHANGED_PENDING`.

Accepted and rejected old proposals are retained in the separate `reconciliation` record, but are not exposed as a currently proposed state.

### D. Parcel-state authority and geometry authority are independent
The dataset contains cases such as `IN-DL-110054-1-26` where G2 geometry is already `AUTHORITATIVE/ACCEPTED`, while the broader reconciliation state is still `UNCHANGED_PENDING` because conflicts remain open. The adapter therefore never collapses these into one approval flag.

## 6. Event normalization design

The normalized UI event classes are exactly:

- `SURVEY_OBSERVATION`
- `GEOMETRY_CHANGE`
- `OFFICIAL_APPROVAL`
- `MUTATION`
- `SPLIT`
- `MERGE`
- `CONFLICT`
- `ADMINISTRATIVE_METADATA`

Mappings:

| Dataset event/source | Normalized class | Preserved subtype |
|---|---|---|
| `SOURCE_OBSERVATIONS.source_type=GNSS_CORS_SURVEY` | `SURVEY_OBSERVATION` | `GNSS_CORS_SURVEY` |
| `GEOMETRY_VERSIONS` row | `GEOMETRY_CHANGE` | geometry `source_type` |
| GeoGit `PROPOSAL_ACCEPTED`, `PROPOSAL_REJECTED` | `OFFICIAL_APPROVAL` | original GeoGit event type |
| GeoGit `MUTATION_RECORDED`, `ROLLBACK` | `MUTATION` | original event type |
| lineage `SPLIT`, `CROSS_CELL_SPLIT` | `SPLIT` | exact lineage event type |
| lineage `MERGE`, `CROSS_CELL_MERGE`, `REDEVELOPMENT_CONSOLIDATION` | `MERGE` | exact lineage event type |
| GeoGit `CONFLICT_DETECTED` / undated conflict fallback | `CONFLICT` | GeoGit event or exact conflict type |
| all remaining GeoGit lifecycle/audit events | `ADMINISTRATIVE_METADATA` | exact GeoGit event type |

Each normalized event exposes the requested fields when present and null when absent:
`event_id`, `parcel_id`, `event_type`, `event_subtype`, `effective_date`, `recorded_date`, `source`, `source_record_id`, `geometry_version_before`, `geometry_version_after`, `parcel_version_before`, `parcel_version_after`, `authority_status`, `review_status`, `related_conflict_id`, `related_commit_id`, `related_parent_parcels`, `related_child_parcels`, `description`.

Additional adapter-only keys such as `adapter_event_key`, `source_table`, `related_geogit_event_id`, and plural `related_conflict_ids` are explicitly labeled adapter metadata and do not pretend to be dataset fields.

## 7. Lineage relationship design

`PARCEL_LINEAGE` is the single relationship source of truth.

For a queried parcel, the adapter returns:
- `parents`: unique direct parent parcel IDs where the parcel is the child;
- `children`: unique direct child parcel IDs where the parcel is the parent;
- `incomingEdges`: exact accepted lineage rows contributing to the parcel;
- `outgoingEdges`: exact accepted lineage rows resulting from the parcel;
- `edges`: union of both.

No separate lineage database/model is created for the UI.

Semantic mapping keeps detailed lineage subtypes:
- `SPLIT` and `CROSS_CELL_SPLIT` -> UI class `SPLIT`
- `MERGE`, `CROSS_CELL_MERGE`, and `REDEVELOPMENT_CONSOLIDATION` -> UI class `MERGE`

GeoGit split/merge entries are used only to enrich chronology/version references where an exact parent/date/child match exists. The normalized event stream prefers the explicit lineage row so the same relationship is not shown twice.

## Implemented adapter files

- `layer4.historyLineage.adapter.cjs` — read-only adapter over the new dataset. No dataset rewrite.
- `layer4.historyLineage.adapter.test.cjs` — semantic regression tests for authority separation, pending/rejected geometry, historical parcels, split/merge lineage, source IDs, and event classes.

The adapter accepts `{ datasetRoot }` or `PRAMAN_DATASET_DIR`. It does not register routes or touch the UI in this prompt.

## Scope limitation from the uploaded code archive

The uploaded `layer5` archive contains the timeline frontend/backend files listed above, but it does **not** contain Layer 2, Conflict Explorer, Reconciliation UI, Evidence Graph UI, or a global-navigation module. Therefore those modules could not be internally audited from this archive. They were also not touched: the original archive files remain byte-for-byte unchanged.

## Adapter usage for later integration

```js
const { Layer4HistoryLineageAdapter } = require('./layer4.historyLineage.adapter.cjs');

const adapter = new Layer4HistoryLineageAdapter({
  datasetRoot: '/path/to/PRAMAN_DATA'
});

const model = adapter.getParcelModel('IN-DL-110054-1-23');
```

The returned model contains one shared source for both future views:

- `states.currentAuthoritative`
- `states.historical`
- `states.proposed`
- `reconciliation`
- `events`
- `lineage`
- `versionReferences`
- `conflicts`
- `sourceProvenance`

Parcel History and Parcel Lineage should consume this same model rather than creating independent datasets.
