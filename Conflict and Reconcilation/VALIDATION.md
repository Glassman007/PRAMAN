# Validation

The repaired combined Layer 3 + Layer 4 project was validated against the production dataset with the complete audit chain:

```bash
npm run audit:migration
npm run audit:runtime
npm run audit:conflict-ui
npm run audit:case-workspace
npm run audit:reconciliation
npm run audit:layer34-fixes
npm run audit:final
npm run verify:compile
```

All of the commands above pass.

The validation covers stale old-world assumptions, dataset-derived totals/categories, multi-conflict parcel grouping, mixed OPEN/RESOLVED cases, historical parcels, source/evidence joins, WKT geometry, derived geometry discrepancy indicators, authoritative shared-boundary neighbours, route reconstruction, Conflict → Reconcile → Conflict state restoration, reviewer-state isolation, invalid-route handling, and evaluation-file isolation.

The resolved-conflict guard is tested explicitly: an OPEN conflict reconstructs Reconciliation, while a RESOLVED conflict from the same mixed parcel returns `SELECTED_CONFLICT_NOT_OPEN` and remains read-only.

The old CDN production fallback has been removed. `npm run build` now requires local project dependencies and a real Vite install after `npm install`. This execution environment could not fetch npm packages because registry DNS/package transport was unavailable, so a Vite bundle was not fabricated here. Instead, `npm run verify:compile` successfully transpiled and import-checked all application source modules without generating a substitute CDN-based `dist`.

No `node_modules` or misleading fallback `dist` directory is included in the returned project.
