import pandas as pd
from pathlib import Path


def export_praman_mvp(excel_file, output_root="PRAMAN_DATA"):

    output_root = Path(output_root)

    sheet_mapping = {
        "SOURCE_METADATA": "1 Source_inputs",
        "SOURCE_SPECIFIC_SCHEMA": "1 Source_inputs",

        "SOURCE_GEOMETRIES": "2 Source_geometry",

        "MATCHING_INPUT_VIEW": "3 Adapter",

        "SOURCE_OBSERVATIONS": "4 Matching",

        "CONFLICTS": "5 Conflicts",
        "CONFLICT_EVIDENCE": "5 Conflicts",
        "CONFLICTS_REJECTED_PROVENANCE": "5 Conflicts",

        "RECONCILED_PARCELS": "6 Reconciliation",

        "CANONICAL_PARCELS": "7 Authoritative_state",
        "GEOMETRY_VERSIONS": "7 Authoritative_state",

        "HISTORICAL_PARCELS": "8 History",
        "PARCEL_LINEAGE": "8 History",
        "GEOGIT_EVENTS": "8 History",

        "BUILDINGS": "9 Visual World",
        "SOCIETIES_AND_COMPLEXES": "9 Visual World",

        "SYNTHETIC_GROUND_TRUTH": "99 Eval only",
        "BENCHMARK_CASES": "99 Eval only",
        "VALIDATION_SUMMARY": "99 Eval only",
        "INTEGRITY_REPAIR_AUDIT": "99 Eval only",
        "DATA_DICTIONARY": "99 Eval only",
    }

    workbook = pd.ExcelFile(excel_file)

    for sheet_name, folder_name in sheet_mapping.items():

        if sheet_name not in workbook.sheet_names:
            print(f"Missing: {sheet_name}")
            continue

        folder_path = output_root / folder_name
        folder_path.mkdir(parents=True, exist_ok=True)

        df = pd.read_excel(
            workbook,
            sheet_name=sheet_name
        )

        csv_path = folder_path / f"{sheet_name}.csv"

        df.to_csv(
            csv_path,
            index=False,
            encoding="utf-8-sig"
        )

        print(f"Created: {csv_path}")


# THIS runs the function
export_praman_mvp(
    excel_file="PRAMAN_FINAL_BUILD1.xlsx",
    output_root="PRAMAN_DATA"
)