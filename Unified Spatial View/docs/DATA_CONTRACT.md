# Replacement view-model contract

The default contains no records. No ID prefix, parcel count, spatial layout, building count or display CRS is assumed. Input is a plain, structured-cloneable object. Arrays omitted from the input default to empty. IDs are exact strings; no renumbering, trimming or canonical identity inference occurs.

| Collection | Fields consumed by the shell |
|---|---|
| metadata | study_area; coverage_source_ids (explicit source IDs required for coverage) |
| parcels | id (unique nonempty string), is_active (required boolean), name, authority_status, area_sqm, current_owner, land_use, address, locality, geometry, crs, provenance |
| sources | parcel_id, id, source_id, source_name, layer_id, holder, area_sqm, date, verification_status, geometry, crs, provenance |
| conflicts | parcel_id, id, type, severity, source_a, observed_a, source_b, observed_b, description, review_status, layer_ids (explicit relevance requirements) |
| recommendations | parcel_id, conflict_id, explanation, decision_status |
| history | parcel_id, date or year, event_type, owner_or_recorded_person, area_sqm, verification_state, event_note |
| documents | parcel_id, source_name, reference, verification_status |
| comparisons | parcel_id, label, value, unit, method, provenance |
| floodImpact | parcel_id, flood_affected, building_affected, high_confidence_beneficiary, ownership_conflict, boundary_conflict, requires_field_verification, asset_category, compensation_readiness, active_claimant_records, flood_damage, ownership_confidence, boundary_confidence |

All child records must reference a stored parcel. Multiple sources, conflicts, recommendations, history events and documents are retained; no last-row-wins indexing. Flood assessment accepts one summary per parcel; the upstream importer must aggregate asset-level observations without assuming one building per parcel. Flags accept boolean true or the string `Yes`. Confidence display accepts numbers within 0–1; no confidence decision threshold is embedded.

IDs, array shapes, explicit activity and child parcel references are validated before dataset replacement. Geometry/topology/CRS, units, authority, source namespaces, comparison methods, historical lineage and temporal semantics require validation in the next-stage importer. Unknown extra fields are preserved. Invalid input throws to the caller and leaves the previous dataset and UI state intact.

Source geometry is optional. Revenue area does not create a polygon. Missing survey geometry does not fall back to canonical geometry. Polygon/MultiPolygon validation and metric computation are intentionally not implemented in this stage. A parcel need not have geometry to appear in its information panel. Source comparisons show every supplied observation rather than choosing an authoritative row.

History uses supplied date/year, sorts dated records chronologically, and places undated entries last in input order. It neither generates timeline snapshots nor implements a version graph. Documents are references only, with no invented download action.

`layer_ids` is an explicit list whose members must all be selected for a conflict to count as relevant. Unknown/missing relevance is not guessed from conflict prose. Relevant record count is not a visible-map count. Coverage counts distinct active parcels with all declared required sources; without a denominator or declared source requirements it displays unknown.

Dataset field mappings must be developed from the actual replacement workbook, which was not included in this ZIP. This contract is the boundary between that importer and the shell, not a claim that workbook columns already match these fields.

## Stage 4 superseding extension

The default page now loads `data/normalized-map.json`; the original empty-input adapter behavior remains available. The preceding descriptions of geometry as future work are superseded by `STAGE4_DATA_INTEGRATION.md` and the validated offline importer. `parcels` contains canonical records; `historicalParcels` contains retired identities. Child UI rows may reference either. Additional normalized collections: cells, buildingFootprints (source-observed only), buildingRecords, sourceGeometry, observations, reconciliation, conflictEvidence, lineage, geoGitReferences, geometryVersions, sourceMetadata, sourceSchema. No missing dataset field is filled with a guessed cadastral fact. Local Polygon/MultiPolygon coordinates are `[X,Z]` metres with the projection/origin held in metadata. Geometry validity is checked offline by Shapely; runtime checks array/type/ring/coordinate integrity. Canonical layer toggling controls actual parcel visibility. History remains tabular; geometry versions and conflicts are stored, not drawn.

## Stage 7 temporal extension

`data/temporal-model.js` is the single temporal model for map/history/lineage/GeoGit. `temporal-details.json` adds verified source supersedes/source/reason fields without altering geometry. Authority uses explicit canonical activity/status and accepted referenced geometry. Reconstructions use end-of-recorded-day precision, never future/proposed/rejected boundaries. Missing historical geometry is reported. Building history is unavailable and never inferred from parcel lifecycle. Full source mapping and limits are in `STAGE7_TEMPORAL_REPORT.md`.


## Stage 8 evidence boundary

`data/evidence-model.js` joins supplied observation associations, geometry, conflict evidence and reconciliation to deterministic diagnostic geometry in `evidence-map.json`. Difference geometry and exact shared edges are derived display diagnostics, not new conflict or authority records. No source geometry fallback is allowed. See STAGE8_EVIDENCE_REPORT.md for mapping and missing dimensions.
