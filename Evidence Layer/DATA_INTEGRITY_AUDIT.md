# PRAMAN Evidence Graph — Data Integrity Audit

This audit applies to the current Evidence Graph waterfall implementation. `public/PRAMAN_DATA` is treated as the sole business-data source of truth. No PRAMAN_DATA CSV was edited during this pass.

## 1. Audited data contract

| Evidence concept | Actual source | Current count / availability |
|---|---|---:|
| Source datasets | `SOURCE_METADATA.csv` | 7 records |
| Source-specific schemas | `SOURCE_SPECIFIC_SCHEMA.csv` | 7 records |
| Source geometries | `SOURCE_GEOMETRIES.csv` | 4,312 records |
| Normalized/pre-match evidence | `MATCHING_INPUT_VIEW.csv` | 4,366 records |
| Source observations | `SOURCE_OBSERVATIONS.csv` | 4,366 records |
| Adapter executions | No execution/run table exists | unavailable; architecture routing only |
| Candidate relationships | Deterministically derived from `SOURCE_OBSERVATIONS.candidate_canonical_parcel_id` and `alternate_candidate_parcel_ids` | 4,583 relationships = 4,366 primary + 217 alternate |
| Pairwise classifier decisions / scores | No pair-decision/score table exists | unavailable |
| Parcel-level matching/reconciliation units | `RECONCILED_PARCELS.csv` | 1,060 records |
| Accepted relationship display group | deterministic grouping of recorded `match_status` values | 753 parcel outcomes |
| Ambiguous relationship display group | deterministic grouping of recorded `match_status` values | 281 parcel outcomes |
| Rejected relationship display group | recorded `REJECTED_MATCH` | 26 parcel outcomes |
| Unmatched source observations | absence of a recorded primary candidate in `SOURCE_OBSERVATIONS` | 0 observations |
| Conflicts | `CONFLICTS.csv` | 715 records: 386 resolved / 329 open |
| Conflict evidence | `CONFLICT_EVIDENCE.csv` | 1,715 records |
| Reconciliation records | `RECONCILED_PARCELS.csv` | 1,060 records |
| Unresolved cases | non-empty `unresolved_conflicts` in `RECONCILED_PARCELS` | 286 parcel rows referencing 329 unique open conflicts |
| Human-review requirement flag | `RECONCILED_PARCELS.requires_human_review` | 264 true / 796 false |
| Explicit human-review events | `GEOGIT_EVENTS.event_type = HUMAN_REVIEW` | 243 events |
| Explicit accepted decisions | `GEOGIT_EVENTS.event_type = PROPOSAL_ACCEPTED` | 731 events |
| Explicit rejected decisions | `GEOGIT_EVENTS.event_type = PROPOSAL_REJECTED` | 26 events |
| Recorded authoritative/effective state | `RECONCILED_PARCELS.authoritative_state` | 1,060 records; 817 `AUTHORITATIVE`, 243 `UNCHANGED_PENDING` |
| Active canonical parcels | `CANONICAL_PARCELS.csv` | 1,000 records |
| Historical parcels | `HISTORICAL_PARCELS.csv` | 60 records |
| Geometry versions | `GEOMETRY_VERSIONS.csv` | 1,143 records |
| Explicit split lineage rows | `PARCEL_LINEAGE.csv` (`SPLIT`, `CROSS_CELL_SPLIT`) | 28 rows |
| Explicit merge/consolidation lineage rows | `PARCEL_LINEAGE.csv` (`MERGE`, `CROSS_CELL_MERGE`, `REDEVELOPMENT_CONSOLIDATION`) | 46 rows |
| Survey evidence history | `GEOGIT_EVENTS` (`EVIDENCE_ADDED`) | 229 events |
| Geometry resurvey/correction history | `GEOMETRY_VERSIONS.change_reason` | 65 rows whose recorded reason contains `resurvey`; 18 road-widening/boundary-correction rows |
| Rollback | `GEOGIT_EVENTS.event_type = ROLLBACK` | 8 events |
| Restoration | No explicit restoration event type exists | not fabricated |
| GeoGit/version lineage | `GEOGIT_EVENTS.csv` | 5,602 events |

### Important unavailable structures

The supplied PRAMAN_DATA does **not** contain an adapter execution log, pairwise classifier probability/decision table, solver cost/objective/veto table, structured matching-distortion output, or direct GeoGit-event → geometry foreign key. The Evidence Graph now states these limitations instead of implying those records exist.

## 2. Integrity corrections made

- Candidate visualization provenance now stores real `SOURCE_OBSERVATIONS.observation_id` values as record membership. The 4,583 primary/alternate associations are retained separately as deterministic relationship IDs and are reproducible from the candidate fields.
- Removed the standalone distortion-signal node that was populated through hardcoded narrative phrase matching. Raw `notes` and `criticality_reason` remain inspectable as recorded text only.
- Renamed the former “Pair evidence / classifier inputs” presentation to **Recorded matching evidence** because no pairwise classifier input/score record exists.
- Renamed the former “Global assignment / solver output” presentation to **Recorded parcel match outcomes** because the dataset stores parcel-level outcomes but no solver execution record.
- Renamed the blanket “Policy gate” aggregate to **Governance / review decision path**. It is backed only by explicit `HUMAN_REVIEW`, `PROPOSAL_ACCEPTED`, and `PROPOSAL_REJECTED` GeoGit events.
- Added a deterministic optional authority path for reconciliation rows that contain an `authoritative_state` but have none of those three explicit governance-event types. No missing governance event is invented.
- Added a reusable provenance auditor that verifies graph node/edge record references against the actual table IDs and verifies derived candidate relationships against the exact source-observation candidate fields.

## 3. Header and graph count consistency

The landing/header statistics use `getEvidenceRunSummary()` from the same loaded data layer used by the graph. Tests now assert the following identities directly:

- source dataset counter = `SOURCE_METADATA.length`
- source observation counter = `SOURCE_OBSERVATIONS.length`
- canonical parcel counter = `CANONICAL_PARCELS.length`
- conflict counter = `CONFLICTS.length`
- normalization node count = `MATCHING_INPUT_VIEW.length`
- candidate node count = deterministic candidate relationship count from `SOURCE_OBSERVATIONS`
- conflict-category node totals = `CONFLICTS.length`
- canonical registry node count = `CANONICAL_PARCELS.length`

No separate manually entered business-data totals are maintained.

## 4. Representative manual trace audit

Each case below was selected from PRAMAN_DATA by its recorded condition. The final focused waterfall was then audited node-by-node and edge-by-edge using its dataset metadata references and deterministic relationship derivations.

| Case | Parcel | Key underlying records | Focused graph | Provenance audit |
|---|---|---|---:|---|
| Clean path | `IN-DL-110054-1-1` | observations `OBS-000001`–`OBS-000004`; no conflict row; governance `EVT-000138:PROPOSAL_ACCEPTED`; geometry `GEO-01-001-G1` | 29 nodes / 41 edges | PASS |
| Conflict + human review | `IN-DL-110054-1-4` | observations `OBS-000013`–`OBS-000017`; conflicts `CNF-00254`, `CNF-00326`; `EVT-000154:HUMAN_REVIEW`; `GEO-01-004-G1` | 33 / 54 | PASS |
| Rejected outcome | `IN-DL-110054-1-20` | observations `OBS-000081`–`OBS-000084`; conflicts `CNF-00547`, `CNF-00004`; `EVT-000240:PROPOSAL_REJECTED` | 34 / 47 | PASS |
| Split lineage | `IN-DL-110054-8-101` | `LIN-0001`, `LIN-0002` split relationships; historical geometry `HIST-IN-DL-110054-8-101`; no explicit governance event | 28 / 39 | PASS |
| Merge lineage | `IN-DL-110054-7-102` | `LIN-0011:MERGE`; historical geometry `HIST-IN-DL-110054-7-102`; no explicit governance event | 20 / 23 | PASS |
| Rollback | `IN-DL-110054-1-74` | conflict `CNF-00622`; rollback `EVT-000529`; accepted decision `EVT-000530` | 27 / 39 | PASS |
| Resurvey geometry | `IN-DL-110054-1-23` | observations `OBS-000092`–`OBS-000098`; three conflicts; `EVT-000256:HUMAN_REVIEW`; proposed resurvey geometry `GEO-01-023-G2` | 43 / 74 | PASS |
| Historical parcel | `IN-DL-110054-1-101` | observation `OBS-004271`; conflict `CNF-00648`; split lineage `LIN-0003`, `LIN-0004`; historical geometry `HIST-IN-DL-110054-1-101` | 22 / 26 | PASS |

The full overview projection also passes the same provenance audit: **60 nodes / 146 edges, 0 invalid record references**.

## 5. Optional-path behaviour

Automated checks confirm that absence is treated as absence, not as an error or a cue to invent content:

- clean parcel → no conflict node
- parcel without human review → no human-review node
- parcel without split/merge → no lineage transaction node
- no explicit restoration event → no restoration node
- no structured matching-distortion output → no distortion-output node
- no explicit governance event → recorded authority state remains reachable through a clearly marked no-explicit-event path

## 6. Validation result

- Complete automated suite: **117 / 117 tests passed**
- New data-integrity/provenance tests: **5 / 5 passed**
- Complete overview provenance audit: **PASS — 60 nodes / 146 edges / 0 invalid references**
- Representative parcel provenance audit: **PASS for all selected cases**
- PRAMAN_DATA integrity: **14 / 14 CSV files byte-for-byte unchanged from the input waterfall build**
- No new confidence, acceptance, criticality, source-authority, or source-ranking decision threshold was added.
