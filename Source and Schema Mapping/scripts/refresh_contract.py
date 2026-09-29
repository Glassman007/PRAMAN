#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from build_data_contract import build_contract

HERE = Path(__file__).resolve().parent
PKG = HERE.parent


def resolve_dataset(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    env = os.environ.get("PRAMAN_DATA")
    if env:
        return Path(env).expanduser().resolve()
    return (PKG.parent / "PRAMAN_DATA").resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate Source & Schema Mapping data-contract.json from the current PRAMAN dataset.")
    parser.add_argument("--dataset", help="PRAMAN dataset root. Defaults to PRAMAN_DATA env or ../PRAMAN_DATA.")
    parser.add_argument("--output", type=Path, default=PKG / "data-contract.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--required", action="store_true", help="Fail if the dataset root is unavailable.")
    mode.add_argument("--if-present", action="store_true", help="Regenerate when available; otherwise retain the bundled contract with a warning.")
    args = parser.parse_args()

    dataset = resolve_dataset(args.dataset)
    if not dataset.exists():
        message = (
            f"PRAMAN dataset not found at {dataset}. Set PRAMAN_DATA or place the dataset at ../PRAMAN_DATA. "
            "The bundled data-contract.json is a generated snapshot and cannot prove current-dataset freshness by itself."
        )
        if args.required or not args.if_present:
            raise SystemExit(message)
        print(f"WARNING: {message}")
        return

    contract = build_contract(dataset)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(contract, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Refreshed {args.output} from {dataset}")


if __name__ == "__main__":
    main()
