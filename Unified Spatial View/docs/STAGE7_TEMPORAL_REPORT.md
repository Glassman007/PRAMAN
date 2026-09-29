# Stage 7 — Shared temporal and lifecycle system

Stage 6's complete current locality remains the default. This stage adds a single temporal domain model used by state modes, local lineage, event playback, date reconstruction, the inspector History tab and the linked parcel-history page. No GLB, calibrated dimension, cadastral coordinate, city placement plan or existing source bundle was changed.

## Actual source mapping

| Source | Actual fields used | Temporal meaning |
|---|---|---|
| CANONICAL_PARCELS | parcel_status; current_geometry_id; authoritative_version; canonical_state_version | Stored current record and its explicitly referenced geometry. Record and geometry version labels are separate namespaces. |
| HISTORICAL_PARCELS | record_status; lineage_status; retired_date; retirement_reason; historical_geometry_id | Stored retired identity and historical boundary. |
| GEOMETRY_VERSIONS | geometry_id; canonical_parcel_id; version_label; effective_date; geometry_status; accepted_status; supersedes_geometry_id; source_type; change_reason | Geometry status, explicit predecessor and source-effective date. |
| PARCEL_LINEAGE | lineage_event_id; event_type; parent_parcel_id; child_parcel_id; effective_date; accepted_status; reason; source | Accepted parent/child transitions. Only connected rows with matching type/date/source/status form one playback transaction. |
| GEOGIT_EVENTS | event_id; parcel_id; timestamp; event_type; previous_version; resulting_version; source; actor_type; reason; related_parcel_ids | Actual recorded events, including state changes, reviews and rollbacks. |
| RECONCILED_PARCELS | match_status; proposed_state; authoritative_state; requires_human_review | Review/proposal context, kept separate from accepted canonical geometry. |
| BUILDINGS | Current records only; no historical building version links supplied | Buildings cannot be reconstructed or morphed from parcel lifecycle changes. |

The spatial bundle had omitted geometry predecessor/source/reason columns. `tools/import_temporal.py` preserves those actual columns in `data/temporal-details.json`, after checking the raw CSV SHA-256 against the original import manifest. It leaves the validated spatial bundle unchanged. The geometric lineage audit uses only these normalized parcel/version records; no evaluation-only ground truth is imported.

## Runtime-derived inventory

| Measure | Count |
|---|---:|
| GeoGit records | 5602 |
| Geometry version records | 1143 |
| Lineage relationship rows | 74 |
| Grouped lineage transactions | 36 |
| Unified event/version entries | 6781 |
| Recorded date points | 82 |
| Rollback events | 8 |
| Geometry category: CURRENT / AUTHORITATIVE | 1000 |
| Geometry category: UNDER REVIEW | 20 |
| Geometry category: HISTORICAL / SUPERSEDED | 121 |
| Geometry category: REJECTED | 2 |

Grouped transactions by recorded type: CROSS_CELL_MERGE: 2, CROSS_CELL_SPLIT: 2, MERGE: 10, REDEVELOPMENT_CONSOLIDATION: 10, SPLIT: 12.

The 121 historical/superseded geometries consist of 60 retired parcel geometries and 61 previous boundaries of still-current parcels. The 20 proposal geometries are under review. The two rejected geometries are available only through an explicit comparison option.

## Authority and view behavior

Current rendering requires an active canonical record with explicit AUTHORITATIVE status, a matching geometry reference, geometry status AUTHORITATIVE and acceptance ACCEPTED. Confidence, recency, survey accuracy, AI output and proposed reconciliation do not confer authority. Current geometry can coexist with an under-review record proposal. `UNCHANGED_PENDING` does not revoke the independently accepted existing boundary or accept the proposal.

- **Current:** complete authoritative locality; historical/proposed geometry hidden.
- **Historical:** stored retired and superseded boundaries, purple dashed and subordinate styling. These versions may span different dates; this mode is not a reconstructed single instant.
- **Current + historical:** current fabric remains dominant; historical geometry is ghosted.
- **Proposed / review:** amber dashed proposal boundaries over current authority. Rejected comparisons are opt-in, red dashed, and never promoted.
- **Time machine:** reconstructs membership and accepted geometry at the end of a selected recorded day. It replaces the current parcel fabric, rather than changing today's opacity. A persistent badge and footer distinguish the reconstructed state.

Historical IDs remain in search. Selection shows stored lifecycle, parent/child IDs, successor IDs, record/geometry versions, events and retirement date/reason where supplied. Local lineage shows only the selected parcel's parents and children. Geometry picking retains the exact geometry version and temporal category. The inspector explicitly warns that stored owner/building attributes are not historical snapshots.

## Reconstruction rules and limits

Creation events establish births; accepted lineage transactions establish atomic parent retirement and child birth on their effective date. Supplied retirement dates agree with the accepted lineage dates in this dataset. Before birth a parcel does not exist. After retirement it is superseded. A recorded birth without a geometry effective at that date produces an active-but-missing-geometry record, not a back-projected current polygon.

Geometry selection follows accepted/superseded source records and their dates. Proposed and rejected geometry is excluded at every historical point. State versions are reconstructed separately from explicit creation/authority mutation/acceptance/rollback events; a P1 match proposal never becomes authority just because it is recent. Rollback uses the actual resulting version, without inventing a corresponding geometry or building snapshot.

Source timestamps do not specify a timezone and lineage/geometry dates have day precision. The UI therefore promises **end-of-recorded-day reconstruction**, not exact intraday ordering or a guessed timezone. Events remain available with their original timestamps. Selecting an event later than the map's historical point is explicitly labelled as not applied to that map.

At 1995-01-01: 584 active, 0 superseded, 476 not yet existent, 0 unknown lifecycle, 556 active records without date-valid geometry.

At 2026-09-10: 1000 active, 60 superseded, 0 not yet existent, 0 unknown lifecycle, 0 active records without date-valid geometry.

## Playback and building independence

Previous, Play/Pause, Next, Replay and Exit playback are contextual to a selected recorded event/version. Playback is a preview and never mutates the dataset or commits an approval.

- Splits show the stored parent, actual shared child dividing edges (or actual child boundaries where no shared edge exists), emerging children and the recorded retirement/result state.
- Merges show stored parents, measured shared internal edges, their removal and the actual result geometry.
- Boundary correction uses the explicit supersedes link. It shows old/new boundaries and progressively reveals changed edges. It does not guess vertex correspondence or morph a polygon through unsupported shapes. An accepted correction without a stored proposal phase is shown as an accepted comparison; no missing proposal is fabricated. Pending/rejected comparisons retain the old boundary and never acquire an accepted endpoint.
- Rollbacks without geometry links use record-version playback only. The current spatial context remains unchanged; no fictitious reverse geometry animation is shown.

Today's illustrative buildings are hidden by default in historical/spatial-event views because historical building snapshots are absent. A clearly labelled option can show today's buildings as context. No parcel transition splits, merges, rescales or morphs any GLB. Browser checks compared existing mesh and instance transforms across boundary playback.

## Source geometry discrepancies

The independent Shapely audit compares parent unions with child/result unions without repair. Small floating-point/projection discrepancies are retained as measured values. Two cross-cell splits have large unexplained areas:

| Transaction | Parent union m² | Child union m² | Symmetric difference m² |
|---|---:|---:|---:|
| LIN-0073 (CROSS_CELL_SPLIT) | 24487.396 | 1551.280 | 22936.119 |
| LIN-0067 (CROSS_CELL_SPLIT) | 22468.539 | 1370.841 | 21097.700 |

These are source inconsistencies, not repaired geometry. Accepted lineage establishes the recorded relationship, not geometric consistency. The event panel and playback badge report the measured union difference. They must be resolved in the authoritative data workflow before treating these two transitions as spatially complete subdivisions. Every recorded merge has a measurable shared parent boundary.

## History navigation and code boundaries

`View Parcel History` opens the bundled `parcel-history.html` reader over the same model. The URL carries `parcelId`, `eventId` and supplied `versionId`; the return link restores them to the map. The reader exposes real event IDs, versions, timestamps, source references, actors, reasons and authority/review fields. Missing values are labelled Not supplied. It does not fabricate commit hashes, evidence IDs, approvers or approval dates. No separate external Layer 4 application was bundled into this Layer 2 project or assumed to have a particular route.

| File | Responsibility |
|---|---|
| data/temporal-model.js | Sole authority/lifecycle normalization, event indexing, local lineage, reconstruction and playback plans |
| data/temporal-details.json | Verified omitted geometry source columns |
| data/temporal-geometry-audit.json | Independent parent/result geometry diagnostics |
| map/temporal-renderer.js | Batched temporal geometry, retained identity, dashed/colored styles, changed/shared edges |
| map/temporal-view.js | Map modes, selected lineage, event controls, time machine and history links |
| map/parcel-history-page.js | Read-only shared-model history reader |
| tools/import_temporal.py / audit_temporal_geometry.py | Reproducible source mapping and geometry diagnostics |
| tests/temporal-model.mjs / temporal.cjs | Model safety and browser acceptance checks |

Stage 6's caching, safe instancing, cells, search, independent picking and semantic placement remain. Temporal geometry is built on demand and batched by style, not added as thousands of persistent meshes. Existing pilot/fabric/calibration modes remain diagnostic routes. The close-up GLB performance limitation from Stage 6 remains; this stage does not claim to solve model LOD.

## Validation

Ten model tests passed, covering explicit authority, real event identities, ordinary/historical parcels, all accepted split/merge transactions, cross-cell lineage, corrections, proposal/rejection exclusion across all date points, rollbacks, missing geometry and context-preserving URLs.

Browser acceptance passed for all four modes, historical search, split/merge/cross-cell phase progression and edge emphasis, boundary comparisons, proposal/rejected endpoints, play/pause/replay, record-only rollback, real time reconstruction, linked history navigation, and independent building transforms. Screenshots were visually inspected at 1366×768. No page errors were recorded.

All earlier browser suites passed: full city, pilot, dataset, all 42 assets, renderer foundation and UI smoke. Python import, pilot and city geometry checks passed, preserving zero placement setback/clearance violations and all actual building identities. Evidence is in `STAGE7_TEST_RESULTS.txt`, `STAGE7_TEMPORAL_FINAL_TEST.txt`, `temporal-model-validation.json`, `temporal-runtime-validation.json` and the three `stage7-*.png` screenshots.

Spatial bundle SHA-256: `f9f9b76fb2e9f98e72ffd999c4dfaf57b41e63c0422464bddc7b883a65a35c0e`.
