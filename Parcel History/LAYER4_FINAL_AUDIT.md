# PRAMAN Layer 4 — Final Semantic Audit

Scope: **Parcel History & Lineage**. This audit validates whether Layer 4 tells a logically consistent parcel story across the directory, timeline, Event Inspector, historical/current/proposed states, spatial history, lineage, and GeoGit provenance. It is not limited to renderability.

## Overall result

**PASS after two repairs.** No unresolved Layer 4 semantic contradiction was found against the supplied PRAMAN dataset.

Validated full-dataset totals: 1,060 parcel identities; 1,000 current canonical parcels; 60 historical retired identities; 1,143 geometry versions; 243 pending proposals; 26 retained rejected proposals; 731 accepted proposal events; 74 explicit lineage edges; and 8 rollback events.

## Representative real parcel stories

| Case | Parcel | Result | Reconstructed story |
|---|---|---|---|
| Ordinary active parcel | `IN-DL-110054-1-1` | **PASS** | Clean parcel. Proposal acceptance `P1 → V2` is followed by `CANONICAL_STATE_UPDATED V1 → V2`; current state is canonical V2 with accepted official geometry `GEO-01-001-G1`. No conflict, lineage, survey, or pending proposal is fabricated. |
| Survey history | `IN-DL-110054-1-8` | **PASS** | `GNSS_CORS_SURVEY` appears as a Survey event. It does not become a geometry-change event. Later proposal acceptance and canonical update produce current V2. |
| Geometry-corrected parcel | `IN-DL-110054-1-26` | **PASS** | `GEO-01-026-G1` (907.51 m²) is superseded; accepted authoritative `GEO-01-026-G2` (906.05 m²) becomes official current geometry. G1 remains inspectable as historical geometry. A broader reconciliation proposal remains pending and does not replace G2/current owner/current state. |
| Parcel with open conflict | `IN-DL-110054-1-4` | **PASS** | Current V1 remains authoritative while `CNF-00326` is open and reconciliation is awaiting review. Conflict appears in history/inspector and does not become authority. |
| Mutation | `IN-DL-110054-1-74` | **PASS** | `MUTATION_RECORDED P1 → V2_BAD` is shown as a mutation without invented geometry change. |
| Rollback/restoration | `IN-DL-110054-1-74` | **PASS** | `ROLLBACK V2_BAD → V1` follows the bad mutation. It remains a history/version event; no lineage edge is invented. A later accepted proposal `P1 → V2` plus canonical update establishes current V2. |
| Split parcel | `IN-DL-110054-1-101` | **PASS** | Historical V1 parcel retired on 2009-03-15 and explicitly split into `IN-DL-110054-1-91` and `IN-DL-110054-1-92`. Both edges come directly from `PARCEL_LINEAGE`. |
| Merge result | `IN-DL-110054-1-93` | **PASS** | Explicit parents `IN-DL-110054-1-102` and `IN-DL-110054-1-103` converge into current parcel `IN-DL-110054-1-93`. The history groups the merge relationship without altering the underlying two lineage records. |
| Historical/superseded state | `IN-DL-110054-1-101` and `IN-DL-110054-1-26` | **PASS** | Retired identity and superseded-geometry history remain non-current. Historical inspection never mutates authoritative state. |
| Pending proposal | `IN-DL-110054-1-4` | **PASS** | Proposal is `PENDING / AWAITING_REVIEW / NOT AUTHORITATIVE`; current V1 remains unchanged. |
| Rejected proposal | `IN-DL-110054-1-20` | **PASS** | `PROPOSAL_REJECTED` remains visible in history as a rejected administrative decision. Current V1 stays authoritative; rejected state never becomes current and is not shown as an approval. |
| Accepted proposal | `IN-DL-110054-1-1` | **PASS** | Acceptance is not enough by itself: the audit confirms the corresponding `CANONICAL_STATE_UPDATED` event and canonical V2 record. All 731 accepted proposal events satisfy this rule. |
| Cross-cell lineage | `IN-DL-110054-3-1` | **PASS** | Explicit `LIN-0068 CROSS_CELL_SPLIT` links parent `IN-DL-110054-2-106` in `CELL-02` to child `IN-DL-110054-3-1` in `CELL-03`; cell boundaries do not break ancestry. |

The dataset contains rollback events, but **no rollback/restoration lineage edges**. Layer 4 therefore shows rollback in Parcel History/GeoGit provenance and correctly does not invent rollback ancestry in Parcel Lineage.

## Required semantic tests

| Test category | Result | Verification |
|---|---|---|
| Parcel directory → selected parcel | **PASS** | All 1,060 identities are unique; source observations never create duplicate parcel rows. Representative IDs resolve to their own detail record only. |
| Timeline consistency | **PASS** | Every normalized event in a parcel model has the selected parcel ID. Split/merge visual grouping preserves underlying lineage records. |
| Event Inspector | **PASS** | Event-specific fields come from normalized source records; no raw JSON is dumped; rejected proposals are not classified as approvals. |
| Current Authoritative State | **PASS** | Every one of the 1,000 current states resolves from `CANONICAL_PARCELS.current_geometry_id` to a geometry explicitly `AUTHORITATIVE` + `ACCEPTED`. `canonical_state_version` comes directly from the canonical table. Authority selection contains no confidence/score heuristic. |
| Historical state | **PASS** | Historical selection is read-only inspector context. The audit serializes current authority before/after historical selection across all parcels with historical states and finds no mutation. |
| Return to current | **PASS** | Current state object remains the canonical record; historical mode does not promote or replace it. Existing state-separation regression also verifies the G1→G2 case for `IN-DL-110054-1-26`. |
| Pending proposal | **PASS** | 243 proposals remain explicitly non-authoritative. Proposed geometry/owner/area never replaces current authoritative values. |
| Rejected proposal | **PASS** | 26 rejected proposals remain `NON_AUTHORITATIVE_REJECTED`; rejected geometry/state cannot become current. |
| Accepted proposal | **PASS** | All 731 accepted proposal events have corresponding canonical-state-update evidence to the accepted version, and that version matches current canonical state. |
| Split lineage | **PASS** | Parent→children edges equal explicit `PARCEL_LINEAGE` rows. |
| Merge lineage | **PASS** | Parents→result edges equal explicit `PARCEL_LINEAGE` rows. |
| Historical parcel descendants | **PASS** | Historical identities retain explicit descendant edges where recorded. |
| Current parcel ancestors | **PASS** | Current descendants expose incoming explicit ancestry; no ID-string inference is used. |
| Cross-cell lineage | **PASS** | True cell-changing edges remain connected. Four explicit lineage edges cross actual cell IDs in the current dataset. |
| Survey ≠ geometry change | **PASS** | Survey observations remain `SURVEY_OBSERVATION`; no survey event receives geometry-before/after solely because a survey exists. |
| Mutation ≠ automatic geometry change | **PASS** | Mutation/rollback events with no recorded geometry delta retain null geometry transitions. No delta is inferred. |
| Approval ≠ proposal | **PASS** | Only `PROPOSAL_ACCEPTED` maps to `OFFICIAL_APPROVAL`; pending proposals remain separate state data and rejection maps to non-approval metadata. |
| Conflict ≠ authority | **PASS** | Conflict events never receive accepted-authority semantics and cannot select current state. |
| Metadata visual/legal weight | **PASS** | Administrative events remain in the metadata category; canonical authority is communicated by the separate current-state component and explicit acceptance evidence. |
| GeoGit provenance | **PASS after repair** | Real GeoGit event IDs and parcel version transitions are exposed under Technical Provenance. No commit hash is invented when the dataset has none. |
| Hardcoded parcel facts | **PASS after repair** | Production adapter/UI/index-builder contain no hardcoded parcel IDs, dataset dates, known dataset counts, or fabricated ACTIVE fallback. Filters/counts are generated from dataset records. |

## Genuine implementation failures found and repaired

| File / component | Parcel involved | Actual behavior | Expected behavior | Repair |
|---|---|---|---|---|
| `src/ParcelTimeline.jsx` → `TechnicalProvenance` | Split/merge cases such as `IN-DL-110054-1-101` and `IN-DL-110054-1-93` | `PARCEL_LINEAGE.lineage_event_id` values such as `LIN-0003` were displayed as **Transaction ID**, even though the dataset has no transaction-ID field. | Do not claim a provenance identifier the dataset does not provide. | Removed the fabricated Transaction ID interpretation. Explicit lineage IDs are now labelled **Lineage record ID**; actual GeoGit event IDs remain separately labelled **GeoGit event**. |
| `scripts/build-layer4-index.cjs` → `uiPrimaryStatus` / `stateMarkers` | Latent; current dataset rows all have `parcel_status` | If a canonical record lacked `recordStatus`, the builder could synthesize `ACTIVE`. | Missing dataset status must remain unavailable rather than being guessed. | Removed the `ACTIVE` fallback. Current status/markers are emitted only when the authoritative record actually supplies the status. |

No other genuine Layer 4 semantic implementation defect was found after these repairs.

## Data-hardcoding audit

Production Layer 4 sources were scanned for literal PRAMAN parcel IDs, literal dataset dates, and known dataset totals. None are embedded in the implementation. The generated `public/layer4-data` files naturally contain dataset-derived parcel facts; those are build artifacts generated from the supplied CSVs, not hardcoded source constants.

The filter facets in the rebuilt index remain dataset-derived: status, land use, cell, and available history types are generated from the current records.

## Regression / non-interference audit

| Area | Result | What was verified |
|---|---|---|
| Existing Layer 4 dataset adapter | **PASS** | Full adapter suite passes against the raw PRAMAN dataset. |
| Existing dataset loader/backend files | **PASS (unchanged)** | `dataset.repository.js`, `parcelTimeline.routes.js`, `parcelTimeline.service.js`, and `server.js` remain byte-for-byte unchanged from the originally supplied Layer 5 archive. Layer 4's new adapter independently reads the new PRAMAN data contract. |
| Unified Spatial View | **PASS — integration boundary** | Layer 4 contains only a deep link for broad spatial context and its own focused lazy historical geometry renderer; it does not import or embed the city map. |
| Conflict Explorer | **PASS — integration boundary** | Layer 4 links to conflict case context with `returnTo`; no Conflict Explorer component/workflow is embedded or modified. |
| Reconciliation workflow | **PASS — non-interference** | Layer 4 reads reconciliation records but contains no reconciliation action/workflow implementation and does not mutate reconciliation source data. |
| Evidence Graph | **PASS — integration boundary** | Layer 4 emits context links only; no Evidence Graph implementation is imported or embedded. |
| Source & Schema Mapping | **PASS — non-interference** | No Source & Schema Mapping code is imported or modified by this Layer 4 artifact. |
| Global navigation | **PASS** | No second top-level Parcel Lineage dashboard entry is created. Lineage remains `view=lineage` inside Parcel History & Lineage. |
| Navigation state | **PASS** | Search/filter/parcel/event state is retained in Layer 4 URLs and propagated through `returnTo` on cross-dashboard links. |

**Runtime scope note:** this supplied artifact is a Layer 4 package and does not contain the implementation source for Unified Spatial View, Conflict Explorer, Reconciliation, Evidence Graph, or Source & Schema Mapping. Therefore the audit can prove code-level non-interference and routing contracts, but it cannot independently launch those absent dashboards end-to-end from this archive. No fake runtime pass was substituted for that limitation.

## Automated audit coverage

The final build passes all prior Layer 4 suites plus `layer4.finalAudit.test.mjs`. The final audit test discovers representative records from the live dataset, then checks current authority evidence, historical immutability, proposal isolation, acceptance/canonical-update correspondence, exact lineage equality against `PARCEL_LINEAGE`, cross-cell continuity, rollback semantics, event-category separation, GeoGit identifier honesty, and hardcoded-fact absence.

Final automated result: **PASS**.
