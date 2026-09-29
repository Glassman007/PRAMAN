# Stage 2 Runtime Data Model Report

## Result

The Conflict → Reconcile project now uses one cached production dataset runtime shared by both workspaces. The final dashboard UI is intentionally unchanged/not implemented at this stage.

## Derived dataset shape observed during validation

The runtime audit reports conflict, case, multi-conflict, historical-case, source-geometry, and geometry-version counts by calculating them from the supplied CSVs at execution time. No expected dataset totals are stored in application logic or this report.

## Case model

`ParcelConflictCase` is keyed by parcel ID and joins all conflicts for that parcel. It carries current-vs-historical lifecycle context, conflict subsets by status semantics, source/evidence context, human-review requirements, severity and criticality independently, reconciliation state, geometry versions, lineage, GeoGit history, and rejected-provenance context.

## Runtime guarantees

- Required CSVs are fetched once through `pramanDataService.js` and cached.
- Typed parsing occurs once before indexing.
- Exact original CSV values remain available via `__raw`.
- Semicolon-separated ID collections are arrays in the normalized model.
- JSON state/detail fields are objects in the normalized model.
- Source and normalized CRS strings remain attached to geometry records.
- Real WKT coordinates are parsed; no static parcel-image geometry is used.
- Runtime facets/counts come from the loaded rows.
- Evaluation-only files are absent from the application manifest.
- Failed relationships generate development warnings; no mock fallback is inserted.
