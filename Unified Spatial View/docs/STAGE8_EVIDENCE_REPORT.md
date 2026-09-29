# Stage 8 — Evidence, conflicts and reconciliation

The complete current city and shared lifecycle model are preserved. The existing Sources, Conflicts and Overview inspector sections now consume one evidence model; History remains connected to the Stage 7 model. No chatbot or duplicate inspector was added.

## Data and mapping

All counts below are calculated from supplied records, not UI constants.

| Record / derived feature | Count |
|---|---:|
| Source observations / associations | 4,366 |
| Unique supplied source geometry records | 4,312 |
| Actual geometry comparisons | 4,366 |
| Missing source geometry in this dataset | 0 |
| Recorded conflicts | 715 |
| Parcels with recorded conflicts | 530 |
| OPEN / RESOLVED conflicts | 329 / 386 |
| Conflict evidence records | 1,715 |
| Exact shared canonical neighbour boundaries | 1,600 |
| Measured positive-area canonical overlap pairs | 135 |

Seven actual source families are available: CADASTRAL_REVENUE (1,061), MUNICIPAL_PROPERTY (1,052), BUILDING_GIS (765), DRONE_ORTHOPHOTO (782), UTILITY_INFRASTRUCTURE (190), GNSS_CORS_SURVEY (229), DDA_DEVELOPMENT_AUTHORITY (287).

`normalized-map.json` remains the source for observations, source geometry, association membership, conflicts, conflict evidence and reconciliation. `tools/build_evidence.py` verifies export hashes and supplements this with the supplied RECONCILED_PARCELS confidence fields and CONFLICTS attribute/review/evidence-request fields. It builds `evidence-map.json`; rendering never knows workbook columns. No evaluation-only truth, candidate hints or new matching memberships are imported.

## Interaction and geometry

Select a parcel and open Sources or Boundary compare. Multiple supplied observations can be compared together. Source family controls support selected-parcel or visible-cell scope. Dashed observations remain distinct from authoritative reference geometry. Selection fill is suppressed during comparisons so the actual difference regions remain readable.

Comparisons use exact polygon intersection/difference: overlap, reference-only and observation-only regions, unmatched edges, signed area difference, centroid displacement, discrete boundary Hausdorff distance, component/hole counts and intersection-over-union. Amber and blue fills show only the actual differences. These measurements do not assign legal gap/sliver/conflict labels or prove why the matcher decided. No snapping, repair, new legal road boundaries or cadastral changes occur.

Shared boundaries have one stable derived ID for both neighbours. Inspection shows both parcels, linked observation geometry, sampled offsets and related parcel conflicts/reconciliation state. Three nearest-boundary samples per segment are diagnostic, not a continuous maximum. The dataset supplies no edge-level provenance, approval or correction decision; associated observations and parcel decisions are explicitly not presented as edge rulings.

Conflict dots locate parcel records, not conflict footprints. Multiple records remain individually inspectable in the existing Conflicts tab. Geometry-related records can select their supplied evidence geometry; ownership records do not acquire invented spatial footprints. Issues only uses actual type/status/cell filters, subdues unaffected cadastral fills and temporarily hides illustrative buildings. Parcel identity and geometry remain intact.

Current evidence overlays are suspended in historical snapshots, event playback and Historical-only mode to avoid presenting mixed-date evidence as past authority.

## Decision support and navigation

Match, geometry, ownership, land-use, lineage and reconciliation confidence remain separate. Observation quality/reliability, positional accuracy and freshness retain their supplied meanings. No correction confidence is supplied. Reconciliation proposals and review information never replace the authoritative registry.

Why this match? exposes supplied source identifiers, quality, geometry/identifier/attribute confidence and administrative evidence. Causal feature vectors, weights and neighbourhood/topology scoring explanations are absent; none are invented.

Open Reconciliation and View Evidence preserve parcel, selected conflict, source, observations, filters and return context. The actual supplied external dashboard URL readers were imported and tested (see STAGE8_NAVIGATION_CONTRACT.json). Default paths are `/conflict-explorer` and `/evidence-graph`; configure `data/dashboard-routes.json` or `window.PRAMAN_DASHBOARD_PATHS` for the host. A cancelable `praman:spatial:navigate-dashboard` event supports host integration. These external dashboards are not bundled or deployed by this ZIP; route-contract validation is not an end-to-end deployment claim. GeoGit remains separate.

## Validation and limits

See STAGE8_TEST_RESULTS.txt, STAGE8_EVIDENCE_FINAL_TEST.txt STAGE8_REGRESSION_RETEST.txt and STAGE8_GEOMETRY_TESTS.txt for actual test results. Coverage includes multiple sources, measured geometry disagreement, ownership, multiple/no conflicts, shared-edge identity and picking, conflict marker picking, source family overlays, human review, proposals, navigation return context, historical suspension, and readable 1366×768 layout. All real observations have geometry, so the no-source-geometry case is an explicit controlled fixture, not a fabricated production record.

Screenshots: stage8-source-comparison.png, stage8-shared-edge.png, stage8-issues-only.png. Browser checks use software rendering. This stage does not claim to resolve the earlier close-up city performance limit. Source overlays are batched and visible-cell scoped; diagnostic geometry loads once and is created only when requested. The derived JSON is approximately 19 MB uncompressed; serving with HTTP compression is advisable.

STAGE8_PRESERVATION_CHECK.json verifies unchanged baseline assets, local Three.js vendor files, calibrated registry, canonical data and temporal model/view metadata. Canonical data SHA-256: `f9f9b76fb2e9f98e72ffd999c4dfaf57b41e63c0422464bddc7b883a65a35c0e`. Known Stage 7 source-history limitations remain documented in STAGE7_TEMPORAL_REPORT.md.

The initial city picking regression projected a test point with a stale camera matrix after asynchronous loading. The test now explicitly updates that matrix before projection; parcel identity assertions are unchanged. The affected full-city regression passes on rerun. Initial and rerun logs are retained.

Measured software-renderer regression: current locality overview 49 draw calls / 2,722 triangles; sampled close-up median frame interval 171.8 ms, p95 314.1 ms. These are environment-specific observations, not a desktop hardware performance guarantee.
