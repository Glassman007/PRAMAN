# PRAMAN Evidence Graph — Final End-to-End Validation

**Validation target:** `PRAMAN_Evidence_Graph_UIUX_Cleaned.zip`  
**Dataset basis:** current `dataset (1)(2).zip` / `PRAMAN_DATA` production tables  
**Validation mode:** independent count reconstruction + Evidence Graph model comparison + representative parcel trace audit + anti-fake-data source audit + regression tests  
**Overall result:** **PASS**

## 1. Executive result

The Evidence Graph genuinely reflects the current PRAMAN production dataset. The production CSV copies shipped inside the final Evidence Graph package are byte-for-byte identical to the corresponding source dataset files for all 14 production tables consumed by the Evidence Graph.

The full automated regression suite passes **105 / 105** tests with **0 failures**. The evidence data layer reports **0 ERROR diagnostics**.

No production Evidence Graph code contains hardcoded PRAMAN parcel IDs, source IDs, observation IDs, conflict IDs, current dataset totals, randomly generated confidence, mock/demo production datasets, or evaluation-only ground-truth dependencies.

## 2. Global validation

Counts below were independently recalculated from the source CSVs first and then compared with the Evidence Graph models/rendered summary semantics.

| Metric | Independent dataset calculation | Evidence Graph value / interpretation | Result |
|---|---:|---:|---|
| Source dataset count | **7** `SOURCE_METADATA` rows | Stage 1 source clusters: **7** | **PASS** |
| Source observation count | **4,366** `SOURCE_OBSERVATIONS` rows | Final summary: **4,366** | **PASS** |
| Active canonical parcel count | **1,000** `CANONICAL_PARCELS` rows | Final summary: **1,000** | **PASS** |
| Historical / retired parcel count | **60** `HISTORICAL_PARCELS` rows | Final summary: **60** | **PASS** |
| Candidate-match association count | **4,583** = 4,366 primary + 217 alternate recorded candidate associations | Stage 4 matching model: **4,583** | **PASS** |
| Accepted-match count | **753** = `AUTO_MATCHED` + `MATCHED_WITH_MINOR_CONFLICT` + `RECONCILED` | Final/Stage 4 model: **753** | **PASS** |
| Ambiguous count | **281** = `HUMAN_REVIEW_REQUIRED` + `TENTATIVE` + `NEEDS_ADDITIONAL_EVIDENCE` | Final/Stage 4 model: **281** | **PASS** |
| Rejected-match count | **26** `REJECTED_MATCH` rows | Stage 4/final model: **26** | **PASS** |
| Unmatched observation count | **0** observations without a primary candidate | Final/Stage 4 model: **0** | **PASS** |
| Conflict count | **715** `CONFLICTS` rows | Final summary: **715** | **PASS** |
| Reconciliation record count | **1,060** `RECONCILED_PARCELS` rows | Data layer/model contains **1,060** reconciliation records | **PASS** |
| `RECONCILED` match-status cases | **56** rows whose `match_status` is exactly `RECONCILED` | Final UI label **“Reconciled cases” = 56** | **PASS** |
| Unresolved parcel count | **286** rows with non-empty `unresolved_conflicts` | Final summary: **286** | **PASS** |
| Human-review case count | **264** rows with `requires_human_review=true` | Final summary: **264** | **PASS** |
| Explicit `HUMAN_REVIEW` event count | **243** GeoGit events | Authority model: **243** | **PASS** |
| Split transaction count | **14** reconstructed split transactions from **28** split/cross-cell-split lineage rows | History/lineage transaction model reconstructs the same grouping | **PASS** |
| Merge transaction count | **22** reconstructed merge/consolidation transactions from **46** merge-like lineage rows | History/lineage transaction model reconstructs the same grouping | **PASS** |

### Reconciliation-count clarification

`RECONCILED_PARCELS.csv` contains **1,060 reconciliation records**. The terminal Evidence Graph summary intentionally displays **“Reconciled cases: 56”**, which is the narrower subset where `match_status == RECONCILED`. These are different measures and the label matches the implementation. No dataset discrepancy was found.

### Split/merge-count clarification

PRAMAN stores lineage as one parent-child relation per `PARCEL_LINEAGE` row. Therefore raw row counts (**28 split relations, 46 merge-like relations**) are not transaction counts. Evidence Graph groups rows using the recorded operation type, anchor parcel, effective date, source and reason, producing **14 split transactions and 22 merge transactions**. No synthetic sibling/parent relation is created.

## 3. Traceability validation

Representative cases were selected only from categories that genuinely exist in the current dataset. Every focused parcel graph was checked against `matched_source_ids`, source observations, normalized observations, adapter routing, recorded candidates, conflicts, reconciliation state, governance/history records and final parcel state.

| Case | Parcel | Dataset-backed trace result | Result |
|---|---|---|---|
| Clean match | `IN-DL-110054-1-1` | 4 contributing observations, 5 conceptual adapter routes, 4 candidate associations, `AUTO_MATCHED`, no `CONFLICTS` rows; conflict stage is omitted rather than fabricated | **PASS** |
| Multiple-source match | `IN-DL-110054-1-4` | 5 contributing observations, real multi-adapter routing, 2 conflicts, `HUMAN_REVIEW_REQUIRED` | **PASS** |
| Conflicted parcel | `IN-DL-110054-1-10` | 1 explicit conflict, 4 observations, recorded proposal/decision/authority chain | **PASS** |
| Human-reviewed parcel | `IN-DL-110054-1-18` | `requires_human_review=true`, explicit `HUMAN_REVIEW` event, real unresolved conflict membership | **PASS** |
| Unresolved parcel | `IN-DL-110054-1-18` | non-empty `unresolved_conflicts`; graph conflict count matches source data | **PASS** |
| Split parcel / historical parent | `IN-DL-110054-1-101` | one complete split transaction reconstructed from real lineage rows; related children are record-backed | **PASS** |
| Merge parcel | `IN-DL-110054-1-102` | one merge transaction reconstructed from recorded merge/consolidation lineage | **PASS** |
| Resurveyed parcel | `IN-DL-110054-1-23` | 7 source observations, 3 conflicts, 2 geometry versions with resurvey history | **PASS** |
| Historical parcel | `IN-DL-110054-1-101` | `HISTORICAL_RETIRED`; historical parcel state and lineage/geometry history retained | **PASS** |
| Rollback transaction | `IN-DL-110054-1-74` | history includes real `MUTATION_RECORDED`, `ROLLBACK`, and `CANONICAL_STATE_UPDATED` events | **PASS** |
| Rejected transaction | `IN-DL-110054-1-20` | real `PROPOSAL_REJECTED` event and `REJECTED_MATCH`; rejection is not relabelled as acceptance | **PASS** |

### Trace membership checks

For every representative parcel:

- `SourceObservation` nodes equal the parcel's exact `RECONCILED_PARCELS.matched_source_ids` set.
- `NormalizedObservation` nodes preserve those same observation IDs.
- Adapter nodes are deterministic projections of the seven defined PRAMAN adapter families intersected with the real contributing source types; no adapter-execution record is invented.
- Match-candidate nodes equal the recorded primary + alternate candidate associations for the contributing observations.
- Exactly one parcel-level `MatchDecision` is used where a reconciliation record exists; no pairwise acceptance decision is fabricated.
- Conflict nodes equal the real `CONFLICTS` rows for the parcel.
- Proposal / authority nodes derive from the recorded `proposed_state` and `authoritative_state` payloads.
- Review nodes derive only from explicit `GEOGIT_EVENTS` governance events.
- Geometry nodes map to real `GEOMETRY_VERSIONS` records.
- Lineage transaction nodes are deterministic aggregates whose member IDs all exist in `PARCEL_LINEAGE`.
- GeoGit nodes map to real `GEOGIT_EVENTS` rows.

**Result:** **PASS**. No representative graph node was found that points to a nonexistent record or an unsupported synthetic relationship.

## 4. Anti-fake-data audit

Production paths under `src/evidence-graph` were searched for dataset-specific/fabricated dependencies.

| Check | Result |
|---|---|
| Hardcoded canonical parcel IDs (`IN-DL-...`) | **PASS — none in production source** |
| Hardcoded observation IDs (`OBS-...`) | **PASS — none** |
| Hardcoded conflict IDs (`CNF-...`) | **PASS — none** |
| Hardcoded source IDs | **PASS — none** |
| Hardcoded current totals (1,000 / 4,366 / 715 / 4,583 / 753 / 281 / 286 / 264) | **PASS — none used as dataset values** |
| `Math.random()` | **PASS — none** |
| Randomly generated confidence | **PASS — none** |
| Mock/demo production graph dataset | **PASS — none** |
| Fake reconciliation decisions | **PASS — none** |
| Placeholder lineage | **PASS — none** |
| Evaluation-only `SYNTHETIC_GROUND_TRUTH` / `BENCHMARK_CASES` imported by production Evidence Graph | **PASS — none** |

The literal number `1000` appears only in percentage-rounding arithmetic and CSS numeric values, not as a parcel-total constant.

## 5. Major feature validation

| Feature | Result | Notes |
|---|---|---|
| Source Arrival | **PASS** | One cluster per real source dataset; no invented source family. |
| Adapter Processing | **PASS** | Conceptual architecture routing only; execution-run data is explicitly unavailable. |
| Global Normalization | **PASS** | Source state is preserved; normalized representation is linked, not substituted. |
| Distortion-aware Matching | **PASS** | Uses recorded candidates and parcel-level outcomes; identity remains before correction. |
| Conflict Detection | **PASS** | Uses only explicit `CONFLICTS` records. |
| Reconciliation | **PASS** | Uses `RECONCILED_PARCELS` records/proposal state; no silent overwrite. |
| Authority / Review | **PASS** | Confidence and authority are separate; real governance events only. |
| Authoritative Canonical State | **PASS** | 1,000 active canonical rows; full supported trace coverage passes. |
| Individual Parcel Mode | **PASS** | Focused record-level graph uses exact parcel evidence membership. |
| History / Lineage | **PASS** | Split/merge transactions, geometry versions and GeoGit evidence remain distinct. |
| Exploration Filters | **PASS** | Filters are derived from current dataset and do not rewrite evidence. |
| Performance projection | **PASS** | Global graph remains aggregate; detailed evidence remains available on demand. |
| UI/UX cleanup | **PASS** | Semantic regression suite remains green. |

## 6. Regression validation

### Evidence Graph internal regression

`npm test` on the final cleaned package:

- **105 tests**
- **105 passed**
- **0 failed**
- **0 skipped**

Dataset loader: **PASS**  
Evidence data-layer ERROR diagnostics: **0**  
Routing/state-transfer tests: **PASS**

### Neighboring PRAMAN dashboards

Evidence Graph does **not import, embed, rewrite or restyle** the neighboring dashboards. The final package contains Evidence Graph integration adapters/deep links only.

Verified contracts:

- **Unified Spatial View:** parcel/geometry/version/source context + existing `selectParcel` bridge — **PASS**
- **Conflict Explorer:** `/conflict-explorer?view=conflicts&parcel=...&conflict=...` — **PASS**
- **Reconciliation:** existing Conflict Explorer workflow using `view=reconcile`, parcel/conflict/open-conflict context — **PASS**
- **Source & Schema Mapping:** `ssm_source=<source_id>` context — **PASS**
- **Parcel History & Lineage:** `/layer4?parcel=...&view=lineage`, with event/version where available — **PASS**
- **Return navigation:** serialized Evidence Graph parcel/stage/search/filter/replay state via `returnTo` — **PASS**

**Scope note:** the standalone Evidence Graph ZIP does not contain the source code/runtime of those five separate dashboards, so this validation proves interface compatibility and verifies Evidence Graph did not modify/import them. It does not claim a fresh browser execution of the separately packaged applications.

## 7. Dataset relationships that cannot be fully reconstructed

These gaps are present in the source dataset itself and are deliberately exposed rather than fabricated:

1. **Adapter execution runs:** no adapter run/execution table exists. Evidence Graph can show the defined conceptual adapter routing, but not an actual adapter-run ID, version, operator or run status per observation.
2. **Raw original source records:** only logical `source_record_id` values are available; the raw agency record tables/files are not included.
3. **Per-candidate pair scores:** the dataset has primary/alternate candidate IDs but no per-alternative classifier probability or score.
4. **Observation-level solver decision edges:** `match_status` is parcel-level; there is no stored per-candidate accepted/rejected edge decision.
5. **Global solver internals:** no objective value, solver cost, veto flag or objective contribution is stored.
6. **Pair-level adjacency/topology vectors:** no explicit neighbourhood/adjacency or topology feature vector exists per candidate pair.
7. **Direct GeoGit event → geometry-version foreign key:** `GEOGIT_EVENTS` does not contain `geometry_id`; the UI correctly keeps these as parallel historical evidence unless a deterministic split/merge mapping is available.
8. **Direct conflict → field-level reconciliation-decision identifier:** conflict and reconciliation can be joined at parcel/unresolved-conflict level, but a dedicated decision-record FK is not present.
9. **Historical governance coverage:** some historical records have stored authority state but no explicit `HUMAN_REVIEW`, `PROPOSAL_ACCEPTED` or `PROPOSAL_REJECTED` event. Evidence Graph states this instead of creating a reviewer event.
10. **`SOURCE_GEOMETRIES.observation_ids` reverse backlinks:** these are not treated as authoritative; traversal correctly uses `SOURCE_OBSERVATIONS.geometry_id → SOURCE_GEOMETRIES.geometry_id`.

## 8. Final verdict

### **PASS**

The final PRAMAN Evidence Graph is dataset-backed, traceable and internally consistent with the current production dataset. No count mismatch, fake production record dependency, invented parcel trace, or regression in the Evidence Graph integration contract was found.

The implementation also correctly preserves known evidence gaps instead of filling them with synthetic metadata.
