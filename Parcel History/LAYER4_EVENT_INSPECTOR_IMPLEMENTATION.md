# PRAMAN Layer 4 — Event Inspector Implementation

## Scope

This build extends the existing Parcel History screen only. It does not redesign global navigation or alter the Layer 4 parcel directory, current/proposed/historical state contract, Conflict Explorer, Reconciliation, Evidence Graph, or other dashboards.

## Interaction rule

Selecting a timeline event now opens the Event Inspector only. It does not automatically change the right-hand parcel-state inspector.

If the selected event resolves to a real historical effective state, the Event Inspector exposes **VIEW STATE AT THIS POINT**. Only that explicit action switches the right-hand inspector to **HISTORICAL STATE**. The serialized `currentAuthoritative` payload remains unchanged. **RETURN TO CURRENT STATE** continues to restore the authoritative-current view.

## Event Inspector content

The primary drawer exposes only normalized, user-facing fields when they exist:

- event type and subtype
- effective and recorded dates
- parcel version before/after
- geometry version before/after
- source and source record
- authority/review status
- related conflict IDs
- related parent/child parcel relationship
- short description

No raw event JSON is rendered.

### Survey / physical observation

Uses dataset-backed survey fields from `SOURCE_OBSERVATIONS`:

- survey/source type
- observation date
- record/survey status
- observation geometry ID
- observed area
- positional accuracy
- CRS where recorded

### Geometry change

Only real geometry transitions remain geometry-change events. The inspector now receives:

- prior geometry ID
- resulting geometry ID
- prior area
- resulting area
- change reason
- acceptance status
- geometry status

The before/after geometry and area values are resolved from `GEOMETRY_VERSIONS`; they are not inferred from timeline ordering.

### Official approval

Shows the resulting parcel version and explicit authority status. A separate effective date is shown only when the dataset has one; the recorded timestamp remains separately visible.

### Mutation

No field changes are fabricated. If the dataset does not contain an explicit field-level or geometry delta, the inspector states that no delta is recorded rather than inferring owner, tenure, area, or geometry changes from the existence of a mutation event.

### Split / Merge

Split shows parent parcel(s), resulting child parcel(s), and effective date.

Merge shows input parent parcel(s), resulting parcel(s), and effective date.

These remain event-focused and do not embed the full lineage graph.

### Conflict

Conflict events now receive structured conflict records from the existing `CONFLICTS` / `CONFLICT_EVIDENCE` adapter data. The inspector can show:

- conflict type
- sources involved
- conflict status
- affected field/geometry concept
- explanation
- recommended next evidence where recorded

No resolution text is fabricated because the current conflict table does not provide a dedicated resolution field.

Each conflict case exposes **Open Conflict Case** and an Evidence Graph context link.

### Administrative metadata

No extra event-specific analytics are added. The generic event record remains restrained, with developer-oriented data hidden under Technical Provenance.

## Progressive technical provenance

A collapsed **Technical Provenance** disclosure contains only values actually present, including:

- source table
- GeoGit event ID
- GeoGit commit ID if one ever becomes available
- split/merge transaction/event ID
- observation ID
- internal event ID
- adapter event key

The current dataset contains GeoGit event IDs but does not contain actual commit hashes or parent-commit hashes, so those values are not invented.

## Deep links and return state

Conflict Explorer and Evidence Graph are not embedded in Layer 4. The Event Inspector generates context links and adds a `returnTo` parameter containing the exact current Layer 4 path, query string, and hash.

Default integration paths are:

- `/conflict-explorer`
- `/evidence-graph`

They can be overridden by the host application with:

- `VITE_CONFLICT_EXPLORER_PATH`
- `VITE_EVIDENCE_GRAPH_PATH`

The full external dashboards are not present inside this standalone Layer 4 archive, so the route helper is deliberately configurable rather than rewriting global routing.

## Data-contract additions

The normalized event payload was extended only with dataset-backed inspector fields:

- `geometry_before`
- `geometry_after`
- `area_before_sqm`
- `area_after_sqm`
- `observation_geometry_id`
- `observed_area_sqm`
- `positional_accuracy_m`
- `survey_status`
- `measurement_crs`
- `surveyor_source`
- `conflict_details`

`conflict_details` remains structured data; the UI renders selected fields rather than dumping it.

## Validation

All previous Layer 4 suites pass together with the new Event Inspector suite.

Validated dataset-derived cases include:

- 229 survey events with real observation geometry/status information
- 83 real geometry-change events with before/after geometry and area
- 536 normalized conflict timeline events with structured conflict details
- 16 mutation events with no geometry transition, confirming that mutation does not imply geometry change
- 56 split timeline records
- 92 merge timeline records
- 195 event/state combinations capable of offering historical-state inspection

The existing authoritative-state checks remain unchanged: 1,000 current authoritative parcel states, 60 historical identities without current authority, 243 pending proposals, and 26 rejected proposals.

## Changed source scope

Existing files intentionally changed:

- `layer4.historyLineage.adapter.cjs`
- `scripts/build-layer4-index.cjs`
- `src/ParcelTimeline.jsx`
- `src/parcelTimeline.css`

Added:

- `src/layer4DeepLinks.js`
- `layer4.eventInspector.test.mjs`
- this implementation note
- Event Inspector validation report

Other pre-existing source files remain unchanged from the previous Layer 4 State Separation build.

## Build environment note

This runtime does not contain the project's npm dependencies, so `vite build` cannot run here (`vite` is not installed). JSX/module syntax was independently parsed successfully with the available TypeScript transpiler, and all Layer 4 data/model regression tests pass.
