# PRAMAN Evidence Graph — Final Full Audit

Date: 2026-09-29

## Scope

This audit was performed on the current dataset-driven continuous-waterfall Evidence Graph. The implementation was not rebuilt and no new conceptual design was introduced. `public/PRAMAN_DATA` remained the single source of truth.

The final pass combined source/data-contract inspection, independent CSV calculation, real Chromium rendering of the current dashboard modules and CSS, interaction testing, representative parcel provenance tracing, integration-contract regression tests, syntax checks, HTTP asset/data smoke tests, and the complete automated test matrix.

## Reproducible defects found and fixed

1. **Empty filter-indicator artifact on the initial screen.** The `hidden` attribute on the filter-status element was being overridden by `.eg-filter-indicator { display:inline-flex; }`, producing a small unexplained green circle with no active filters. A scoped `[hidden] { display:none !important; }` rule now preserves semantic hidden state.

2. **Completion-only UI could remain stale.** The renderer structural cache key did not include playback state. When the final operation changed from `running` to `completed` without changing graph topology, the renderer could return early and fail to reveal the final summary / retained completion state. Playback state is now part of structural invalidation.

3. **Desktop node readability and geometry.** Several node text sizes were too small. Increasing them exposed a real layout assumption defect: the renderer still planned rows using a 76 px node height and could overlap/clamp nodes. The layout now uses the actual 108 px planning height, 210 px node width, and bounded row placement. The final 1440×900 browser audit reports **0 node overlaps, 0 clipped nodes, and no horizontal page overflow**.

4. **Final summary terminology was underspecified.** `RECONCILED` match-status rows (56) were previously easy to confuse with all reconciliation records (1,060). The completed-run summary now shows the actual reconciliation-record count and separately identifies the 56 rows carrying `MATCH_STATUS=RECONCILED`. Candidate relationships, rejected matches, unmatched observations, human-review-required parcels, and split/merge lineage counts are also explicitly dataset-derived.

5. **Residual presentation-era wording.** Remaining user-facing wording referring to a numbered conflict “Stage-5” was removed. The internal operation registry is retained for controller sequencing/deep-link restoration, but no numbered-stage presentation controls are exposed.

## A. Initial screen

Real Chromium rendering at 1440×900 verified:

- dashboard mounts successfully using the current modules, CSS, and current PRAMAN_DATA;
- header and explanatory structure render;
- summary values render as **7 source datasets, 4,366 source observations, 1,000 active canonical parcels, 715 conflicts**;
- Search Parcel provides **2,132 real searchable identifiers** (canonical/historical IDs plus verified source-parcel aliases);
- only dataset-supported filters are present;
- the central lifecycle Play button is visible;
- Replay is not shown before the first run;
- no visible `Stage 1`, `Stage 2`, `Stage 3`, `Next Stage`, or `Previous Stage` text exists;
- no application page errors or console errors occurred.

A managed-browser policy prevents direct localhost URL navigation in this environment, so the browser audit mounts the actual application modules/data/CSS in an inline test document with a mocked route/history object. Separately, HTTP serving of the entry page, dashboard modules, renderer, and representative PRAMAN_DATA CSV returned 200. The React integration route remains declared at `/evidence-graph` and is covered by integration-contract tests.

## B. Continuous playback

The first full lifecycle was allowed to animate normally at 2× speed rather than being forced to completion.

Observed progression:

- early playback: 2 nodes, controller `RUNNING`;
- subsequent operation: 11 nodes / 10 edges while earlier evidence remained present;
- completed graph: **60 nodes / 146 provenance edges**;
- duplicate rendered node IDs: **0**;
- document height grew to approximately **4,378 px** with a **4,040 px** graph surface;
- page stayed at its user-controlled scroll position rather than being forcibly auto-jumped;
- final operation state changed to `TRACE RETAINED`;
- final summary became visible only on completion;
- Replay restarts at the source operation without overlapping the previous controller/timer.

No slideshow/wizard/stepper/next-stage UI is present.

## C. Independent PRAMAN_DATA calculation

The following values were calculated directly from the 14 CSV files, independently of the Evidence Graph summary code, and compared with the graph/runtime values.

| Measure | Independent PRAMAN_DATA result | Evidence Graph result | Result |
| --- | ---: | ---: | --- |
| Source datasets | 7 | 7 | Match |
| Source observations | 4,366 | 4,366 | Match |
| Active canonical parcels | 1,000 | 1,000 | Match |
| Historical parcels | 60 | 60 | Match |
| Candidate relationships | 4,583 | 4,583 | Match |
| Accepted match outcomes | 753 | 753 | Match |
| Ambiguous match outcomes | 281 | 281 | Match |
| Rejected match outcomes | 26 | 26 | Match |
| Unmatched observations | 0 | 0 | Match |
| Conflicts | 715 | 715 | Match |
| Reconciliation records | 1,060 | 1,060 | Match |
| Parcels with unresolved-conflict references | 286 | 286 | Match |
| Reconciliation rows requiring human review | 264 | 264 | Match |
| Split lineage relationships | 28 | 28 | Match |
| Merge-family lineage relationships | 46 | 46 | Match |

Important distinctions preserved by the UI/audit:

- 329 conflict rows are `OPEN`; this is not the same measure as the 286 parcels with non-empty `unresolved_conflicts` references.
- 344 conflict rows have `human_review_required=true`; this is not the same as 264 reconciliation rows requiring human review.
- 243 explicit `HUMAN_REVIEW` GeoGit events exist; this is an event count, not the parcel-level human-review count.
- Match-status composition is 508 `AUTO_MATCHED`, 189 `MATCHED_WITH_MINOR_CONFLICT`, 56 `RECONCILED`, 118 `HUMAN_REVIEW_REQUIRED`, 100 `TENTATIVE`, 63 `NEEDS_ADDITIONAL_EVIDENCE`, and 26 `REJECTED_MATCH`.

No new thresholds were introduced to derive these categories.

## D. Representative traceability audit

Every listed focused waterfall passed the provenance auditor with zero unresolved provenance references.

| Case | Real parcel | Key recorded evidence | Focused graph |
| --- | --- | --- | ---: |
| Clean / multi-source | `IN-DL-110054-1-1` | 4 source observations; 0 conflicts; no fabricated conflict branch | 29 nodes / 41 edges |
| Conflicted / unresolved / human-reviewed | `IN-DL-110054-1-4` | 5 observations; 2 conflicts; 1 unresolved reference; human review required + explicit review event | 33 / 54 |
| Reconciled | `IN-DL-110054-1-74` | `MATCH_STATUS=RECONCILED`; recorded rollback event also exists | 27 / 39 |
| Split | `IN-DL-110054-8-101` | 2 recorded `SPLIT` lineage relationships | 28 / 39 |
| Merge | `IN-DL-110054-7-102` | recorded `MERGE` relationship | 20 / 23 |
| Historical | `IN-DL-110054-1-101` | historical parcel with recorded split lineage | 22 / 26 |
| Resurvey / geometry update | `IN-DL-110054-1-23` | recorded geometry version with resurvey change reason | 43 / 74 |
| Rollback | `IN-DL-110054-1-74` | explicit `ROLLBACK` GeoGit event | 27 / 39 |

There is **no distinct restoration event type** in the current `GEOGIT_EVENTS` data. Restoration was therefore not fabricated as a separate test case.

## E. UX / desktop inspection

At 1440×900 after the fixes:

- node overlaps: **0**;
- horizontally clipped nodes: **0**;
- horizontal document overflow: **false**;
- graph remains naturally vertically scrollable;
- prior evidence stays visible as later evidence is revealed;
- node typography was increased from the very small previous values;
- final graph remains inspectable after playback;
- selected-node drawer opens from a rendered evidence node and shows real source/provenance information;
- filter indicator is absent when no filters are active and explicit when filters are active;
- filtered completion shows a **FILTERED SUBSET** summary rather than misleadingly reusing global totals;
- invalid parcel search shows an error message and leaves the valid existing graph intact rather than fabricating a lifecycle;
- clearing filters regenerates the selected parcel/full trace with unfiltered data.

## Search, filters and replay interaction matrix

Live browser verification covered:

1. full dataset playback;
2. canonical parcel search;
3. source-dataset filter only;
4. source-parcel alias + matching source filter;
5. parcel replay;
6. filtered overview replay;
7. clearing filters / returning to the unfiltered trace.

Example filter `SRC-A-REV` produced a completed dataset-backed subset of **52 nodes / 131 edges** and reported 1,043 matching parcels. Searching source alias `SRC-1-1` resolved through recorded source-observation membership to canonical parcel `IN-DL-110054-1-1`; with that source filter active the parcel graph contained 16 nodes / 18 edges. Removing the filter restored that parcel’s 29-node / 41-edge trace.

## F. Regression / PRAMAN integration

The supplied archive contains the Evidence Graph package and integration bridges, not runnable copies of every other dashboard. Therefore a visual runtime regression of Unified Spatial View, Conflict Explorer, Source & Schema Mapping, and Parcel History cannot truthfully be performed from this archive alone.

What was verified here:

- `/evidence-graph` route declaration remains intact;
- navigation/return state round-trips through `returnTo` and Evidence Graph URL state;
- Unified Spatial View parcel bridge remains intact;
- Conflict Explorer and Reconciliation contextual URLs retain parcel/conflict context;
- Source & Schema Mapping keeps source context through `ssm_source`;
- Parcel History & Lineage keeps parcel/version/event context;
- target dashboards are not imported/rebuilt by the Evidence Graph;
- the shared PRAMAN_DATA loader and all 14 CSVs remain unchanged.

The dedicated cross-dashboard integration suite passed all **8/8** checks.

## G. Final validation

- Automated tests: **130 passed / 0 failed** across 19 test files.
- JavaScript syntax: **46 `.mjs` files passed `node --check`**.
- Browser audit: **0 application page errors / 0 console errors**.
- Completed overview: **60 nodes / 146 edges**, 0 duplicate nodes.
- Desktop geometry: 0 overlapping nodes, 0 clipped nodes, no horizontal overflow.
- Performance benchmark: global final snapshot 60/146; cached locality projection ~0.020 ms; 1,000 same-operation progress ticks ~4.60 ms in this audit run.
- HTTP smoke: entry page, dashboard module, renderer module, and representative dataset CSV all returned 200.
- Dataset integrity: **14/14 PRAMAN_DATA CSVs are byte-for-byte identical to the previous validated build**.
- Production-source hardcoded audit: no current dataset totals such as 4,366 / 4,583 / 715 / 1,060 are embedded as business-data constants.

## Files changed by this final audit

Production fixes were confined to:

- `src/evidence-graph/dashboard/evidenceGraph.css`
- `src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs`
- `src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs`
- `src/evidence-graph/replay/authoritativeCanonicalState.mjs`
- `src/evidence-graph/replay/projection.mjs`
- `src/evidence-graph/replay/stages.mjs` (wording only)

Tests changed/added:

- `tests/authoritative-canonical-state.test.mjs` (updated terminology expectation)
- `tests/final-full-audit.test.mjs` (new final-regression coverage)

No PRAMAN_DATA file was changed, added, or removed.
