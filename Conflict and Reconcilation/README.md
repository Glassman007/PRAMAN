# PRAMAN Conflict → Reconcile

This project contains the completed conflict-review workflow rebuilt against the supplied PRAMAN production dataset.

The operational flow is:

`Conflict Explorer → Parcel Conflict Case → Reconcile → Return to Conflict Explorer`

Conflict Explorer is the only conflict/reconciliation-related top-level entry. Reconciliation is a hidden downstream workspace that reconstructs its parcel and conflict context from stable dataset identifiers, including after a page refresh.

## Runtime architecture

`pramanDataService.js` loads the required production CSVs once, normalizes typed values, parses JSON/ID collections/WKT, builds lookup indexes, and derives parcel-level conflict cases. Conflict Explorer, case investigation, and Reconciliation consume this shared model rather than maintaining independent mock/API contracts.

Reviewer decisions are prototype session state only. They are persisted separately from CSV-derived records and keyed by stable parcel/conflict/action identifiers. Returning from Reconciliation restores the relevant parcel/conflict and available Conflict Explorer search/filter/sort/page context while showing reviewer activity separately from original dataset status.

No runtime file under `99 Eval only/` is loaded, copied into the public production-data tree, or used to make reviewer decisions.

## Run

```bash
npm install
npm run dev
```

The production-data manifest is regenerated before development and build commands.

## Validate

```bash
npm run audit:migration
npm run audit:runtime
npm run audit:conflict-ui
npm run audit:case-workspace
npm run audit:reconciliation
npm run audit:layer34-fixes
npm run audit:final
npm run verify:compile
npm run build
```

`npm run build` now requires a real local Vite installation and emits a normal bundled production build. The old CDN-dependent fallback was removed. Run `npm install` before building. `npm run verify:compile` is dependency-light source/import verification and does not create a substitute production `dist`.

See `LAYER34_FIX_VALIDATION.md`, `WORKFLOW_INTEGRATION_REPORT.md`, `FINAL_AUDIT_REPORT.md`, and `VALIDATION.md` for the final integration and regression results.
