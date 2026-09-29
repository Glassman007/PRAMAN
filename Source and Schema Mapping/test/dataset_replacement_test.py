#!/usr/bin/env python3
from __future__ import annotations
import csv
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
sys.path.insert(0, str(PKG / "scripts"))
from build_data_contract import build_contract  # noqa: E402


def read_rows(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames or [], [dict(row) for row in reader]


def write_rows(path: Path, fields: list[str], rows: list[dict[str, str]]):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


dataset = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (PKG.parent / "PRAMAN_DATA")
if not dataset.exists():
    raise SystemExit(f"PRAMAN_DATA is required for dataset replacement test; dataset not found at {dataset}")

original = build_contract(dataset)
assert len(original["sources"]) >= 2, "replacement test requires at least two sources"
first = original["sources"][0]
dropped = original["sources"][-1]
first_id, first_type = first["source_id"], first["source_type"]
drop_id, drop_type = dropped["source_id"], dropped["source_type"]
original_first_count = first["normalized_source_state"]["record_count"]

with tempfile.TemporaryDirectory(prefix="praman-replacement-") as tmp:
    alt = Path(tmp) / "PRAMAN_DATA"
    shutil.copytree(dataset, alt)

    # Remove one detected source coherently from all CSVs that identify it.
    for csv_path in alt.rglob("*.csv"):
        fields, rows = read_rows(csv_path)
        if not rows:
            continue
        filtered = [row for row in rows if row.get("source_id") != drop_id and row.get("source_type") != drop_type]
        if len(filtered) != len(rows):
            write_rows(csv_path, fields, filtered)

    meta_path = alt / "1 Source_inputs" / "SOURCE_METADATA.csv"
    fields, rows = read_rows(meta_path)
    for row in rows:
        if row.get("source_id") == first_id:
            row["source_name"] = "Replacement Dataset Source"
    write_rows(meta_path, fields, rows)

    schema_path = alt / "1 Source_inputs" / "SOURCE_SPECIFIC_SCHEMA.csv"
    fields, rows = read_rows(schema_path)
    for row in rows:
        if row.get("source_type") == first_type:
            keys = [x.strip() for x in row.get("source_specific_keys", "").split(";") if x.strip()]
            if "replacement_probe_field" not in keys:
                keys.append("replacement_probe_field")
            row["source_specific_keys"] = "; ".join(keys)
    write_rows(schema_path, fields, rows)

    normalized_path = alt / "3 Adapter" / "MATCHING_INPUT_VIEW.csv"
    fields, rows = read_rows(normalized_path)
    first_rows = [i for i, row in enumerate(rows) if row.get("source_type") == first_type]
    assert len(first_rows) >= 3
    del rows[first_rows[-1]]  # change record count
    first_rows = [i for i, row in enumerate(rows) if row.get("source_type") == first_type]
    for offset, key, value in [
        (0, "replacement_probe_field", "replacement_probe_value"),
        (1, "replacement_undeclared_probe", "replacement_issue_value"),
    ]:
        idx = first_rows[offset]
        details = json.loads(rows[idx].get("source_specific_details") or "{}")
        details[key] = value
        rows[idx]["source_specific_details"] = json.dumps(details, separators=(",", ":"))
    write_rows(normalized_path, fields, rows)

    geometry_path = alt / "2 Source_geometry" / "SOURCE_GEOMETRIES.csv"
    fields, rows = read_rows(geometry_path)
    for row in rows:
        if row.get("source_type") == first_type:
            row["normalization_method"] = "REPLACEMENT_TEST_METHOD"
            row["geometry_quality_flag"] = "REPLACEMENT_TEST_FLAG"
            break
    write_rows(geometry_path, fields, rows)

    replacement = build_contract(alt)
    assert len(replacement["sources"]) == len(original["sources"]) - 1
    changed = next(source for source in replacement["sources"] if source["source_id"] == first_id)
    assert changed["metadata"]["source_name"] == "Replacement Dataset Source"
    assert changed["normalized_source_state"]["record_count"] == original_first_count - 1
    assert "replacement_probe_field" in changed["normalized_source_state"]["source_specific_field_profile"]
    assert changed["normalized_source_state"]["source_specific_field_profile"]["replacement_probe_field"]["sample_value"] == "replacement_probe_value"
    assert changed["quality_and_exceptions"]["exception_category_counts"].get("UNDECLARED_SOURCE_KEY", 0) >= 1
    assert changed["spatial_metadata"]["normalization_methods"].get("REPLACEMENT_TEST_METHOD", 0) >= 1
    assert changed["spatial_metadata"]["geometry_quality_flags"].get("REPLACEMENT_TEST_FLAG", 0) >= 1

    alt_contract = Path(tmp) / "alternate-contract.json"
    alt_contract.write_text(json.dumps(replacement), encoding="utf-8")
    subprocess.run(["node", str(HERE / "replacementServiceHarness.mjs"), str(alt_contract)], check=True)

print("controlled dataset replacement test passed")
