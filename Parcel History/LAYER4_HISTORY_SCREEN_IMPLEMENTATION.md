# PRAMAN Layer 4 — Individual Parcel History Screen

## Scope implemented

This build extends the existing Layer 4 parcel directory with the individual Parcel History screen only. It does not build the full Current State panel or a standalone lineage graph.

Opening a parcel from the directory preserves the existing query-string route and search/filter parameters. The detail view uses the existing `?parcel=<canonicalParcelId>` pattern. `← All Parcels` removes only the parcel parameter, restoring the directory with its previous filters/search parameters intact.

## Screen layout

Desktop uses a restrained two-column layout:

- Left: chronological historical event timeline.
- Right: sticky Current Parcel State shell.

On narrower screens the layout becomes one column, keeping the history first and placing the current-state shell after it.

The header contains only the back control, canonical parcel ID, land-use/category where actually available, and current lifecycle status.

## Timeline event semantics

The screen consumes the normalized Layer 4 event classes directly:

- `SURVEY_OBSERVATION` — blue — ◎
- `GEOMETRY_CHANGE` — purple — ◇
- `OFFICIAL_APPROVAL` — green — ✓
- `MUTATION` — orange — ↺
- `SPLIT` — gold — ⑂
- `MERGE` — indigo — ⋈
- `CONFLICT` — red — !
- `ADMINISTRATIVE_METADATA` — grey — •

Every category therefore has colour, symbol and text. Colour is not the only semantic cue.

Each event visibly exposes its category, detailed subtype, effective/recorded date label, description when recorded, source when recorded, and parcel-version transition when recorded.

Events are grouped by year. Dated events are ordered chronologically using `effective_date` first and `recorded_date` when no effective date exists. Events with no recorded date remain undated and are placed after dated history rather than receiving a fabricated date.

## Geometry-change correction

The previous adapter emitted every row in `GEOMETRY_VERSIONS` as `GEOMETRY_CHANGE`. That was semantically incorrect.

The adapter now emits a geometry-change event only when the geometry row explicitly contains `supersedes_geometry_id`.

Consequences in the current dataset:

- canonical baseline G1 geometries are not presented as changes;
- reconstructed historical H1 geometry is not presented as a change;
- all 83 emitted geometry-change events have both a prior geometry and a resulting geometry;
- proposed, accepted and rejected G2 geometry changes remain visible with their actual status without being promoted to current authority.

## Mutation correction

Mutation remains independent of geometry change. The UI never infers a geometry change from a mutation event.

The current dataset contains 16 normalized mutation events without a geometry-version transition; these remain orange mutation events rather than being recoloured/reclassified as geometry changes.

## Approval/rejection correction

The earlier adapter normalized both `PROPOSAL_ACCEPTED` and `PROPOSAL_REJECTED` as `OFFICIAL_APPROVAL`. That could render a rejected proposal as green acceptance.

This build reserves `OFFICIAL_APPROVAL` for `PROPOSAL_ACCEPTED`. `PROPOSAL_REJECTED` preserves its subtype and `REJECTED` authority status but is not classified or rendered as approval.

Current dataset validation:

- 731 `PROPOSAL_ACCEPTED` events map to `OFFICIAL_APPROVAL` with `ACCEPTED` authority status.
- 26 `PROPOSAL_REJECTED` events do not map to `OFFICIAL_APPROVAL` and retain `REJECTED` authority status.

## Split and merge presentation

The timeline remains event-focused; it does not render the full lineage graph.

Lineage edge records that describe the same parcel transaction are deterministically grouped for display using event type, subtype, date, source and description. The original records remain available to the Event Inspector.

- Split uses a small branch indicator.
  - On a parent parcel it reports the recorded descendant count.
  - On a child parcel it reports that the parcel resulted from a recorded parent split.
- Merge uses a small convergence indicator.
  - On a resulting child it reports the recorded parent count.
  - On a parent it reports the recorded successor relationship.

No parent/child relationship is inferred outside `PARCEL_LINEAGE`-derived event data.

## Event Inspector

Selecting a timeline event opens an in-place inspector drawer and does not navigate away.

The collapsed timeline does not show full metadata. The inspector exposes only recorded values, including where available:

- effective and recorded dates;
- source/source table/source record IDs;
- event IDs;
- authority/review status;
- parcel version before/after;
- geometry version before/after;
- parent/child parcels;
- conflict IDs;
- event description.

Missing dates and sources are reported as not recorded rather than synthesized.

## Current State shell

The right-side shell is intentionally incomplete for this prompt.

It binds only to `states.currentAuthoritative` from the established Layer 4 adapter and shows a restrained subset: authoritative status, parcel version, accepted geometry version and authoritative effective timestamp when present.

It never consumes proposed/reconciled state. Historical retired parcel identities receive `currentAuthoritative: null` and the shell states that no current authoritative state is attached to that identity.

## Data payload change

Generated parcel detail files now use schema `layer4-history-v2` and preserve the normalized Layer 4 contract rather than converting events into the old source-specific timeline shape.

The detail payload includes:

- parcel header metadata;
- authoritative-current shell data only;
- lineage relationships;
- normalized event records.

Geometry WKT is deliberately omitted from the browser detail payload because this screen does not render geometry and does not need the payload weight.

## Regression scope

The following existing files remain byte-for-byte unchanged from the previous landing build:

- `dataset.repository.js`
- `server.js`
- `parcelTimeline.routes.js`
- `parcelTimeline.service.js`
- `src/ParcelHistoryLanding.jsx`
- `src/parcelHistoryLanding.css`
- `src/main.jsx`
- `src/app.css`
- `package.json`
- `vite.config.js`
- `index.html`

No Layer 2, Conflict Explorer, Reconciliation, Evidence Graph or global navigation implementation is introduced or changed in this archive.

## Build-environment limitation

The source/data test suite passes. A Vite production build could not be executed in this container because project npm dependencies are not installed and `npm install` timed out. No `node_modules` or stale `dist` output is included. The archive retains the same package configuration as the prior landing build.
