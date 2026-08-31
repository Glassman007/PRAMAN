import csv
import json
from pathlib import Path

LAYER_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = LAYER_ROOT.parent

DATASET = PROJECT_ROOT / "dataset"
OUTPUT = LAYER_ROOT / "data"

OUTPUT.mkdir(exist_ok=True)


def read_csv(filename):
    path = DATASET / filename
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return [
            {
                key.strip(): value.strip() if isinstance(value, str) else value
                for key, value in row.items()
                if key is not None
            }
            for row in csv.DictReader(file)
        ]


def read_json(filename):
    path = DATASET / filename
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_js(filename, variable, data):
    path = OUTPUT / filename
    path.write_text(
        f"window.{variable} = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"Created {path.name}: {len(data) if hasattr(data, '__len__') else 1}")


def as_number(value):
    try:
        number = float(value)
        return int(number) if number.is_integer() else number
    except (TypeError, ValueError):
        return value


source_files = [
    ("01_revenue_land_records_2025.csv", "Revenue"),
    ("02_registration_stamps_2025.csv", "Registration"),
    ("03_survey_data_2025.csv", "Survey"),
    ("04_mcd_ulb_2025.csv", "ULB"),
    ("05_dda_planning_2025.csv", "Planning"),
]

parcel_records = []
for filename, source_name in source_files:
    for row in read_csv(filename):
        row["parcel_id"] = row.get("parcel_id") or row.get("parcel_id_ref")
        row["source"] = source_name
        parcel_records.append(row)

for feature in read_json("06_parcels_2025.geojson").get("features", []):
    properties = dict(feature.get("properties") or {})
    properties["parcel_id"] = properties.get("parcel_id")
    properties["source"] = "Canonical"
    parcel_records.append(properties)

write_js("parcels.js", "PARCEL_DATA", parcel_records)

conflicts = read_csv("07_conflicts_2025.csv")
for row in conflicts:
    row["confidence"] = as_number(row.get("confidence"))
write_js("conflicts.js", "CONFLICT_DATA", conflicts)

recommendations = read_csv("08_reconciliation_recommendations_2025.csv")
for row in recommendations:
    row["recommendation_confidence"] = as_number(row.get("recommendation_confidence"))
write_js("reconciliation.js", "RECONCILIATION_DATA", recommendations)

metrics = {}
for row in read_csv("10_dashboard_metrics.csv"):
    metrics[row["metric"]] = {
        "value": as_number(row["value"]),
        "unit": row["unit"],
        "note": row["note"],
    }
write_js("metrics.js", "DASHBOARD_METRICS", metrics)

source_quality = read_csv("11_source_quality.csv")
for row in source_quality:
    row["records"] = as_number(row.get("records"))
    row["field_verified_or_doc_verified"] = as_number(row.get("field_verified_or_doc_verified"))
    if row["field_verified_or_doc_verified"] == "":
        row["field_verified_or_doc_verified"] = None
    row["coverage_pct"] = as_number(row.get("coverage_pct"))
write_js("source_quality.js", "SOURCE_QUALITY", source_quality)

print("\nLayer 1 data build complete.")
