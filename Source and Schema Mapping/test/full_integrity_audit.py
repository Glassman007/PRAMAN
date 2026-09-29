#!/usr/bin/env python3
from __future__ import annotations
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
sys.path.insert(0, str(PKG / "scripts"))
from build_data_contract import build_contract, geometry_type, is_null, safe_json  # noqa: E402


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [dict(row) for row in csv.DictReader(f)]


def fail(msg: str) -> None:
    raise AssertionError(msg)


dataset = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (PKG.parent / "PRAMAN_DATA")
contract_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else (PKG / "data-contract.json")
if not dataset.exists():
    raise SystemExit(f"PRAMAN_DATA is required for full integrity audit; dataset not found at {dataset}")

stored = json.loads(contract_path.read_text(encoding="utf-8"))
rebuilt = build_contract(dataset)
assert stored == rebuilt, "stored contract does not reproduce from current dataset"

meta_rows = read_csv(dataset / "1 Source_inputs" / "SOURCE_METADATA.csv")
schema_rows = read_csv(dataset / "1 Source_inputs" / "SOURCE_SPECIFIC_SCHEMA.csv")
normalized_rows = read_csv(dataset / "3 Adapter" / "MATCHING_INPUT_VIEW.csv")
geometry_rows = read_csv(dataset / "2 Source_geometry" / "SOURCE_GEOMETRIES.csv")

meta_by_id = {row["source_id"]: row for row in meta_rows}
schema_by_type = {row["source_type"]: row for row in schema_rows}
normalized_by_type: dict[str, list[dict[str, str]]] = {}
geometry_by_type: dict[str, list[dict[str, str]]] = {}
for row in normalized_rows:
    normalized_by_type.setdefault(row.get("source_type", ""), []).append(row)
for row in geometry_rows:
    geometry_by_type.setdefault(row.get("source_type", ""), []).append(row)

assert len(stored["sources"]) == len(meta_rows), "detected source count differs from SOURCE_METADATA"

for source in stored["sources"]:
    sid = source["source_id"]
    stype = source["source_type"]
    assert sid in meta_by_id, f"unknown source in contract: {sid}"
    assert stype == meta_by_id[sid]["source_type"]
    assert source["metadata"] == meta_by_id[sid]

    rows = normalized_by_type.get(stype, [])
    geos = geometry_by_type.get(stype, [])
    assert source["normalized_source_state"]["record_count"] == len(rows), f"record count mismatch for {sid}"
    assert source["spatial_metadata"]["geometry_record_count"] == len(geos), f"geometry count mismatch for {sid}"
    assert source["data_character"] == ("spatial + attribute" if geos else "attribute only")

    declared = set(source["declared_source_schema"].get("source_specific_keys", []))
    profile_fields = set(source["normalized_source_state"].get("source_specific_field_profile", {}).keys())
    assert profile_fields == declared, f"source-native field profile mismatch for {sid}"

    # Samples must be actual values from the selected source's normalized rows.
    for field, profile in source["normalized_source_state"].get("common_field_profile", {}).items():
        sample = profile.get("sample_value")
        if sample is not None:
            assert any(str(row.get(field, "")) == str(sample) for row in rows), f"non-real common-field sample for {sid}:{field}"

    parsed = [safe_json(row.get("source_specific_details", ""))[0] for row in rows]
    for field, profile in source["normalized_source_state"].get("source_specific_field_profile", {}).items():
        sample = profile.get("sample_value")
        if sample is not None:
            assert any(str(obj.get(field)) == str(sample) for obj in parsed if field in obj), f"non-real source-native sample for {sid}:{field}"

    # Spatial facts must be independently reproducible from SOURCE_GEOMETRIES.
    crs = Counter(row.get("original_crs", "") for row in geos if not is_null(row.get("original_crs")))
    norm_crs = Counter(row.get("normalized_crs", "") for row in geos if not is_null(row.get("normalized_crs")))
    geom_types = Counter(geometry_type(row.get("normalized_geometry_wkt")) for row in geos if geometry_type(row.get("normalized_geometry_wkt")))
    assert source["spatial_metadata"]["original_crs_frequencies"] == dict(sorted(crs.items()))
    assert source["spatial_metadata"]["normalized_crs_frequencies"] == dict(sorted(norm_crs.items()))
    assert source["spatial_metadata"]["normalized_geometry_type_frequencies"] == dict(sorted(geom_types.items()))

    geo_lookup = {row.get("geometry_id"): row for row in geos}
    for example in source["spatial_metadata"].get("geometry_transform_examples", []):
        gid = example.get("geometry_id")
        assert gid in geo_lookup, f"transformation example not found in SOURCE_GEOMETRIES for {sid}"
        real = geo_lookup[gid]
        for key, value in example.items():
            assert str(real.get(key, "")) == str(value if value is not None else ""), f"transformation sample mismatch {sid}:{gid}:{key}"

    # Every exception must point back to the selected source and, when possible, to a real normalized record.
    rows_by_obs = {row.get("observation_id"): row for row in rows if row.get("observation_id")}
    exceptions = source.get("quality_and_exceptions", {}).get("exceptions", [])
    for issue in exceptions:
        assert issue.get("source_id") == sid and issue.get("source_type") == stype
        oid = issue.get("observation_id")
        if oid:
            assert oid in rows_by_obs, f"exception references unknown observation {sid}:{oid}"
            snapshot = source["quality_and_exceptions"].get("exception_record_snapshots", {}).get(oid)
            assert snapshot, f"exception snapshot missing for {sid}:{oid}"
            assert snapshot.get("normalized_record") == rows_by_obs[oid]

# Production code must not contain current source-specific identifiers, names, types or source-native schema fields.
production_files = [
    *sorted((PKG / "src").rglob("*.js")),
    *sorted((PKG / "src").rglob("*.jsx")),
    *sorted((PKG / "demo").rglob("*.js")),
    *sorted((PKG / "demo").rglob("*.jsx")),
]
production_text = "\n".join(path.read_text(encoding="utf-8") for path in production_files)
for source in stored["sources"]:
    for literal in [source["source_id"], source["source_type"], source.get("metadata", {}).get("source_name", "")]:
        if literal and literal in production_text:
            fail(f"hardcoded source-specific literal found in production code: {literal}")
    for field in source.get("declared_source_schema", {}).get("source_specific_keys", []):
        # Only exact string literals count here; ordinary UI words can legitimately overlap a field name.
        literal_patterns = [f'"{field}"', f"'{field}'", f'`{field}`']
        if field and any(token in production_text for token in literal_patterns):
            fail(f"hardcoded source-native field literal found in production code: {field}")

ui_text = (PKG / "src" / "dashboard" / "SourceSchemaMappingWorkspace.jsx").read_text(encoding="utf-8")
for forbidden in ["Authoritative Canonical Parcel", "Reconciled Parcel", "Matched Parcel"]:
    assert forbidden not in ui_text, f"semantic boundary regression: {forbidden}"
assert "EXCEPTION_PAGE_SIZE" in ui_text and "pagedExceptions" in ui_text, "exception queue is not bounded/paginated"

css = (PKG / "src" / "dashboard" / "sourceSchemaMapping.css").read_text(encoding="utf-8")
assert ":root{" not in css, "dashboard theme variables leak globally through :root"
assert not re.search(r"(^|\n)\*\{", css), "dashboard CSS contains an unscoped global universal selector"

print(f"full data-integrity audit passed for {len(stored['sources'])} detected sources")
