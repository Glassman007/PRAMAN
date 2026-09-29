#!/usr/bin/env python3
"""Row-level audit of PRAMAN Source & Schema Mapping relationships.

This script does not infer mappings from similar names. It validates represented
relationships against the current pre-match dataset and records exact value
alignments separately as non-authoritative candidates when no mapping rule exists.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

NOT_AVAILABLE = "Not available"


def empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"", "na", "n/a", "null", "none", "nan"}
    return False


def parse_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if empty(value):
        return {}
    try:
        parsed = json.loads(str(value))
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def scalar_type(value: Any) -> str:
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


def observed_types(values: list[Any]) -> list[str]:
    return sorted({scalar_type(v) for v in values if not empty(v)})


def canonical_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, separators=(",", ":"))
    return str(value).strip()


def relation_exceptions(source: dict[str, Any], field: str, location: str | None = None, relation_token: str | None = None) -> dict[str, Any]:
    matches = []
    for issue in source.get("quality_and_exceptions", {}).get("exceptions", []):
        if issue.get("field") == field or (location and issue.get("related_mapping_or_transformation") == location) or (relation_token and issue.get("related_mapping_or_transformation") == relation_token):
            matches.append(issue)
    categories = Counter(issue.get("issue_category") or NOT_AVAILABLE for issue in matches)
    return {
        "count": len(matches),
        "categories": [{"category": k, "count": v} for k, v in sorted(categories.items())],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset_root")
    ap.add_argument("contract")
    ap.add_argument("output")
    args = ap.parse_args()

    dataset_root = Path(args.dataset_root).resolve()
    contract_path = Path(args.contract).resolve()
    output_path = Path(args.output).resolve()
    contract = json.loads(contract_path.read_text(encoding="utf-8"))

    table_catalog = contract.get("table_catalog", {})
    normalized_name = contract.get("scope", {}).get("normalized_source_state_table", "MATCHING_INPUT_VIEW")
    geometry_name = contract.get("lineage_contract", {}).get("geometry_lineage", {}).get("to", "SOURCE_GEOMETRIES.geometry_id").split(".")[0]
    normalized_path = dataset_root / table_catalog[normalized_name]["path"]
    geometry_path = dataset_root / table_catalog[geometry_name]["path"]
    normalized_rows = read_csv(normalized_path)
    geometry_rows = read_csv(geometry_path)

    normalized_schema = {f["field_name"]: f for f in contract.get("normalized_source_schema", [])}
    geometry_schema = {f["field_name"]: f for f in contract.get("source_geometry_schema", [])}
    identifier_fields = set(contract.get("lineage_contract", {}).get("identifier_fields_present_in_normalized_source_state", []))
    raw_non_geometry_lineage = bool(contract.get("lineage_contract", {}).get("non_geometry_raw_field_mapping_lineage_available"))

    rows_by_type: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in normalized_rows:
        rows_by_type[row.get("source_type", "")].append(row)
    geometry_by_type: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in geometry_rows:
        geometry_by_type[row.get("source_type", "")].append(row)

    output: dict[str, Any] = {
        "audit_version": "1.0",
        "contract_version": contract.get("contract_version"),
        "dataset_root_name": contract.get("dataset_root_name"),
        "scope": contract.get("scope", {}),
        "count_validation": {
            "method": "row-level recomputation from current MATCHING_INPUT_VIEW and SOURCE_GEOMETRIES CSVs",
            "normalized_rows": len(normalized_rows),
            "geometry_rows": len(geometry_rows),
        },
        "sources": [],
    }

    totals = Counter()
    for source in contract.get("sources", []):
        sid = source["source_id"]
        stype = source["source_type"]
        source_rows = rows_by_type.get(stype, [])
        source_geometries = geometry_by_type.get(stype, [])
        preserved = source.get("adapter_and_mapping", {}).get("source_native_fields_preserved_in")
        declared_keys = source.get("declared_source_schema", {}).get("source_specific_keys", [])
        common_profile = source.get("normalized_source_state", {}).get("common_field_profile", {})
        details_by_row = [parse_json_object(row.get(preserved)) if preserved else {} for row in source_rows]

        represented: list[dict[str, Any]] = []
        for key in declared_keys:
            values = [details.get(key) for details in details_by_row]
            populated_values = [v for v in values if not empty(v)]
            types = observed_types(populated_values)
            leaf_type = " | ".join(types) if types else NOT_AVAILABLE
            location = f"{preserved}.{key}" if preserved else key
            profile = source.get("normalized_source_state", {}).get("source_specific_field_profile", {}).get(key, {})
            exceptions = relation_exceptions(source, key, location=location)
            destination_exists = bool(preserved and preserved in normalized_schema and all(preserved in row for row in source_rows))
            count = len(populated_values)
            profile_count = int(profile.get("populated") or 0)
            source_count = int(source.get("normalized_source_state", {}).get("record_count") or 0)
            count_verified = count == profile_count and len(source_rows) == source_count
            represented.append({
                "relationId": f"retained:{key}",
                "sourceField": key,
                "sourceFieldMeaning": NOT_AVAILABLE,
                "sourcePurposeContext": source.get("declared_source_schema", {}).get("purpose") or NOT_AVAILABLE,
                "sourceDatatype": leaf_type,
                "sourceDatatypeBasis": "row-level observed populated values in source_specific_details",
                "destinationField": location,
                "destinationDatatype": leaf_type,
                "destinationStorageDatatype": normalized_schema.get(preserved, {}).get("data_type", NOT_AVAILABLE),
                "destinationMeaning": normalized_schema.get(preserved, {}).get("definition", NOT_AVAILABLE),
                "relationshipCategory": "Source-native retention",
                "transformationRule": NOT_AVAILABLE,
                "retentionRule": f"Preserve the source-native value under {location}",
                "normalizationRule": f"Retain source-native evidence in {normalized_name}.{preserved}; no canonical equivalence asserted",
                "affectedRecords": count,
                "affectedRecordUnit": f"{normalized_name} rows with a populated retained value",
                "affectedCountBasis": "direct row-level JSON parse/count",
                "affectedCountVerified": count_verified,
                "datatypeCompatibility": "Compatible" if leaf_type != NOT_AVAILABLE else "Not verifiable",
                "mappingEvidence": [
                    f"SOURCE_SPECIFIC_SCHEMA declares {key} for {stype}",
                    f"{count} current {normalized_name} rows contain a populated {location} value",
                    f"contract source_specific_field_profile.{key}.populated={profile_count}",
                ],
                "validationResult": "Relationship represented with row-level support" if destination_exists and count_verified else "Needs review",
                "validationStatus": f"{exceptions['count']} relationship-specific validation exceptions" if exceptions["count"] else "No detected relationship-specific validation exceptions",
                "exceptions": exceptions,
                "destinationExists": destination_exists,
                "destinationPopulated": count > 0,
                "valuesActuallyPopulateDestination": count > 0,
                "rawFieldDerivationDocumented": False,
                "preMatchingScope": True,
                "crossSourceIdentityClaim": False,
                "uiRelationshipTruthfulness": "Supported: preserve relationship",
                "explanation": f"The current normalized source rows actually preserve {key} at {location}. The archive still lacks an upstream raw-table/column transformation rule, so this is retention evidence, not a direct canonical mapping.",
            })
            totals["sourceNativeRetention"] += 1

        geom_profiles = source.get("spatial_metadata", {}).get("geometry_field_profile", {})
        for rel in source.get("spatial_metadata", {}).get("geometry_mapping_relationships", []):
            src = rel["source_field"]
            dst = rel["target_field"]
            method_field = rel.get("rule_metadata_field") or "normalization_method"
            applicable = [row for row in source_geometries if not empty(row.get(src)) and not empty(row.get(dst))]
            method_present = [row for row in applicable if not empty(row.get(method_field))]
            declared = int(rel.get("affected_records") or 0)
            profile_src = int(geom_profiles.get(src, {}).get("populated") or 0)
            profile_dst = int(geom_profiles.get(dst, {}).get("populated") or 0)
            count = len(applicable)
            count_verified = count == declared == profile_src == profile_dst == len(source_geometries) == len(method_present)
            exceptions = relation_exceptions(source, src, relation_token=f"{src}->{dst}")
            represented.append({
                "relationId": f"geometry:{src}->{dst}",
                "sourceField": src,
                "sourceFieldMeaning": geometry_schema.get(src, {}).get("definition", NOT_AVAILABLE),
                "sourcePurposeContext": source.get("declared_source_schema", {}).get("purpose") or NOT_AVAILABLE,
                "sourceDatatype": geometry_schema.get(src, {}).get("data_type", NOT_AVAILABLE),
                "sourceDatatypeBasis": "DATA_DICTIONARY / source geometry schema",
                "destinationField": f"{geometry_name}.{dst}",
                "destinationDatatype": geometry_schema.get(dst, {}).get("data_type", NOT_AVAILABLE),
                "destinationStorageDatatype": geometry_schema.get(dst, {}).get("data_type", NOT_AVAILABLE),
                "destinationMeaning": geometry_schema.get(dst, {}).get("definition", NOT_AVAILABLE),
                "relationshipCategory": "Geometry normalization",
                "transformationRule": method_present[0].get(method_field) if method_present else NOT_AVAILABLE,
                "retentionRule": NOT_AVAILABLE,
                "normalizationRule": f"{geometry_name}.{src} → {geometry_name}.{dst} using {geometry_name}.{method_field}",
                "affectedRecords": count,
                "affectedRecordUnit": f"{geometry_name} rows",
                "affectedCountBasis": "direct row-level source+target population count, requiring transformation metadata",
                "affectedCountVerified": count_verified,
                "datatypeCompatibility": "Compatible" if geometry_schema.get(src, {}).get("data_type") == geometry_schema.get(dst, {}).get("data_type") else "Review datatype semantics",
                "mappingEvidence": [
                    f"{count} {geometry_name} rows contain both {src} and {dst}",
                    f"{len(method_present)} of those rows contain {method_field}",
                    f"configured affected_records={declared}",
                ],
                "validationResult": "Relationship represented with row-level support" if count_verified else "Needs review",
                "validationStatus": f"{exceptions['count']} relationship-specific validation exceptions" if exceptions["count"] else "No detected relationship-specific validation exceptions",
                "exceptions": exceptions,
                "destinationExists": dst in geometry_schema and all(dst in row for row in source_geometries),
                "destinationPopulated": count > 0,
                "valuesActuallyPopulateDestination": count > 0,
                "rawFieldDerivationDocumented": True,
                "preMatchingScope": True,
                "crossSourceIdentityClaim": False,
                "uiRelationshipTruthfulness": "Supported: preserve relationship",
                "explanation": f"The current geometry table stores {src}, {dst}, and {method_field} together for the audited rows, directly documenting the geometry normalization trace.",
            })
            totals["geometryNormalization"] += 1

        undocumented = []
        for field, profile in common_profile.items():
            if field == preserved:
                continue
            actual_populated = sum(1 for row in source_rows if not empty(row.get(field)))
            contract_populated = int(profile.get("populated") or 0)
            undocumented.append({
                "relationId": f"undocumented:{sid}:{field}",
                "sourceField": None,
                "sourceFieldMeaning": NOT_AVAILABLE,
                "sourcePurposeContext": source.get("declared_source_schema", {}).get("purpose") or NOT_AVAILABLE,
                "sourceDatatype": NOT_AVAILABLE,
                "sourceDatatypeBasis": "Upstream raw source field is not documented",
                "destinationField": f"{normalized_name}.{field}",
                "destinationDatatype": normalized_schema.get(field, {}).get("data_type", NOT_AVAILABLE),
                "relationshipCategory": "No documented raw-field derivation",
                "transformationRule": NOT_AVAILABLE,
                "retentionRule": NOT_AVAILABLE,
                "normalizationRule": NOT_AVAILABLE,
                "affectedRecords": actual_populated,
                "affectedRecordUnit": f"{normalized_name} rows with a populated normalized value",
                "affectedCountBasis": "direct row-level normalized-field population count",
                "affectedCountVerified": actual_populated == contract_populated,
                "datatypeCompatibility": "Not verifiable without the upstream raw-field datatype",
                "mappingEvidence": [
                    f"{normalized_name}.{field} exists and is populated in {actual_populated} rows for {stype}",
                    "lineage_contract.non_geometry_raw_field_mapping_lineage_available=false",
                ],
                "validationResult": "Insufficient evidence for a raw-field connector; do not invent mapping",
                "destinationExists": field in normalized_schema and all(field in row for row in source_rows),
                "destinationPopulated": actual_populated > 0,
                "rawFieldDerivationDocumented": False,
                "identifierField": field in identifier_fields,
                "preMatchingScope": True,
                "crossSourceIdentityClaim": False,
                "uiConnectorAllowed": False,
                "explanation": "This identifier is source-state metadata and is not proof of cross-source parcel identity." if field in identifier_fields else "The normalized value exists, but current files/configuration do not document which raw field or non-geometry rule produced it.",
            })
            totals["noDocumentedRawFieldDerivation"] += 1

        # Exact row-wise value alignments are evidence worth recording, but not mapping proof.
        alignments = []
        for key in declared_keys:
            native_values = [details.get(key) for details in details_by_row]
            source_populated = sum(1 for value in native_values if not empty(value))
            if source_populated == 0:
                continue
            for field in common_profile:
                if field == preserved:
                    continue
                compared = 0
                exact = 0
                missing_target_for_source_value = 0
                for native_value, row in zip(native_values, source_rows):
                    if empty(native_value):
                        continue
                    target_value = row.get(field)
                    if empty(target_value):
                        missing_target_for_source_value += 1
                        continue
                    compared += 1
                    if canonical_scalar(native_value) == canonical_scalar(target_value):
                        exact += 1
                if compared and exact == compared and missing_target_for_source_value == 0 and compared == source_populated:
                    alignments.append({
                        "sourceField": key,
                        "normalizedField": field,
                        "matchedRows": exact,
                        "sourcePopulatedRows": source_populated,
                        "exactRowWiseAlignment": True,
                        "mappingDecision": "Do not promote to mapping: no documented non-geometry raw-field derivation/transformation rule",
                        "relationshipCategoryIfUnproven": "No documented raw-field derivation",
                    })

        source_audit = {
            "sourceId": sid,
            "sourceType": stype,
            "sourcePurpose": source.get("declared_source_schema", {}).get("purpose") or NOT_AVAILABLE,
            "sourceRecordCount": len(source_rows),
            "geometryRecordCount": len(source_geometries),
            "representedRelationships": represented,
            "undocumentedNormalizedDerivations": undocumented,
            "observedValueAlignmentCandidates": alignments,
            "summary": {
                "representedRelationshipCount": len(represented),
                "sourceNativeRetentionCount": sum(1 for r in represented if r["relationshipCategory"] == "Source-native retention"),
                "geometryNormalizationCount": sum(1 for r in represented if r["relationshipCategory"] == "Geometry normalization"),
                "directNormalizationCount": 0,
                "derivedFieldCount": 0,
                "identifierNormalizationCount": 0,
                "explicitSourceToCanonicalCount": 0,
                "noDocumentedRawFieldDerivationCount": len(undocumented),
                "observedValueAlignmentCandidateCount": len(alignments),
                "invalidRepresentedRelationshipCount": sum(1 for r in represented if r["validationResult"] != "Relationship represented with row-level support"),
                "rawNonGeometryMappingRulesAvailable": bool(source.get("adapter_and_mapping", {}).get("explicit_non_geometry_field_mapping_rules_available")),
                "rawNonGeometryLineageAvailable": raw_non_geometry_lineage,
                "crossSourceIdentityMappingsAsserted": False,
            },
        }
        output["sources"].append(source_audit)

    output["summary"] = {
        "representedRelationshipCount": totals["sourceNativeRetention"] + totals["geometryNormalization"],
        "sourceNativeRetentionCount": totals["sourceNativeRetention"],
        "geometryNormalizationCount": totals["geometryNormalization"],
        "noDocumentedRawFieldDerivationCount": totals["noDocumentedRawFieldDerivation"],
        "directNormalizationCount": 0,
        "derivedFieldCount": 0,
        "identifierNormalizationCount": 0,
        "explicitSourceToCanonicalCount": 0,
        "invalidRepresentedRelationshipCount": sum(source["summary"]["invalidRepresentedRelationshipCount"] for source in output["sources"]),
        "observedValueAlignmentCandidateCount": sum(source["summary"]["observedValueAlignmentCandidateCount"] for source in output["sources"]),
    }
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output["summary"], indent=2))
    if output["summary"]["invalidRepresentedRelationshipCount"]:
        raise SystemExit("row-level mapping audit found invalid represented relationships")


if __name__ == "__main__":
    main()
