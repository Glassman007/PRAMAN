# Delhi Parcel Harmonization Test Dataset (128 parcels)

This pack preserves the filenames and column schemas of the previous 20-parcel dataset while expanding it to **128 parcel cases** across Revenue/Land Records, Registration & Stamps, Survey, MCD, DDA planning, GeoJSON, conflicts, reconciliation recommendations, timeline history, dashboard metrics, and source-quality metrics.

## Geographic scope
All locality names are real and Delhi-only. The dataset is intentionally concentrated in a nearby South-West Delhi / Dwarka belt:
- Kakrola
- Matiala
- Bindapur
- Dabri

The canonical parcel polygons are generated around approximate locality anchors solely for UI/GIS testing. They are **not actual cadastral boundaries**.

## Composition
- Total parcels: 128
- Harmonized / clean parcels: 60
- Conflict parcels: 68
- Timeline-enabled parcels: 128
- Timeline rows: 512 (2012, 2016, 2020, 2025 for every parcel)
- Conflict families: 17

## Conflict families
- Parcel name mismatch: 4 parcels
- Owner mismatch: 4 parcels
- Geometry mismatch: 4 parcels
- Area mismatch: 4 parcels
- Parcel merging: 4 parcels
- Parcel splitting: 4 parcels
- Different addressing / field semantics: 4 parcels
- Different coordinate systems: 4 parcels
- Bad data - needs re-evaluation: 4 parcels
- Digitized but never field verified: 4 parcels
- Parcel overlapping: 4 parcels
- Extra gap between adjacent parcels: 4 parcels
- Invalid topology / self-intersection: 4 parcels
- Legacy digitization errors: 4 parcels
- Mutation / registration history mismatch: 4 parcels
- Survey status mismatch: 4 parcels
- Planning / land-use mismatch: 4 parcels

## Important test-data notice
Locality names and administrative/planning context are real. **All people, ownership claims, parcel IDs, canonical IDs, khasra/survey numbers, deed numbers, mutation numbers, property IDs, areas, valuations, geometries, and historical events are generated test data and do not correspond to real property records.** Do not use this pack for legal, ownership, cadastral, tax, planning, or field-survey decisions.

## Compatibility
The 11 original filenames and their column headers are preserved. Clean parcels use an empty `primary_conflict_type` in CSV and `null` in GeoJSON, with `harmonization_status = HARMONIZED`. Conflict parcels have matching rows in `07_conflicts_2025.csv` and `08_reconciliation_recommendations_2025.csv`.

## Official references used only to validate place/administrative names
- DDA Zone-wise Layout Plan: https://dda.gov.in/zone-wise-layout-plan
- Delhi Revenue list of villages: https://revenue.delhi.gov.in/revenue/list-villages
- Delhi Revenue Sub-Registrar offices: https://revenue.delhi.gov.in/revenue/sub-registar-offices

Generated for software demonstration and testing.
