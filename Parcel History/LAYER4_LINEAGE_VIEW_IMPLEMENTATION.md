# PRAMAN Layer 4 — Parcel Lineage View

## Scope implemented

This build adds **Parcel Lineage** as the second Layer 4 view. It is reachable only from the individual Parcel History screen through **PARCEL LINEAGE VIEW**. It does not add a new global-navigation entry and does not replace or duplicate the historical event timeline.

Routing uses the existing Layer 4 parcel query state with `view=lineage`. Returning to Parcel History removes only the view selector. Returning to All Parcels removes `parcel` and `view` while preserving the rest of the directory/search query string.

## Source of truth

The graph uses only `detail.lineage` generated from the established Layer 4 adapter and ultimately from the explicit `PARCEL_LINEAGE` table. It does **not** derive lineage from similar parcel IDs, source IDs, geometry overlap, event proximity, or cell membership.

Current dataset relationship subtypes found in explicit lineage rows:

- `SPLIT`
- `MERGE`
- `REDEVELOPMENT_CONSOLIDATION`
- `CROSS_CELL_SPLIT`
- `CROSS_CELL_MERGE`

The current dataset does not contain explicit lineage rows for creation, duplicate consolidation, rollback/restoration, or a generic superseded/replaced edge. Those relationship types are therefore not fabricated in this view.

## Default interaction

For an active/current parcel:

- default scope: **Ancestors**
- selected parcel appears at the top
- earlier ancestry is positioned downward
- orientation label explicitly states `CURRENT / SELECTED PARCEL ↓ EARLIER ANCESTRY`

For a historical parcel:

- default scope: **Full Lineage**
- later descendants appear above the selected parcel
- earlier ancestry appears below it
- users may switch between **Ancestors**, **Full Lineage**, and **Descendants**

## Progressive graph loading

The view does not fetch the complete parcel directory or pre-render unrelated parcels.

1. Load the selected parcel detail.
2. Load only the immediate parents/children required by the selected scope.
3. `Expand Earlier` loads parents of the current visible frontier.
4. `Expand Descendants` loads children of the current visible frontier.
5. Stop naturally when the explicit lineage table has no further relationship.

The current dataset is one explicit relationship generation deep, so expansion controls correctly disable after the recorded branch is exhausted.

## Node semantics

Nodes show only compact parcel identity information:

- Canonical/Historical parcel ID
- lifecycle label
- area when recorded
- effective/historical period when recorded
- cell ID as context for cross-cell relationships

State styling and labels are semantic:

- current accepted canonical parcel: `CURRENT AUTHORITATIVE`
- retired historical identity: `HISTORICAL`
- superseded/proposed node treatments are supported, but are shown only if the parcel identity itself carries those states
- a pending proposal attached to an otherwise current parcel does **not** relabel that parcel node as proposed

## Node inspector

Clicking a graph node opens a small inspector first. It does not navigate immediately.

The inspector shows:

- Parcel ID
- Status
- Period
- Area
- Cell
- How it originated, based only on incoming explicit lineage edges
- How it ended, based only on outgoing explicit lineage edges
- Parents
- Children

`OPEN FULL HISTORY` is the explicit navigation action from the inspector.

## Split / merge semantics

The graph uses the explicit parent→child lineage edges but does not use arrowheads that could become misleading in the ancestry-oriented layout.

- Split branches remain separate explicit parent/child edges.
- Merge relationships converge through multiple parent edges to the same resulting parcel.
- Relationship labels preserve the dataset subtype.
- Cross-cell relationship edges receive a dashed treatment in addition to their text label.

## Scale controls

Implemented controls:

- Expand Earlier
- Expand Descendants
- Fit Graph
- Reset

The graph canvas is scrollable and only contains the selected lineage context.

## Files added

- `src/ParcelLineage.jsx`
- `src/lineageGraph.js`
- `src/parcelLineage.css`
- `layer4.lineageView.test.mjs`

## Existing files changed

- `src/App.jsx` — adds the isolated `view=lineage` Layer 4 route and return behavior.
- `src/ParcelTimeline.jsx` — adds only the `PARCEL LINEAGE VIEW` action.
- `src/parcelTimeline.css` — styles that action and keeps it responsive.

No existing dataset payloads, Layer 4 adapter logic, Spatial History logic, Event Inspector logic, backend routes, server, package configuration, Layer 2, Conflict Explorer, Reconciliation, Evidence Graph, or global navigation files were changed.
