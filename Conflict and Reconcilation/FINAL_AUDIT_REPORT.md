# Prompt 7 — Final Dataset-Dependency and Regression Audit

## Result

The final regression audit passes against the supplied production dataset and the integrated Conflict Explorer → Reconciliation workflow.

## What the audit verifies

- stale old-world assumptions and cross-port navigation are absent from application source;
- visible dashboard counts and confidence values come from runtime rows/records rather than illustrative constants;
- conflict types, statuses, severity values, criticality values, source types, and cells are discovered from the loaded cases and disappear when absent from a tested dataset projection;
- parcel cases with multiple conflicts retain all conflict IDs, support conflict switching, represent mixed open/resolved state, and pass the correct unresolved context into reconciliation;
- historical-only conflicted parcels resolve through historical records and supporting lineage/history rather than being substituted with a current parcel;
- spatial investigation and reconciliation use parsed dataset WKT/geometry-version records only, with viewport bounds computed from the displayed geometry;
- round-trip navigation preserves the selected parcel/conflict and Conflict Explorer context;
- invalid parcel/conflict routes fail cleanly instead of choosing an arbitrary fallback;
- reviewer activity is stored separately from dataset state with stable parcel/conflict/action identifiers;
- the production data manifest contains only the required operational tables and excludes evaluation-only material;
- the production build completes successfully and emits the runtime application and production data boundary.

## Dataset-dependent values

No current dataset aggregate is encoded into the application as an expected answer. Queue totals, summaries, filter counts, evidence/source totals, conflict counts, history counts, confidence displays, area/state values, and geometry content are derived from the loaded records. UI mechanics such as pagination size and SVG viewport dimensions are presentation configuration, not dataset values.
