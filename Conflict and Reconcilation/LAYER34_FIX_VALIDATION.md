# Layer 3 + 4 Repair Validation

This package remains a single combined application with two downstream responsibilities:

`Conflict Explorer / case investigation` → former Layer 4 responsibility

`Reconciliation workspace` → former Layer 3 responsibility

They share one dataset runtime and one URL/state flow.

## Repairs completed

1. **Resolved-conflict reconciliation guard**
   - Reconciliation is enabled only when the selected conflict is OPEN.
   - Mixed parcels no longer allow a RESOLVED conflict to enter reviewer actions just because another conflict is open.
   - Reloaded/direct resolved-conflict URLs return `SELECTED_CONFLICT_NOT_OPEN`.
   - Resolved conflicts remain visible in Reconciliation but are disabled/read-only.

2. **Spatial discrepancy highlighting**
   - Source A and Source B polygon edges are compared from parsed dataset geometry.
   - The map highlights the largest derived source-edge separation indicators.
   - The displayed separation is derived from geometry and explicitly kept separate from the dataset's own conflict values.

3. **Shared-boundary / neighbour impact**
   - Touching parcels are derived from authoritative geometry versions.
   - Shared boundary segments and derived shared length are shown for the selected parcel.
   - Spatial maps can overlay authoritative shared boundaries; no adjacency labels are hardcoded.

4. **Proposal editing**
   - Raw JSON-only editing was replaced by fields generated from `RECONCILED_PARCELS.proposed_state`.
   - Reviewer modifications remain isolated in local reviewer/session state and do not mutate CSV-derived facts.

5. **Deployment robustness**
   - Runtime dataset URLs use Vite `BASE_URL` rather than assuming `/`.
   - The CDN-dependent fallback production build was removed.
   - `npm run build` requires a real local Vite install after `npm install`.
   - `npm run verify:compile` validates source/import correctness without creating a fake production build.

## Regression results

All of these pass on the repaired source package:

- `npm run audit:migration`
- `npm run audit:runtime`
- `npm run audit:conflict-ui`
- `npm run audit:case-workspace`
- `npm run audit:reconciliation`
- `npm run audit:layer34-fixes`
- `npm run audit:final`
- `npm run verify:compile`

Key dataset-derived regression coverage during the final run:

- 715 conflict records audited
- 530 parcel conflict cases audited
- 142 multi-conflict parcel cases retained by the runtime
- 38 historical conflict cases retained
- 286 parcel cases have at least one OPEN conflict and reconstruct an editable reconciliation workspace
- 244 resolved-only cases remain read-only
- 329 unresolved conflict references resolve through the reconciliation runtime
- 4,312 source geometries and 1,143 geometry versions remain parseable/indexed
- all configured production relationship checks resolve without mock fallback

The targeted mixed-case test uses `IN-DL-110054-1-75`: `CNF-00523` is OPEN and reconstructs Reconciliation, while `CNF-00018` is RESOLVED and is rejected as read-only.

No dataset-derived count above is encoded into the application UI as a hardcoded expected value; the audit values are outputs of the current supplied dataset.
