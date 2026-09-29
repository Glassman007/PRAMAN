# Stage 1 Migration Audit

## Removed from old Conflict Explorer

- separate Reconciliation frontend URL and port navigation
- old reconciliation API fallback contract
- static assignment options and assignment-stage mutation endpoints
- assignee-based queue behavior
- queue-age sorting/display
- hardcoded high-risk/escalated/unassigned summary semantics
- frontend-only Suggested / In Progress / Escalated conflict statuses
- generic confidence sorting/export/display
- `parcel-grid.png`
- fixed Canonical-vs-Survey geometry comparison contract
- static queue CSV export schema tied to the previous model

## Removed from old Reconciliation workspace

- separate Conflict Review frontend URL and port navigation
- old `/api/conflicts`, parcel reconciliation, audit, and decision API contract
- Revenue / Survey / Canonical three-column source assumption
- recommendation object contract from the old backend
- generic recommendation/conflict confidence presentation
- old static source labels and source-specific field assumptions
- old decision/audit server-session assumptions

## Preserved as reusable architecture

- a single React/Vite application shell
- same-origin Conflict → Reconcile navigation primitives
- CSV parsing and dataset repository layer
- real WKT geometry parsing foundation
- runtime facet derivation
- independent confidence/reliability field discovery

## Production-data boundary

The application public data tree is built from the supplied `PRAMAN_DATA` directory with `99 Eval only` explicitly excluded. No evaluation table is referenced by application code.
