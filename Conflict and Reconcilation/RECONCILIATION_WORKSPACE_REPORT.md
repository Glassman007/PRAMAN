# PRAMAN Stage 5 — Reconciliation Workspace Report

Stage 5 rebuilds reconciliation as a hidden downstream workspace reached from a parcel conflict investigation. It is not exposed as a home-page card or permanent top-navigation destination.

## Route and reconstruction

The existing single-application query route remains reloadable and carries parcel ID, selected conflict ID, open conflict IDs, and conflict-case context. On load, `reconciliationWorkspace.js` reconstructs the authoritative parcel case from runtime indexes. URL conflict lists are treated as navigation context only; the loaded dataset remains authoritative.

## Dataset model

The workspace joins the selected parcel to `RECONCILED_PARCELS` by `canonical_parcel_id`, then resolves parcel conflicts, conflict evidence, source observations, canonical/historical parcel state, geometry versions, GeoGit events, and lineage references. Historical parcels remain supported rather than being rejected for absence from the current canonical registry.

`proposed_state` is compared only across fields actually present in the parsed JSON. Current values are resolved from the reconciliation authoritative state where the same field exists, otherwise from the current canonical or historical parcel record using explicit field aliases. The UI defaults to differences rather than constructing synthetic fields.

## Confidence and reconciliation state

Overall match, geometry, ownership, land-use, lineage, and reconciliation confidence are rendered independently. Dataset reconciliation fields such as record status, lineage status, match status, criticality, source count, matched source IDs, human-review requirement, unresolved conflicts, and reconciliation timestamp remain CSV-derived facts.

## Evidence and geometry

The proposal evidence chain exposes matched source observations, the selected conflict and its linked evidence, and the parsed reconciliation proposal. Unresolved conflict IDs are individually selectable and resolve through the conflict index.

Spatial comparison uses only dataset geometries: current authoritative/historical geometry, source evidence geometry linked to the selected/unresolved conflicts, and the proposed geometry when its ID resolves. No visual offsets or synthetic polygons are generated.

## Reviewer state separation

Prototype actions (accept, modify, request additional evidence, reject, or escalate) are persisted through `reviewerStateService.js` in browser local storage under a dedicated reviewer-state namespace. Reviewer notes and modified proposal drafts never mutate the CSV-derived runtime records and are visibly labelled as reviewer/session state.

## Validation

`npm run audit:reconciliation` checks every parcel conflict case and verifies historical support, reconciliation joins, unresolved conflicts, matched observations, proposal geometry resolution, independent confidence fields, hidden navigation, and reviewer-state separation.
