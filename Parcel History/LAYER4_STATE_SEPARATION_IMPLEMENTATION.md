# PRAMAN Layer 4 — Authoritative / Historical / Proposed State Separation

## Scope

This build extends the existing individual Parcel History screen only. It does not redesign global navigation, the parcel directory, Layer 2, Conflict Explorer, Reconciliation, or Evidence Graph.

The implementation treats state separation as a data-selection rule first and a visual rule second.

## 1. Current authoritative state

The right-side default state inspector is titled `CURRENT AUTHORITATIVE STATE`.

A record is allowed into this component only when all of the following are true in the Layer 4 payload:

- `stateType === CURRENT_AUTHORITATIVE`
- `authorityStatus === AUTHORITATIVE`
- source table is `CANONICAL_PARCELS`
- referenced current geometry has `geometryStatus === AUTHORITATIVE`
- referenced current geometry has `acceptedStatus === ACCEPTED`

The adapter already validates the canonical parcel's `current_geometry_id` against those geometry lifecycle fields. The UI adds a second guard through `hasExplicitAuthorityEvidence()` so a malformed payload cannot silently render as authoritative.

Displayed authoritative fields are dataset-backed only:

- Canonical Parcel ID
- current accepted canonical-state version (`canonical_state_version`)
- official geometry ID/version/effective date
- authority status
- area
- recorded owner/holder
- land use
- tenure where present
- geometry status
- last official change where a matching `CANONICAL_STATE_UPDATED` event exists
- open conflict status/count derived from conflicts explicitly marked `OPEN`

`authoritative_version` is deliberately not used as the accepted parcel version because the dataset dictionary identifies it as a legacy geometry-generation marker. `canonical_state_version` is the documented authoritative canonical-state version.

Survey Status is not displayed because `CANONICAL_PARCELS` has no authoritative survey-status field. A GNSS observation is not promoted into an authoritative survey status by inference.

If explicit authority cannot be established, the component shows:

`Authoritative state unavailable from current records`

and a data-quality indicator. It does not choose the newest proposal, geometry, survey, or event as a replacement.

## 2. Historical state

Historical states continue to come from the established adapter and are serialized separately as `historicalStates`.

The two supported dataset-backed historical forms are:

- retired parcel identities from `HISTORICAL_PARCELS`
- superseded geometry states from `GEOMETRY_VERSIONS`

Timeline events are matched to those historical states through recorded parcel-version and geometry-version references. Selecting a matching event changes only the inspector context to `HISTORICAL STATE`.

Historical mode is visually neutral/slate and displays only fields actually available for that historical record:

- version
- effective date/period
- historical parcel ID
- historical geometry
- historical area
- historical land use when available
- historical owner/holder when available
- historical/superseded status
- retirement/supersession reason when available

The current authoritative payload remains present and unchanged in memory while historical mode is selected. A persistent `RETURN TO CURRENT STATE` control clears only the historical inspector selection.

## 3. Proposed state

Proposal data is serialized separately as `proposedChange` and rendered in a separate dashed container titled:

`PROPOSED CHANGE`

`NOT AUTHORITATIVE`

Only two proposal dispositions remain inspectable in this section:

- `PENDING`
- `REJECTED`

An accepted proposal whose reconciliation authority marker is already `AUTHORITATIVE` is no longer treated as a pending proposal. Current authority still comes from `CANONICAL_PARCELS` plus accepted authoritative geometry, never directly from reconciliation JSON.

A rejected proposal remains inspectable and is explicitly labelled `REJECTED`; it is never eligible for current authority.

Proposal fields are shown only where recorded, including owner, land use, area, proposal geometry/reference, reconciliation status, review status, actual criticality reason/evidence text, and unresolved conflict IDs.

When a proposal's geometry ID points to a geometry whose lifecycle status is `PROPOSED` or `REJECTED`, that geometry is carried as non-authoritative proposal geometry. If the proposal merely references an already-authoritative geometry, the geometry is not relabelled as proposed geometry.

`CURRENT → PROPOSED` comparison rows are produced only for fields whose recorded proposal value differs from the current authoritative value.

If there is no pending or retained rejected proposal, the separate proposal section states:

`No pending proposal`

## 4. Interaction semantics

Clicking every timeline event still opens the Event Inspector.

If the event also resolves to a real historical state, Layer 4 additionally switches the right-side state inspector into historical mode. This action does not mutate `currentAuthoritative` and does not write to the dataset.

Closing the Event Inspector does not automatically promote or demote any state. Historical inspection remains explicit until the user selects `RETURN TO CURRENT STATE`.

## 5. Schema change

Generated parcel detail payloads are now `layer4-history-v3` and include:

- `currentAuthoritative`
- `historicalStates`
- `proposedChange`
- existing lineage data
- existing normalized events

The parcel directory index remains one row per parcel identity. Rejected proposals do not add a `PROPOSED` landing marker; only genuinely pending proposals do.

## 6. Validation

Full semantic/regression validation passes across all 1,060 parcel identities:

- 1,000 explicit current authoritative states
- 60 historical identities with no fabricated current state
- 121 inspectable historical states total
- 243 pending proposals
- 26 retained rejected proposals
- 731 accepted proposal events
- all 731 accepted proposal events have corresponding canonical-state update evidence
- 83 genuine geometry-change events remain intact
- 16 mutation events without geometry transitions remain intact

Real transition check:

`IN-DL-110054-1-26`

- current official geometry: `GEO-01-026-G2`
- inspectable historical geometry: `GEO-01-026-G1`
- selecting G1 leaves the current serialized geometry as G2

Rejected geometry check:

`IN-DL-110054-5-88`

- rejected proposal remains separately inspectable
- rejected `GEO-05-088-G2` does not become the official current geometry
- current geometry remains explicitly `AUTHORITATIVE` + `ACCEPTED`

All previous adapter, landing-page, and history-screen regression suites pass after the schema update.

## 7. Build-environment note

The container does not currently have the project's npm dependencies installed. A dependency installation attempt timed out, so a Vite production bundle could not be executed here. Non-JSX JavaScript syntax checks, Layer 4 data generation, adapter tests, landing regression tests, history-screen semantic tests, and the new state-separation test all pass. No stale `dist` build is included.
