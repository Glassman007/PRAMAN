import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATASET = ROOT / "dataset"
GENERATED = ROOT / "generated"

GENERATED.mkdir(exist_ok=True)


def read_csv(filename):
    path = DATASET / filename

    with path.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:
        return list(csv.DictReader(file))


def read_json(filename):
    path = DATASET / filename

    with path.open(
        "r",
        encoding="utf-8"
    ) as file:
        return json.load(file)


data = {
    "revenue": read_csv(
        "01_revenue_land_records_2025.csv"
    ),

    "registration": read_csv(
        "02_registration_stamps_2025.csv"
    ),

    "survey": read_csv(
        "03_survey_data_2025.csv"
    ),

    "ulb": read_csv(
        "04_mcd_ulb_2025.csv"
    ),

    "planning": read_csv(
        "05_dda_planning_2025.csv"
    ),

    "parcelsGeoJSON": read_json(
        "06_parcels_2025.geojson"
    ),

    "conflicts": read_csv(
        "07_conflicts_2025.csv"
    ),

    "recommendations": read_csv(
        "08_reconciliation_recommendations_2025.csv"
    ),

    "history": read_csv(
        "09_timeline_history_2012_2025.csv"
    ),

    "metrics": read_csv(
        "10_dashboard_metrics.csv"
    ),

    "sourceQuality": read_csv(
        "11_source_quality.csv"
    )
}


# -----------------------------------
# Shared JSON used by backend layers
# -----------------------------------

shared_output = GENERATED / "shared_dataset.json"

shared_output.write_text(
    json.dumps(
        data,
        ensure_ascii=False,
        indent=2
    ),
    encoding="utf-8"
)


# -----------------------------------
# Layer 2 browser bundle
# -----------------------------------

layer2_output = ROOT / "layer2" / "data" / "data-bundle.js"

layer2_output.parent.mkdir(
    parents=True,
    exist_ok=True
)

layer2_output.write_text(
    "window.SIH_LAYER2_DATA = "
    + json.dumps(data, ensure_ascii=False)
    + ";\n",
    encoding="utf-8"
)


print("Shared data generated:")
print(f"  {shared_output}")
print(f"  {layer2_output}")

print()
print("Records:")
print(f"  Revenue:        {len(data['revenue'])}")
print(f"  Registration:   {len(data['registration'])}")
print(f"  Survey:         {len(data['survey'])}")
print(f"  ULB:            {len(data['ulb'])}")
print(f"  Planning:       {len(data['planning'])}")
print(f"  Parcels:        {len(data['parcelsGeoJSON']['features'])}")
print(f"  Conflicts:      {len(data['conflicts'])}")
print(f"  Recommendations:{len(data['recommendations'])}")
print(f"  History:        {len(data['history'])}")