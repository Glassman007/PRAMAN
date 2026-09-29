# PRAMAN Layer 4 — Parcel History & Lineage Landing Screen

## Scope implemented

This stage implements only the first Parcel History & Lineage screen:

`FIND PARCEL -> OPEN PARCEL HISTORY`

It does not add lineage graphs, maps, confidence/source graphs, conflict analytics, Evidence Graph views, GeoGit visualizations, or dashboard statistics cards.

## Data source

The landing index is generated from the existing `Layer4HistoryLineageAdapter`; no second history/lineage source of truth was introduced.

Generator:

```bash
npm run generate:layer4 -- /path/to/PRAMAN_DATA
```

or:

```bash
PRAMAN_DATASET_DIR=/path/to/PRAMAN_DATA npm run generate:layer4
```

Generated data lives under `public/layer4-data/` and is read-only UI data derived from the Layer 4 contract.

## Search contract

Searchable fields are only:

- canonical parcel ID
- source / legacy parcel IDs from source provenance
- locality where authoritative locality exists
- cell

Owner/name is intentionally not part of the landing search index.

## Filter contract

All option values are derived from the generated dataset index:

- Status / state marker
- Land Use
- Cell
- History Type
- Include historical / superseded parcel records

`PROPOSED` and `SUPERSEDED` are secondary state markers. They never replace the row's primary authoritative status. An active parcel with a pending proposal therefore remains `ACTIVE` in the parcel-status column.

## Row contract

Each parcel identity produces exactly one row. Multiple source observations never produce duplicate rows.

Rows expose only:

- parcel ID
- locality/cell context
- authoritative land use when available
- primary parcel status
- latest dated meaningful normalized event
- event date
- compact split/merge lineage marker
- open control

Administrative metadata is excluded from "latest meaningful event".

## Navigation/state

The existing query-based detail route is preserved:

`?parcel=<canonicalParcelId>`

The landing search/filter values are stored in the URL. Opening a parcel pushes a new history state without deleting those parameters, so browser Back restores the prior search/filter state.

The existing `ParcelTimeline.jsx` detail dashboard was not redesigned. A dataset-derived static compatibility payload is generated for each parcel so selecting a row can still open the existing detail screen without changing its visual implementation.

## Existing navigation

The uploaded archive does not contain the project's global PRAMAN navigation component. No replacement navigation was invented, and no global-navigation behavior was changed.

## Visual treatment

The new landing page uses a restrained dark presentation:

- neutral near-black background
- thin separators
- one prominent search field
- collapsible filters
- compact horizontal rows
- no landing-page gradients
- no landing-page shadows
- no cards used for parcel rows

## Files added

- `src/ParcelHistoryLanding.jsx`
- `src/parcelHistoryLanding.css`
- `scripts/build-layer4-index.cjs`
- `public/layer4-data/index.json`
- `public/layer4-data/parcels/*.json`
- `layer4.landing.test.cjs`

## Existing files intentionally changed

- `src/App.jsx` — makes the parcel finder the first screen and preserves the existing parcel detail view behind `?parcel=`.
- `src/api.js` — reads the generated Layer 4 index/detail compatibility data first and retains the old API as a fallback.
- `package.json` — adds only the `generate:layer4` script.

## Existing files verified unchanged

The following original files remain byte-for-byte unchanged from the prior Layer 4 adapter package:

- `layer4.historyLineage.adapter.cjs`
- `layer4.historyLineage.adapter.test.cjs`
- `dataset.repository.js`
- `parcelTimeline.routes.js`
- `parcelTimeline.service.js`
- `server.js`
- `src/ParcelTimeline.jsx`
- `src/parcelTimeline.css`
- `src/main.jsx`
- `vite.config.js`
- `index.html`
- previous Layer 4 audit/test reports
