#!/usr/bin/env python3
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
sys.path.insert(0, str(PKG / "scripts"))
from build_data_contract import build_contract  # noqa: E402


def resolve_inputs() -> tuple[Path | None, Path]:
    dataset = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (PKG.parent / "PRAMAN_DATA")
    contract_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else (PKG / "data-contract.json")
    return (dataset if dataset.exists() else None), contract_path


dataset, contract_path = resolve_inputs()
stored = json.loads(contract_path.read_text(encoding="utf-8"))

assert len(stored["sources"]) == len({s["source_id"] for s in stored["sources"]})
assert stored["scope"]["normalized_source_state_table"]
assert stored["canonical_schema_reference"]["read_only_reference_only"] is True
assert isinstance(stored.get("feature_support", {}), dict)
assert isinstance(stored.get("validation_outputs", {}).get("detected_discrepancies", []), list)

if dataset is None:
    raise SystemExit("PRAMAN_DATA is required for dataset-backed contract reproducibility validation; no silent skip is allowed.")
rebuilt = build_contract(dataset)
assert stored == rebuilt, "data-contract.json is stale relative to the supplied PRAMAN_DATA"
print(f"contract reproducibility passed: {dataset}")

subprocess.run(["node", "--check", str(PKG / "src" / "sourceSchemaMappingService.js")], check=True)
print("contract validation passed")
