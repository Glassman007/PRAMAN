# PRAMAN Conflict Explorer — Prompt 3 Report

## Navigation

The conflict/reconciliation flow is now:

`Conflict Explorer → Parcel Conflict Case → Reconcile`

There is no standalone Reconciliation/Reconcile item in the application navigation. Reconciliation can only be entered from a selected parcel conflict case. The selected parcel ID and all conflict IDs are retained in the route/context passed to that entry.

## Conflict Explorer queue

The queue renders one row per `ParcelConflictCase`, not one row per conflict. Each case derives its current/historical state, open and total conflict counts, conflict types, highest severity, highest criticality, human-review requirement, source count, cell, and UI-only case status from the Prompt 2 runtime model.

Case status is not written to the dataset. It is derived as:

- `RESOLVED` when every constituent conflict is resolved.
- `OPEN` when open conflict records are present without resolved records.
- `MIXED` when open and resolved conflict records coexist.
- `OTHER` only for source statuses the runtime cannot classify as open/resolved.

## Dataset-derived controls

Summary values are read from runtime aggregates. Search works across parcel IDs, conflict IDs, locality where available, conflict types, and source types. Filter domains are discovered from the loaded cases for conflict status, conflict type, severity, criticality, human review, source type, current/historical state, and cell.

Filter option counts are contextual: the count for one filter option is recalculated after applying the search and all other active filters, while ignoring only that filter's own current selection.

Sorting is available for parcel ID, open-conflict count, total conflict count, severity, criticality, and human-review requirement. No queue-age field is present.

## Parcel Conflict Case workspace

Selecting a case stays in Conflict Explorer and shows:

- current or historical parcel context;
- every retained `conflict_id`;
- per-conflict source values, status, severity, criticality, and human-review flag;
- dataset explanation and recommended next evidence;
- linked evidence records;
- geometry/version, lineage, GeoGit, and reconciliation join availability.

No mock parcel is substituted for failed lookups.

## Validation

Run:

```bash
npm run audit:runtime
npm run audit:conflict-ui
npm run audit:migration
npm run build
```
