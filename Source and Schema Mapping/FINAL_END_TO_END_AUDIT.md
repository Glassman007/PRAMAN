# PRAMAN Source & Schema Mapping — Final End-to-End Audit

## Scope

Final audit of the current Source & Schema Mapping dashboard against the current `PRAMAN_DATA` dataset and generated data contract. No redesign was performed. Changes were limited to proven defects and proven-dead UI CSS.

## Final result

**PASS with one packaging/environment limitation:** all module regressions, dataset-integrity checks, mapping recomputation, controlled dataset-replacement checks, and Chromium scroll/overflow interaction checks pass after cleanup. The standalone ZIP does not include `node_modules`, and the execution environment cannot resolve the npm registry, so `vite build` cannot run here; `npm run build` completes the dataset-backed prebuild refresh and then stops at `vite: not found`. The refreshed `data-contract.json` remains byte-for-byte identical to the baseline contract.

## Problems found and fixed

1. **Utility adapter false positive**
   - `UTILITY_INFRASTRUCTURE` was displayed as `Parcel / Spatial-Unit, Context Feature`.
   - Cause: metadata inference matched the word `cadastral` inside the explicitly negated sentence `not automatically cadastral authority`.
   - Fix: adapter inference now excludes explicitly negated purpose clauses from positive adapter evidence while still using structured `source_type`, declared-purpose metadata, and source-specific keys. Explicit configured adapter metadata/registry still takes precedence.
   - Final value: `Context Feature`.

2. **Schema fields could be visually unreachable despite panel scrollbars**
   - `.ssm-schema-scroll details` used `overflow:hidden`.
   - In Chromium, a field list could be thousands of pixels tall while its `<details>` element remained panel-sized; the parent scroller therefore did not include the hidden field content in `scrollHeight`.
   - Fix: expanded schema groups now use `overflow:visible`, allowing their full content height to participate in the native panel scroller.
   - Chromium validation now confirms the final field is reachable.

3. **Redundant legacy UI CSS**
   - Removed selectors proven unreachable from the current JSX: old relationship-card visualization, old mapping-inspector/transform-view styles, old issue-tile styles, old timeline-event styles, and an obsolete dim-connector state.
   - Shared service logic, mapping logic, Coverage Matrix service capability, and data-contract logic were not removed.

## Presentation audit

- No user-facing `Synthetic` occurrence exists in runtime dashboard source.
- Original dataset names containing `Synthetic` remain unchanged in the source-of-truth contract.
- Source IDs and raw source records remain unchanged.
- Coverage Matrix UI remains removed; no Coverage Matrix dashboard component or CSS remains.

## Overview audit by source

| Source ID | Display name | Type | Records | Fields | Geometry | Original CRS | Normalized CRS | Adapter | Validation occurrences |
|---|---|---|---:|---:|---:|---|---|---|---:|
| SRC-A-REV | Revenue Cadastral Parcel Map | CADASTRAL_REVENUE | 1,061 | 21 | 1,043 POLYGON | EPSG:32643 | EPSG:4326 | Parcel / Spatial-Unit, Administrative / Legal Record | 0 |
| SRC-B-MCD | Municipal Property Register | MUNICIPAL_PROPERTY | 1,052 | 23 | 1,016 POLYGON | EPSG:4326 | EPSG:4326 | Parcel / Spatial-Unit, Administrative / Legal Record | 0 |
| SRC-C-DDA | DDA Scheme & Allotment Register | DDA_DEVELOPMENT_AUTHORITY | 287 | 23 | 287 POLYGON | EPSG:32643 | EPSG:4326 | Parcel / Spatial-Unit, Administrative / Legal Record | 0 |
| SRC-D-GIS | Building Footprint / Municipal GIS | BUILDING_GIS | 765 | 21 | 765 POLYGON | EPSG:32643 | EPSG:4326 | Context Feature | 0 |
| SRC-E-UAV | 2026 Drone Orthophoto Features | DRONE_ORTHOPHOTO | 782 | 25 | 782 POLYGON | EPSG:32643 | EPSG:4326 | Image Observation | 2,062 |
| SRC-F-GNSS | GNSS/CORS Field Survey | GNSS_CORS_SURVEY | 229 | 21 | 229 POLYGON | EPSG:32643 | EPSG:4326 | Survey Observation | 0 |
| SRC-G-UTIL | Utility / Infrastructure GIS | UTILITY_INFRASTRUCTURE | 190 | 19 | 190 POLYGON | EPSG:32643 | EPSG:4326 | Context Feature | 154 |

All seven preserve the architecture sequence:

`Source → Adapter → Validation → Schema Detection → Field Relationships → Transformation → Normalized Source State`

## Mapping-validity audit

Independent recomputation against the current CSVs remains unchanged:

- 48 represented relationships
- 34 source-native retention relationships
- 14 geometry-normalization relationships
- 112 normalized fields with no documented raw-field derivation
- 0 explicit non-geometry direct-normalization mappings
- 0 documented derived-field mappings
- 0 explicit source-to-canonical mappings
- 0 invalid represented relationships
- 4 exact value-alignment candidates retained only as candidates

**Mappings corrected in this final pass: 0.**

All 48 represented relationships were intentionally preserved because the row-level audit supports them. In particular:

`khasra_plot_no → source_specific_details.khasra_plot_no`

remains a **Source-native retention** relationship with 1,061 affected records. It is not converted into a canonical field and does not claim cross-source parcel identity.

## Pre-matching semantics

The dashboard continues to represent:

`source → normalized source state`

It does not treat `source_parcel_id`, normalized identifiers, retained source-native values, or normalized source fields as proof that records from different agencies refer to the same authoritative canonical parcel. Canonical schema remains a reference-only mode unless explicit mapping metadata exists.

## UI and scrolling audit

The workspace remains:

`Source Schema → PRAMAN Schema → Relationship / Mapping Details`

Only active/selected relationship connectors are rendered. Old relationship-card CSS was removed.

Chromium checks using the actual current CSS passed at:

- 1024 × 768
- 1366 × 768
- 1440 × 900
- 1000 × 768 stacked breakpoint

Validated behavior:

- Source Schema independently scrolls.
- PRAMAN Schema independently scrolls.
- Relationship Details independently scrolls.
- Repeated small wheel deltas (trackpad-style) affect only the hovered panel.
- Visible native scrollbar gutter exists for each panel.
- Native scrollbar dragging passes in headed Chromium under Xvfb.
- No horizontal page overflow at tested sizes.
- Long field content stays within panel width.
- The final field is reachable.
- Connector code listens directly to each schema panel's scroll event.
- Selection state has no scroll-triggered reset path.
- Production `revealNode()` uses short native smooth scrolling and targets the actual destination/source node.

## Explanation audit

Plain-English purpose/explanation text is present while retaining technical names for:

- Schema Mapping
- Source Schema
- PRAMAN Schema
- Relationship / Mapping Details
- Identifier Interpretation
- Classification
- Quality & Exceptions
- Quality Profile
- Field-Level Quality
- Exceptions
- Lineage & Impact
- Lineage
- Impact
- History & Configuration
- Configuration
- History

No fabricated mapping coverage percentage, quality score, confidence score, history event, version, operator, lineage edge, transformation, or exception was introduced.

## Data-integrity result

`data-contract.json` and `mapping-relationship-audit.json` are byte-for-byte identical to the pre-audit baseline after the final dataset refresh.

The full dataset integrity suite confirms no accidental changes to source IDs, counts, geometry/CRS metadata, parcel information, transformation data, mapping data, validation results, schema structures, lineage, history, or current configuration.

## Regression result

Final post-cleanup test run:

- service contract tests: PASS
- dashboard selector tests: PASS
- schema workspace tests: PASS
- quality/lineage/history tests: PASS
- history metadata variation: PASS
- future metadata activation: PASS
- record-specific provenance: **2,216 PASS**
- overview cleanup regression: PASS
- mapping relationship audit: PASS
- schema presentation regression: PASS
- schema scrolling/selection regression: PASS
- explanatory UX regressions: PASS
- final end-to-end dashboard regression: PASS
- contract reproducibility: PASS
- full data-integrity audit: PASS for 7 sources
- controlled dataset replacement: PASS
- mapping row-count recomputation: PASS
- Chromium overflow/scroll smoke: PASS

## Remaining data-supported limitations

- The current dataset has no explicit adapter registry/execution log. Adapter presentation therefore uses structured metadata inference only when explicit adapter configuration is absent; explicit configuration remains authoritative.
- The current pre-match contract does not document non-geometry raw-field derivation for the 112 noted normalized-field cases.
- The four exact raw/normalized value alignments are observations, not proven transformation rules.
- There is no explicit selected-source → canonical field mapping metadata in the current contract.
- No real source/schema configuration history is recorded for the current sources, so History truthfully shows no history rather than creating a timeline.
- A production Vite bundle cannot be generated in this execution environment because dependencies are not bundled in the source ZIP and external npm resolution is unavailable. This is an environment/package-dependency limitation, not a failing PRAMAN data or module regression.
