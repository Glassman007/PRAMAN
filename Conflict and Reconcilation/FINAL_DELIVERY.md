# Final Delivery Summary

## Architecture

The application uses one cached production-data runtime for both workspaces. Required CSVs are parsed and typed once, indexed once, and composed into `ParcelConflictCase` records. Conflict Explorer uses those parcel cases for queueing and investigation. Reconciliation reconstructs the same case from route identifiers and joins the reconciliation proposal, evidence, geometry, and history. Reviewer/session state is stored separately from dataset state.

The route carries stable parcel/conflict identifiers plus Conflict Explorer view context. Refreshing Reconciliation rebuilds the workspace from dataset indexes. Returning from Reconciliation restores the selected parcel/conflict and available search/filter/sort/page context.

## Files changed in the final integration/audit stage

- `src/App.jsx`
- `src/components/ConflictExplorer.jsx`
- `src/components/GeometryEvidenceMap.jsx`
- `src/components/ParcelConflictCaseDetail.jsx`
- `src/components/ReconciliationEntry.jsx`
- `src/data/geometryViewport.js`
- `src/data/spatialConflictAnalysis.js` (new)
- `src/data/reconciliationWorkspace.js`
- `src/data/reviewerStateService.js`
- `src/navigation/workspaceNavigation.js`
- `src/styles.css`
- `scripts/final-regression-audit.mjs`
- `scripts/validate-layer34-fixes.mjs` (new)
- `scripts/verify-source-compile.mjs` (new)
- `scripts/production-build.mjs`
- `scripts/validate-reconciliation-workspace.mjs`
- `package.json`
- `package-lock.json`
- `README.md`
- `VALIDATION.md`
- `WORKFLOW_INTEGRATION_REPORT.md` (new)
- `FINAL_AUDIT_REPORT.md` (new)
- `FINAL_DELIVERY.md` (new)

The runtime public-data tree was also reduced to the required production tables; unused adapter/visual-world directories and evaluation-only material are not part of the dashboard data boundary.

## Production dataset consumption

The shared runtime loads and indexes every required production table once. Functional use by the conflict workflow is:

| Dataset file | Conflict Explorer / Investigation | Reconciliation |
| --- | --- | --- |
| `1 Source_inputs/SOURCE_METADATA.csv` | Source provenance and evidence-source metadata | Proposal/evidence source provenance |
| `1 Source_inputs/SOURCE_SPECIFIC_SCHEMA.csv` | Shared runtime schema/source index | Shared runtime schema/source index |
| `2 Source_geometry/SOURCE_GEOMETRIES.csv` | Evidence geometry and spatial comparison | Relevant source geometry comparison |
| `4 Matching/SOURCE_OBSERVATIONS.csv` | Evidence-chain observations/confidences | Matched observations and selected-conflict evidence |
| `5 Conflicts/CONFLICTS.csv` | Queue, case grouping, conflict selector/details | Selected and unresolved conflict context |
| `5 Conflicts/CONFLICT_EVIDENCE.csv` | Conflict evidence chain | Evidence supporting selected/unresolved conflicts |
| `5 Conflicts/CONFLICTS_REJECTED_PROVENANCE.csv` | Indexed parcel-case provenance context | Available through the shared case/runtime model |
| `6 Reconciliation/RECONCILED_PARCELS.csv` | Case-level review/reconciliation availability | Primary proposal/status/confidence record |
| `7 Authoritative_state/CANONICAL_PARCELS.csv` | Current parcel metadata/state | Current-state proposal comparison |
| `7 Authoritative_state/GEOMETRY_VERSIONS.csv` | Current/history geometry context | Current/proposed/version geometry comparison |
| `8 History/HISTORICAL_PARCELS.csv` | Historical/retired parcel resolution | Historical current-state resolution |
| `8 History/PARCEL_LINEAGE.csv` | History shortcut / lineage context | Reconciliation history/lineage support |
| `8 History/GEOGIT_EVENTS.csv` | History shortcut / parcel events | Reconciliation history support |

Files under `99 Eval only/` are not runtime inputs.

## Dataset-value policy

No dataset-derived aggregate or record value is encoded as an expected UI answer. Visible counts, filter facets/counts, statuses, source/category values, evidence/history totals, confidences, areas, IDs, dates, and geometry are calculated or read from the loaded runtime model. Presentation configuration such as page size or viewport dimensions is not a dataset value.

## Layer 3 + 4 repair additions

- Reconciliation entry is now gated by the selected conflict itself. Resolved conflicts are read-only even when another conflict on the same parcel remains open.
- Direct/reloaded routes to resolved conflicts are rejected with `SELECTED_CONFLICT_NOT_OPEN`.
- Reconciliation's conflict list disables non-open conflicts instead of routing them into an invalid reviewer workflow.
- Spatial conflict views derive source-edge discrepancy highlights from the actual source geometries.
- Touching neighbours/shared boundaries are derived from authoritative geometry versions and shown as topology impact context.
- Proposal modification is field-oriented and generated from the dataset `proposed_state`, while remaining reviewer-local prototype state.
- Dataset URLs use Vite `BASE_URL`, so deployments under a subpath do not assume the site root.
- The old CDN-dependent fallback production build has been removed.
