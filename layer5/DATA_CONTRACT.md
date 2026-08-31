# Layer 5 dataset contract

Layer 5 reads parcel, person, geometry, lineage, and event values directly from
the repository's shared `dataset/` directory. It does not maintain a second
timeline dataset.

## Identity and selection

- `canonical_id` is the stable selector and API identifier.
- `parcel_id` / `parcel_id_ref` are source-system parcel identifiers and are
  returned only as supporting identifiers.
- The parcel selector contains every canonical ID represented by a current
  feature in `06_parcels_2025.geojson`. A parcel does not need a historical row
  to be selectable.
- Option owner text comes from `current_owner` in
  `06_parcels_2025.geojson`. A missing value is presented as unavailable; it is
  never inferred from another person field.

## Current state

`06_parcels_2025.geojson` supplies the current parcel name, owner, area,
confidence, harmonization status, current geometry, timeline availability, and
`merge_group`.

## History and geometry

`09_timeline_history_2012_2025.csv` supplies historical events. Each row becomes
one event and supplies its year, event type, parcel name, recorded person, area,
status, verification state, coordinate system, geometry WKT, conflict type, and
event note.

The file has year precision, so the API and UI preserve the year without
inventing a month or day. Field and area changes are calculated only by
comparing consecutive rows for the same canonical parcel. A geometry change is
reported only when consecutive supplied WKT values differ.

## Lineage

The Dataset has no explicit split parent/child fields. Split lineage is
therefore not generated. Merge relationships are exposed only when current
GeoJSON features share the same non-empty `merge_group`. The member canonical
parcel, source parcel, current area, and current status all come from those
GeoJSON features. Every rendered member therefore exists in the Dataset and is
selectable even when it has no explicit history rows.

## Departmental events

Each current departmental row becomes one source-attributed event when it can
be joined by `canonical_id`. Dates keep their supplied precision; an assessment
year or plan year is not converted into a fabricated day. The source files and
their person fields are:

- `01_revenue_land_records_2025.csv`: `land_owner` and `guardian_name`
- `02_registration_stamps_2025.csv`: `seller_name` and `buyer_name`
- `03_survey_data_2025.csv`: `recorded_person` and `person_role`; also native
  and EPSG:4326 WKT geometry
- `04_mcd_ulb_2025.csv`: `primary_holder` and `holder_role`
- `05_dda_planning_2025.csv`: planning records; no person field
- `06_parcels_2025.geojson`: `current_owner` and current GeoJSON geometry

Revenue events use the supplied mutation date/number, Registration events use
the supplied registration date and deed data, Survey events use the supplied
survey date and geometry, ULB events use the supplied assessment year and
mutation status, and Planning events use the supplied plan year and approval
status. Missing before/after values, confidence, dates, record IDs, or geometry
comparisons remain absent. Departmental rows never overwrite explicit history.

## API

- `GET /api/timeline/parcels` returns lightweight selector records for current
  Dataset parcels:
  `parcelId` (canonical ID), `displayName`, and `owner`.
- `GET /api/parcels/:parcelId/timeline` accepts a canonical ID and returns the
  current GeoJSON state plus sorted, derived history/departmental events and
  explicit merge lineage. Existing parcels can return an empty `events` array;
  IDs absent from GeoJSON return `404 PARCEL_NOT_FOUND`.
