# Parcel Intelligence Platform — Layer 1

Layer 1 answers: **How trustworthy is the current cadastral data?**

## Runtime data flow

`data/*.js` → `parcel_adapter.js` → `app.js`

The generated frontend data files contain the supplied synthetic records. The raw `dataset/` folder is **not required at runtime**.

- `data/parcels.js` — five departmental record sets
- `data/conflicts.js` — supplied conflict cases
- `data/reconciliation.js` — supplied reconciliation recommendations
- `data/metrics.js` — supplied aggregate metrics used for validation
- `data/source_quality.js` — source coverage/verification metadata
- `parcel_adapter.js` — produces one canonical object per parcel
- `app.js` — filtering and UI rendering only

## Status definitions

- **Total Parcels** — unique canonical parcels in the current view.
- **Integrated** — records from Revenue, Survey, Registration, ULB/MCD and Planning/DDA have been linked to the same canonical parcel. Integration does **not** mean the values agree.
- **Conflicts** — integrated parcels with a supplied cross-source discrepancy.
- **Needs Review** — conflict cases whose supplied reconciliation recommendation is `Manual` or `Block`. High-confidence `Suggest` cases are treated as recommendation-ready rather than expert-review cases.
- **Harmonized** — reserved for a parcel whose conflicts are resolved/accepted. It is intentionally not used as a synonym for integration.

With the supplied synthetic dataset, the default overview is expected to show:

- Total Parcels: **20**
- Integrated: **20**
- Conflicts: **20**
- Recommendation-ready conflicts: **4**
- Needs Review: **16**
- High / Medium / Low confidence: **4 / 7 / 9**
- Revenue / Survey / Registration / ULB / Planning coverage: **20 each**

The conflict-heavy distribution is intentional in the supplied synthetic dataset.

## Filters

The supplied current records do not explicitly contain country, state or last-harmonization timestamps, so those controls are disabled rather than populated with invented values. Area remains available from the supplied locality fields.

## Rebuild generated frontend data

If the original project contains `dataset/`, run:

```bash
python build_dataset.py
```

This regenerates all `data/*.js` files, including reconciliation recommendations.

## Run locally

For the integrated Layer 1 → Parcel Timeline flow, run Layer 5 from its project
folder:

```bash
cd ../layer5
npm run dev
```

Then open `http://localhost:3005/layer1/`. The production-style equivalent is
`npm run build`, followed by `npm start`, from `layer5`.

Layer 1 can still be viewed by itself for overview-only development:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. Cross-layer navigation requires the integrated
server above.
