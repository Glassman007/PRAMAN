#!/usr/bin/env python3
"""Build PRAMAN Source & Schema Mapping audit/data contract from the dataset.

This script is intentionally read-only. It does not infer undocumented mappings.
It reads only dataset structures relevant to the pre-match Source & Schema Mapping stage.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
import re
from pathlib import Path
from typing import Any

NULL_TOKENS = {"", "na", "n/a", "null", "none", "nan"}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [dict(r) for r in csv.DictReader(f)]


def split_semicolon(value: str | None) -> list[str]:
    if not value:
        return []
    return [x.strip() for x in value.split(";") if x.strip()]


def is_null(value: Any) -> bool:
    if value is None:
        return True
    return str(value).strip().lower() in NULL_TOKENS


def safe_json(value: str) -> tuple[dict[str, Any], bool]:
    if is_null(value):
        return {}, True
    try:
        parsed = json.loads(value)
        return (parsed if isinstance(parsed, dict) else {}), isinstance(parsed, dict)
    except Exception:
        return {}, False


def observed_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int) and not isinstance(value, bool):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "string"




def validate_value_against_type(value: Any, data_type: str | None, allowed: str | None = None) -> bool:
    """Validate only type/range rules that are explicitly represented by DATA_DICTIONARY."""
    if is_null(value):
        return True
    dt = (data_type or "").strip().lower()
    raw = str(value).strip()
    try:
        if "json" in dt:
            json.loads(raw)
            return True
        if "date" in dt:
            import datetime as _dt
            _dt.date.fromisoformat(raw)
            return True
        if "integer" in dt:
            int(raw)
            return True
        if "decimal" in dt or "number" in dt:
            number = float(raw)
            allowed_text = (allowed or "").replace("–", "-").replace("—", "-")
            if "0-1" in allowed_text.replace(" ", ""):
                return 0 <= number <= 1
            return True
        if "wkt" in dt:
            return geometry_type(raw) is not None
        return True
    except Exception:
        return False


def datatype_violation_counts(rows: list[dict[str, str]], definitions: list[dict[str, str]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for d in definitions:
        field = d.get("field_name", "")
        if not field:
            continue
        bad = sum(1 for row in rows if not validate_value_against_type(row.get(field), d.get("data_type"), d.get("enum_or_allowed_values")))
        out[field] = bad
    return out

def basic_field_profile(rows: list[dict[str, str]], fields: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in fields:
        values = [r.get(field, "") for r in rows]
        populated = [v for v in values if not is_null(v)]
        counts = Counter(str(v) for v in populated)
        sample = populated[0] if populated else None
        out[field] = {
            "records": len(values),
            "populated": len(populated),
            "null_or_empty": len(values) - len(populated),
            "unique_populated": len(counts),
            "duplicate_value_occurrences": sum(n - 1 for n in counts.values() if n > 1),
            "sample_value": sample,
            "observed_value_types": sorted({observed_type(v) for v in populated}),
        }
    return out


def geometry_type(wkt: str | None) -> str | None:
    if is_null(wkt):
        return None
    m = re.match(r"\s*([A-Za-z]+)", str(wkt))
    return m.group(1).upper() if m else None


def wkt_bounds(wkts: list[str]) -> dict[str, float] | None:
    # Dataset-derived EPSG:4326 bounds without introducing a GIS dependency.
    # The supplied source geometries are 2D WKT; coordinate pairs are extracted
    # from the normalized WKT and aggregated.
    pair = re.compile(r"(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)")
    xs: list[float] = []
    ys: list[float] = []
    for wkt in wkts:
        for a, b in pair.findall(wkt or ""):
            xs.append(float(a)); ys.append(float(b))
    if not xs:
        return None
    return {"min_x": min(xs), "min_y": min(ys), "max_x": max(xs), "max_y": max(ys)}


def build_contract(dataset_root: Path) -> dict[str, Any]:
    paths = {
        "SOURCE_METADATA": dataset_root / "1 Source_inputs" / "SOURCE_METADATA.csv",
        "SOURCE_SPECIFIC_SCHEMA": dataset_root / "1 Source_inputs" / "SOURCE_SPECIFIC_SCHEMA.csv",
        "SOURCE_GEOMETRIES": dataset_root / "2 Source_geometry" / "SOURCE_GEOMETRIES.csv",
        "MATCHING_INPUT_VIEW": dataset_root / "3 Adapter" / "MATCHING_INPUT_VIEW.csv",
        "SOURCE_OBSERVATIONS": dataset_root / "4 Matching" / "SOURCE_OBSERVATIONS.csv",
        "CANONICAL_PARCELS": dataset_root / "7 Authoritative_state" / "CANONICAL_PARCELS.csv",
        "DATA_DICTIONARY": dataset_root / "99 Eval only" / "DATA_DICTIONARY.csv",
        "VALIDATION_SUMMARY": dataset_root / "99 Eval only" / "VALIDATION_SUMMARY.csv",
    }
    tables = {name: read_csv(path) for name, path in paths.items()}

    dd = tables["DATA_DICTIONARY"]
    defs_by_sheet: dict[str, list[dict[str, str]]] = {}
    for row in dd:
        defs_by_sheet.setdefault(row.get("sheet_name", ""), []).append(row)

    schema_by_type = {r["source_type"]: r for r in tables["SOURCE_SPECIFIC_SCHEMA"]}
    geometry_by_type: dict[str, list[dict[str, str]]] = {}
    for r in tables["SOURCE_GEOMETRIES"]:
        geometry_by_type.setdefault(r.get("source_type", ""), []).append(r)
    normalized_by_type: dict[str, list[dict[str, str]]] = {}
    for r in tables["MATCHING_INPUT_VIEW"]:
        normalized_by_type.setdefault(r.get("source_type", ""), []).append(r)

    normalized_fields = [d["field_name"] for d in defs_by_sheet.get("MATCHING_INPUT_VIEW", [])]
    geometry_schema = defs_by_sheet.get("SOURCE_GEOMETRIES", [])
    geometry_fields = [d["field_name"] for d in geometry_schema]
    normalized_definition_by_field = {d.get("field_name", ""): d for d in defs_by_sheet.get("MATCHING_INPUT_VIEW", [])}
    geometry_definition_by_field = {d.get("field_name", ""): d for d in geometry_schema}
    source_contracts: list[dict[str, Any]] = []

    for meta in tables["SOURCE_METADATA"]:
        source_type = meta["source_type"]
        source_id = meta["source_id"]
        schema = schema_by_type.get(source_type, {})
        rows = normalized_by_type.get(source_type, [])
        geos = geometry_by_type.get(source_type, [])

        declared = set(split_semicolon(schema.get("source_specific_keys")))
        required = set(split_semicolon(schema.get("required_keys")))
        historical_nullable = set(split_semicolon(schema.get("historical_nullable_keys")))
        parsed_rows: list[dict[str, Any]] = []
        invalid_json = 0
        missing_required_by_key: Counter[str] = Counter()
        empty_required_by_key: Counter[str] = Counter()
        empty_strict_required_by_key: Counter[str] = Counter()
        historical_nullable_empty_by_key: Counter[str] = Counter()
        rows_with_missing_required = 0
        rows_with_empty_required = 0
        rows_with_empty_strict_required = 0
        unexpected_by_key: Counter[str] = Counter()
        rows_with_unexpected = 0
        key_value_profiles: dict[str, list[Any]] = {k: [] for k in sorted(declared)}

        for row in rows:
            details, valid = safe_json(row.get("source_specific_details", ""))
            if not valid:
                invalid_json += 1
            parsed_rows.append(details)
            missing = []
            empty = []
            empty_strict = []
            for key in required:
                if key not in details:
                    missing.append(key)
                    missing_required_by_key[key] += 1
                    continue
                value = details.get(key)
                if is_null(value):
                    empty.append(key)
                    empty_required_by_key[key] += 1
                    if key in historical_nullable:
                        historical_nullable_empty_by_key[key] += 1
                    else:
                        empty_strict.append(key)
                        empty_strict_required_by_key[key] += 1
            if missing:
                rows_with_missing_required += 1
            if empty:
                rows_with_empty_required += 1
            if empty_strict:
                rows_with_empty_strict_required += 1
            extras = set(details.keys()) - declared
            if extras:
                rows_with_unexpected += 1
                for key in extras:
                    unexpected_by_key[key] += 1
            for key in declared:
                key_value_profiles.setdefault(key, []).append(details.get(key))

        specific_profile: dict[str, Any] = {}
        for key, values in key_value_profiles.items():
            populated = [v for v in values if not is_null(v)]
            string_values = [json.dumps(v, sort_keys=True) if isinstance(v, (dict, list)) else str(v) for v in populated]
            specific_profile[key] = {
                "records": len(values),
                "populated": len(populated),
                "null_or_empty": len(values) - len(populated),
                "unique_populated": len(set(string_values)),
                "duplicate_value_occurrences": sum(n - 1 for n in Counter(string_values).values() if n > 1),
                "observed_value_types": sorted({observed_type(v) for v in populated}),
                "sample_value": populated[0] if populated else None,
            }

        geometry_ids = {g.get("geometry_id", "") for g in geos if not is_null(g.get("geometry_id"))}
        nonblank_geometry_refs = [r.get("geometry_id", "") for r in rows if not is_null(r.get("geometry_id"))]
        referenced_geometry_ids = set(nonblank_geometry_refs)
        geometry_ref_counts = Counter(nonblank_geometry_refs)
        blank_geometry_refs = sum(1 for r in rows if is_null(r.get("geometry_id")))
        shared_geometry_ids = {gid: n for gid, n in geometry_ref_counts.items() if n > 1}

        quality_flags = Counter(g.get("geometry_quality_flag", "") for g in geos if not is_null(g.get("geometry_quality_flag")))
        original_crs = Counter(g.get("original_crs", "") for g in geos if not is_null(g.get("original_crs")))
        normalized_crs = Counter(g.get("normalized_crs", "") for g in geos if not is_null(g.get("normalized_crs")))
        norm_methods = Counter(g.get("normalization_method", "") for g in geos if not is_null(g.get("normalization_method")))
        normalized_geometry_types = Counter(geometry_type(g.get("normalized_geometry_wkt")) for g in geos if geometry_type(g.get("normalized_geometry_wkt")))
        normalized_bounds = wkt_bounds([g.get("normalized_geometry_wkt", "") for g in geos if not is_null(g.get("normalized_geometry_wkt"))])
        geometry_field_profile = basic_field_profile(geos, geometry_fields) if geos else {}

        # Explicit geometry normalization is the only field-level transformation
        # relationship represented in the supplied pre-match dataset. Preserve a
        # small number of real examples so the standalone UI can preview the
        # actual operation without inventing demo values.
        geometry_transform_examples: list[dict[str, Any]] = []
        for g in geos:
            if is_null(g.get("normalization_method")):
                continue
            geometry_transform_examples.append({
                "geometry_id": g.get("geometry_id"),
                "source_record_ids": g.get("source_record_ids"),
                "original_crs": g.get("original_crs"),
                "original_geometry_wkt": g.get("original_geometry_wkt"),
                "normalized_crs": g.get("normalized_crs"),
                "normalized_geometry_wkt": g.get("normalized_geometry_wkt"),
                "normalization_method": g.get("normalization_method"),
            })
            if len(geometry_transform_examples) >= 3:
                break

        geometry_mapping_relationships = []
        if norm_methods:
            geometry_mapping_relationships = [
                {
                    "source_field": "original_crs",
                    "target_field": "normalized_crs",
                    "rule_metadata_field": "normalization_method",
                    "affected_records": sum(
                        1 for g in geos
                        if not is_null(g.get("original_crs"))
                        and not is_null(g.get("normalized_crs"))
                        and not is_null(g.get("normalization_method"))
                    ),
                },
                {
                    "source_field": "original_geometry_wkt",
                    "target_field": "normalized_geometry_wkt",
                    "rule_metadata_field": "normalization_method",
                    "affected_records": sum(
                        1 for g in geos
                        if not is_null(g.get("original_geometry_wkt"))
                        and not is_null(g.get("normalized_geometry_wkt"))
                        and not is_null(g.get("normalization_method"))
                    ),
                },
            ]

        normalized_type_violations = datatype_violation_counts(rows, defs_by_sheet.get("MATCHING_INPUT_VIEW", []))
        geometry_type_violations = datatype_violation_counts(geos, geometry_schema)

        exception_rows: list[dict[str, Any]] = []
        exception_record_snapshots: dict[str, Any] = {}
        geometry_by_id = {g.get("geometry_id", ""): g for g in geos if not is_null(g.get("geometry_id"))}

        def remember_record(row: dict[str, str], details: dict[str, Any]) -> None:
            oid = row.get("observation_id", "")
            if not oid or oid in exception_record_snapshots:
                return
            gid = row.get("geometry_id", "")
            exception_record_snapshots[oid] = {
                "raw_source_record_available": False,
                "raw_source_record_note": "The supplied dataset does not contain upstream raw source-record tables. MATCHING_INPUT_VIEW is already the normalized pre-match source state.",
                "normalized_record": row,
                "preserved_source_native_attributes": details,
                "geometry": geometry_by_id.get(gid),
            }

        def add_issue(row: dict[str, str] | None, *, category: str, field: str, original_value: Any = None, rule: str | None = None, related_mapping: str | None = None, geometry_row: dict[str, str] | None = None) -> None:
            issue_index = len(exception_rows) + 1
            oid = row.get("observation_id", "") if row else ""
            record_id = row.get("source_record_id", "") if row else (geometry_row or {}).get("geometry_id", "")
            exception_rows.append({
                "issue_id": f"{source_id}:ISSUE:{issue_index:05d}",
                "source_id": source_id,
                "source_type": source_type,
                "observation_id": oid or None,
                "record_identifier": record_id or None,
                "field": field,
                "original_value": original_value,
                "issue_category": category,
                "schema_rule": rule,
                "related_mapping_or_transformation": related_mapping,
                "resolution_status": None,
            })
            if row is not None:
                details, _ = safe_json(row.get("source_specific_details", ""))
                remember_record(row, details)

        observation_counts = Counter(r.get("observation_id", "") for r in rows if not is_null(r.get("observation_id")))
        source_record_counts = Counter(r.get("source_record_id", "") for r in rows if not is_null(r.get("source_record_id")))
        seen_observation: Counter[str] = Counter()
        seen_source_record: Counter[str] = Counter()

        for row in rows:
            details, valid = safe_json(row.get("source_specific_details", ""))
            if not valid:
                add_issue(row, category="INVALID_SOURCE_SPECIFIC_JSON", field="source_specific_details", original_value=row.get("source_specific_details"), rule="source_specific_details must be a JSON object")
                details = {}
            for key in sorted(required):
                if key not in details:
                    add_issue(row, category="REQUIRED_KEY_MISSING", field=key, original_value=None, rule="SOURCE_SPECIFIC_SCHEMA.required_keys", related_mapping=f"source_specific_details.{key}")
                elif key not in historical_nullable and is_null(details.get(key)):
                    add_issue(row, category="REQUIRED_VALUE_EMPTY", field=key, original_value=details.get(key), rule="SOURCE_SPECIFIC_SCHEMA.required_keys", related_mapping=f"source_specific_details.{key}")
            for key in sorted(set(details.keys()) - declared):
                add_issue(row, category="UNDECLARED_SOURCE_KEY", field=key, original_value=details.get(key), rule="SOURCE_SPECIFIC_SCHEMA.source_specific_keys", related_mapping=f"source_specific_details.{key}")

            for field, definition in normalized_definition_by_field.items():
                value = row.get(field)
                if not validate_value_against_type(value, definition.get("data_type"), definition.get("enum_or_allowed_values")):
                    add_issue(row, category="DATATYPE_VIOLATION", field=field, original_value=value, rule=f"DATA_DICTIONARY: {definition.get('data_type') or 'datatype'}")

            gid = row.get("geometry_id", "")
            if is_null(gid):
                add_issue(row, category="GEOMETRY_REFERENCE_MISSING", field="geometry_id", original_value=gid, rule="Normalized source record has no geometry reference")
            elif gid not in geometry_ids:
                add_issue(row, category="GEOMETRY_REFERENCE_UNRESOLVED", field="geometry_id", original_value=gid, rule="MATCHING_INPUT_VIEW.geometry_id must resolve to SOURCE_GEOMETRIES.geometry_id")

            oid = row.get("observation_id", "")
            if not is_null(oid):
                seen_observation[oid] += 1
                if observation_counts[oid] > 1 and seen_observation[oid] > 1:
                    add_issue(row, category="DUPLICATE_OBSERVATION_ID", field="observation_id", original_value=oid, rule="observation_id uniqueness")
            srid = row.get("source_record_id", "")
            if not is_null(srid):
                seen_source_record[srid] += 1
                if source_record_counts[srid] > 1 and seen_source_record[srid] > 1:
                    add_issue(row, category="DUPLICATE_SOURCE_RECORD_ID", field="source_record_id", original_value=srid, rule="source_record_id uniqueness")

        referenced_set = set(nonblank_geometry_refs)
        transformation_failure_count = 0
        transformation_failure_by_target: Counter[str] = Counter()
        for g in geos:
            for field, definition in geometry_definition_by_field.items():
                value = g.get(field)
                if not validate_value_against_type(value, definition.get("data_type"), definition.get("enum_or_allowed_values")):
                    # Geometry rows can be joined back to source records where observation_ids contains one or more ids.
                    oid = split_semicolon(g.get("observation_ids"))[0] if split_semicolon(g.get("observation_ids")) else ""
                    row = next((r for r in rows if r.get("observation_id") == oid), None)
                    add_issue(row, category="DATATYPE_VIOLATION", field=field, original_value=value, rule=f"DATA_DICTIONARY: {definition.get('data_type') or 'datatype'}", geometry_row=g)
            if not is_null(g.get("normalization_method")):
                for source_field, target_field in [("original_crs", "normalized_crs"), ("original_geometry_wkt", "normalized_geometry_wkt")]:
                    if is_null(g.get(source_field)) or is_null(g.get(target_field)):
                        transformation_failure_count += 1
                        transformation_failure_by_target[target_field] += 1
                        oid = split_semicolon(g.get("observation_ids"))[0] if split_semicolon(g.get("observation_ids")) else ""
                        row = next((r for r in rows if r.get("observation_id") == oid), None)
                        add_issue(row, category="TRANSFORMATION_FAILURE", field=target_field, original_value=g.get(source_field), rule=g.get("normalization_method"), related_mapping=f"{source_field}->{target_field}", geometry_row=g)
            gid = g.get("geometry_id", "")
            if gid and gid not in referenced_set:
                add_issue(None, category="UNREFERENCED_GEOMETRY_ROW", field="geometry_id", original_value=gid, rule="SOURCE_GEOMETRIES.geometry_id is not referenced by selected-source MATCHING_INPUT_VIEW rows", geometry_row=g)

        common_profile = basic_field_profile(rows, normalized_fields)
        for field, profile in common_profile.items():
            profile["datatype_violation_count"] = int(normalized_type_violations.get(field, 0))
            profile["expected_data_type"] = normalized_definition_by_field.get(field, {}).get("data_type") or None
        for field, profile in specific_profile.items():
            profile["datatype_violation_count"] = None
            profile["expected_data_type"] = None
        for field, profile in geometry_field_profile.items():
            profile["datatype_violation_count"] = int(geometry_type_violations.get(field, 0))
            profile["expected_data_type"] = geometry_definition_by_field.get(field, {}).get("data_type") or None

        total_values = sum(int(p.get("records", 0)) for p in list(common_profile.values()) + list(specific_profile.values()))
        populated_values = sum(int(p.get("populated", 0)) for p in list(common_profile.values()) + list(specific_profile.values()))
        null_values = total_values - populated_values
        duplicate_value_occurrences = sum(int(p.get("duplicate_value_occurrences", 0) or 0) for p in list(common_profile.values()) + list(specific_profile.values()))
        datatype_violations_total = sum(normalized_type_violations.values()) + sum(geometry_type_violations.values())
        exception_categories = dict(sorted(Counter(i["issue_category"] for i in exception_rows).items()))

        source_contracts.append({
            "source_id": source_id,
            "source_type": source_type,
            "metadata": meta,
            "declared_source_schema": {
                "source_specific_keys": sorted(declared),
                "required_keys": sorted(required),
                "historical_nullable_keys": sorted(historical_nullable),
                "lifecycle_metadata_fields": split_semicolon(schema.get("lifecycle_metadata_fields")),
                "purpose": schema.get("purpose", ""),
            },
            "data_character": "spatial + attribute" if geos else "attribute only",
            "normalized_source_state": {
                "table": "MATCHING_INPUT_VIEW",
                "record_count": len(rows),
                "common_field_profile": common_profile,
                "source_specific_field_profile": specific_profile,
            },
            "spatial_metadata": {
                "geometry_record_count": len(geos),
                "records_without_geometry_reference": blank_geometry_refs,
                "referenced_geometry_ids_missing_from_geometry_table": len(referenced_geometry_ids - geometry_ids),
                "unreferenced_geometry_rows": len(geometry_ids - referenced_geometry_ids),
                "geometry_ids_referenced_by_multiple_records": len(shared_geometry_ids),
                "additional_record_references_to_shared_geometries": sum(n - 1 for n in shared_geometry_ids.values()),
                "original_crs_frequencies": dict(sorted(original_crs.items())),
                "normalized_crs_frequencies": dict(sorted(normalized_crs.items())),
                "geometry_quality_flags": dict(sorted(quality_flags.items())),
                "normalization_methods": dict(sorted(norm_methods.items())),
                "normalized_geometry_type_frequencies": dict(sorted(normalized_geometry_types.items())),
                "normalized_bounds": normalized_bounds,
                "geometry_field_profile": geometry_field_profile,
                "geometry_transform_examples": geometry_transform_examples,
                "geometry_mapping_relationships": geometry_mapping_relationships,
            },
            "schema_quality": {
                "invalid_source_specific_json_records": invalid_json,
                "records_with_missing_declared_required_keys": rows_with_missing_required,
                "missing_required_key_counts": dict(sorted(missing_required_by_key.items())),
                "records_with_empty_declared_required_values": rows_with_empty_required,
                "empty_required_value_counts": dict(sorted(empty_required_by_key.items())),
                "records_with_empty_non_historical_nullable_required_values": rows_with_empty_strict_required,
                "empty_non_historical_nullable_required_value_counts": dict(sorted(empty_strict_required_by_key.items())),
                "historical_nullable_empty_value_counts": dict(sorted(historical_nullable_empty_by_key.items())),
                "records_with_undeclared_source_specific_keys": rows_with_unexpected,
                "undeclared_source_specific_key_counts": dict(sorted(unexpected_by_key.items())),
                "duplicate_observation_ids": len(rows) - len({r.get("observation_id", "") for r in rows}),
                "duplicate_source_record_ids": len(rows) - len({r.get("source_record_id", "") for r in rows}),
            },
            "quality_and_exceptions": {
                "total_values_evaluated": total_values,
                "populated_values": populated_values,
                "null_or_empty_values": null_values,
                "completeness_ratio": (populated_values / total_values) if total_values else None,
                "duplicate_value_occurrences": duplicate_value_occurrences,
                "datatype_violation_count": datatype_violations_total,
                "schema_conformance_issue_count": len(exception_rows),
                "transformation_failure_count": transformation_failure_count,
                "transformation_failure_counts_by_target": dict(sorted(transformation_failure_by_target.items())),
                "exception_category_counts": exception_categories,
                "exceptions": exception_rows,
                "exception_record_snapshots": exception_record_snapshots,
                "raw_source_records_available": False,
                "raw_source_record_note": "The supplied dataset does not contain upstream raw source-record tables; MATCHING_INPUT_VIEW is already normalized pre-match source state.",
                "geometry_validity_available": False,
                "mapping_coverage_available": False,
                "categorical_validation_available": False,
            },
            "adapter_and_mapping": {
                "adapter_registry_available": False,
                "explicit_non_geometry_field_mapping_rules_available": False,
                "field_mapping_confidence_available": False,
                "normalized_output_table": "MATCHING_INPUT_VIEW",
                "source_native_fields_preserved_in": "source_specific_details",
                "explicit_geometry_transformation_available": bool(norm_methods),
            },
            "versioning": {
                "source_dataset_version_metadata_available": False,
                "note": "GeoGit/canonical versions exist later in the pipeline, but source-dataset version metadata is not present in the pre-match source tables.",
            },
        })

    table_catalog: dict[str, Any] = {}
    for p in sorted(dataset_root.rglob("*.csv")):
        rows = read_csv(p)
        table_catalog[p.stem] = {
            "path": str(p.relative_to(dataset_root)).replace("\\", "/"),
            "record_count": len(rows),
            "columns": list(rows[0].keys()) if rows else [],
        }

    normalized_schema = defs_by_sheet.get("MATCHING_INPUT_VIEW", [])
    canonical_schema = defs_by_sheet.get("CANONICAL_PARCELS", [])
    source_observation_columns = set(table_catalog["SOURCE_OBSERVATIONS"]["columns"])
    matching_input_columns = set(table_catalog["MATCHING_INPUT_VIEW"]["columns"])

    lifecycle_declared = sorted({f for s in tables["SOURCE_SPECIFIC_SCHEMA"] for f in split_semicolon(s.get("lifecycle_metadata_fields"))})
    lifecycle_in_pre_match = sorted(set(lifecycle_declared) & matching_input_columns)
    lifecycle_only_later = sorted((set(lifecycle_declared) & source_observation_columns) - matching_input_columns)

    relevant_validation = []
    validation_discrepancies = []
    for row in tables.get("VALIDATION_SUMMARY", []):
        check = row.get("validation_check", "")
        detail = row.get("detail", "")
        hay = (check + " " + detail).lower()
        if any(token in hay for token in ["source-specific", "source observation", "matching input", "source geometry", "geometry crs", "acquisition"]):
            relevant_validation.append(row)
        if check == "Matching input leakage isolation" and "source parcel" in detail.lower() and "excluded" in detail.lower() and "source_parcel_id" in matching_input_columns:
            validation_discrepancies.append({
                "check": check,
                "summary_claim": detail,
                "observed_current_dataset": "MATCHING_INPUT_VIEW.csv contains the source_parcel_id column.",
            })

    return {
        "contract_version": 3,
        "dataset_root_name": dataset_root.name,
        "scope": {
            "starts_at": "RAW SOURCE",
            "ends_at": "NORMALIZED SOURCE STATE",
            "normalized_source_state_table": "MATCHING_INPUT_VIEW",
            "excluded_stages": ["parcel matching", "conflict resolution", "reconciliation", "authoritative-state selection"],
            "matching_stage_table_not_used_for_dashboard_values": "SOURCE_OBSERVATIONS",
        },
        "table_catalog": table_catalog,
        "sources": source_contracts,
        "normalized_source_schema": normalized_schema,
        "source_geometry_schema": geometry_schema,
        "canonical_schema_reference": {
            "table": "CANONICAL_PARCELS",
            "read_only_reference_only": True,
            "fields": canonical_schema,
            "domains": [],
            "required_optional_metadata_available": False,
            "explicit_source_to_canonical_mapping_table_available": False,
        },
        "lineage_contract": {
            "record_provenance_keys": [f for f in ["observation_id", "source_type", "source_record_id", "source_parcel_id"] if f in matching_input_columns],
            "identifier_fields_present_in_normalized_source_state": [f for f in ["observation_id", "source_record_id", "source_parcel_id"] if f in matching_input_columns],
            "upstream_raw_identifier_mapping_available": False,
            "geometry_lineage": {
                "join_key": "geometry_id",
                "from": "MATCHING_INPUT_VIEW.geometry_id",
                "to": "SOURCE_GEOMETRIES.geometry_id",
                "explicit_transform_fields": ["original_crs", "original_geometry_wkt", "normalized_crs", "normalized_geometry_wkt", "normalization_method"],
            },
            "non_geometry_raw_field_mapping_lineage_available": False,
            "reason": "The dataset preserves source-specific values and normalized common fields, but does not include a rule table identifying which raw field produced each normalized non-geometry field.",
        },
        "source_schema_history": {
            "available": False,
            "events": [],
            "schema_versions": [],
            "mapping_versions": [],
            "templates": [],
            "note": "No source import/schema/mapping version history is present in the pre-match dataset. Later GeoGit parcel history is outside this module.",
        },
        "lifecycle_metadata": {
            "declared_fields": lifecycle_declared,
            "available_in_pre_match_normalized_view": lifecycle_in_pre_match,
            "present_only_in_later_SOURCE_OBSERVATIONS_table": lifecycle_only_later,
        },
        "validation_outputs": {
            "relevant_validation_summary_rows": relevant_validation,
            "detected_discrepancies": validation_discrepancies,
            "note": "VALIDATION_SUMMARY is an eval-only artifact; current CSV structure takes precedence where the summary text conflicts with the files.",
        },
        "feature_support": {
            "detected_sources": True,
            "source_metadata": True,
            "declared_source_specific_schema": True,
            "normalized_source_state": True,
            "record_and_field_statistics": True,
            "spatial_metadata": True,
            "geometry_crs_normalization_trace": True,
            "explicit_geometry_transformation_relationships": True,
            "schema_conformance_checks": True,
            "quality_exception_queue": True,
            "field_level_quality": True,
            "raw_source_records": False,
            "normalized_record_snapshots_for_detected_exceptions": True,
            "mapping_impact_analysis": True,
            "source_schema_history": False,
            "mapping_configuration_export": True,
            "canonical_schema_reference": True,
            "categorical_normalization_rules": False,
            "editable_mapping_state": False,
            "explicit_adapter_names_or_registry": False,
            "explicit_non_geometry_raw_to_normalized_mapping_rules": False,
            "field_mapping_confidence_or_evidence": False,
            "source_dataset_version_history": False,
            "pre_match_lifecycle_metadata": bool(lifecycle_in_pre_match),
        },
        "unavailable_or_omitted": [
            "Exact adapter/processor registry and adapter names are not present in the supplied dataset.",
            "Explicit non-geometry raw-field → normalized-field mapping rules are not present.",
            "Field-level mapping confidence/evidence is not present; record-level geometry/attribute/identifier confidence must not be relabeled as mapping confidence.",
            "Source dataset version identifiers/history are not present in the pre-match source tables.",
            "Upstream raw source-record tables are not present; full original-vs-normalized record comparison is therefore unavailable.",
            "Source/schema/mapping edit history, reviewers, approvals/rejections, and reusable mapping templates are not present in the pre-match dataset.",
            "Lifecycle metadata fields declared by SOURCE_SPECIFIC_SCHEMA are not exposed by MATCHING_INPUT_VIEW; they appear in the later SOURCE_OBSERVATIONS matching-stage table and are excluded from this pre-match module.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    contract = build_contract(args.dataset_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(contract, indent=2, ensure_ascii=False), encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
