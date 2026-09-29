import json,collections
from pathlib import Path
R=Path(__file__).resolve().parents[1];p=json.loads((R/'data/pilot-plan.json').read_text());b=json.loads((R/'docs/pilot-browser-validation.json').read_text());d=json.loads((R/'data/normalized-map.json').read_text())
counts=collections.Counter(x['parcelId'] for x in p['placements'] if x['kind']=='building');types=collections.Counter(p['propertyTypes'].values());reasons=collections.Counter(x['reason'] for x in p['issues']);assets=collections.Counter(x['assetId'] for x in p['placements'] if x['assetId'])
text=f'''# Stage 5 — representative pilot neighbourhood

The default page renders **{len(p['parcelIds'])} actual contiguous parcels in CELL-10**, selected by breadth-first traversal of shared boundary edges from the supplied ROAD_ACCESS_CORRIDOR until the declared category coverage is reached. IDs do not determine spatial placement. No cadastral vertex or calibrated model scale was changed. The remaining locality is not populated.

Open default `index.html` through a local HTTP server for the pilot. `?mode=fabric` retains Stage 4's entire unpopulated parcel fabric; `?mode=calibration` retains Stage 3's complete 42-asset viewer. All original assets remain byte-identical and all previous regression suites pass.

## What is rendered

- {len(types)} property categories; {len(p['placements'])} illustrative placements.
- {sum(x['kind']=='building' and x['assetId'] is not None for x in p['placements'])} building/construction GLB placements and {sum(x['kind']=='building' and x['assetId'] is None for x in p['placements'])} flat building-record markers. Markers are explicitly labelled; they are neither measured footprints nor fake extrusions.
- {sum(x['kind']=='tree' for x in p['placements'])} trees, six benches and four lights.
- Two park parcels and one green belt retain their actual ground geometry. Park assemblies were too large at calibrated scale, so planting and benches represent these spaces.
- Two actual parking parcels receive {len(p['parkingMarkings'])} illustrative bay divider lines. These are visual paint, not surveyed stall geometry, parking capacity or legal allocation. Calibrated parking GLBs do not fit and were not shrunk.
- One actual access parcel supplies road context. No additional legal road parcels, inferred connecting streets or road rights were created.
- Building-record multiplicity: {sum(counts[i]==0 for i in p['parcelIds'])} parcels with no building records, {sum(counts[i]==1 for i in p['parcelIds'])} with one, {sum(counts[i]>1 for i in p['parcelIds'])} with multiple. The college's BLD-00953 and BLD-00954 remain independently selectable markers because the pack has no suitable college-scale model.

## Semantic decisions

Apartment/group-housing types use the apartment family. Ordinary residential uses general building-9 only for records with at least four supplied floors; low-rise homes with no suitable model receive markers. Commercial uses com-1; larger commercial towers are excluded. Government candidates are gov-1/gov-3 but neither fits this pilot's government parcel. Under-construction uses construction assets; redevelopment alone is not assumed to be active construction. Vacant land stays empty. Utility/civic/college records without a matching asset retain record markers. No landmark, windmill or barn is substituted merely to use the asset inventory.

GLBs are illustrative archetypes: their appearance, storey count and floor area do not assert the exact surveyed building. Calibration is untouched, and no per-axis or per-parcel resizing is used. Registry dimensions define containment envelopes. Tree heights remain 5–6.5m versus 11–16m apartment models. Six of the seven apartment variants fit; the same small commercial model appears four times, a visible limitation of the asset pack.

## Placement and determinism

`tools/build_pilot.py` owns selection and placement policy. Renderer `map/pilot-neighbourhood.js` consumes only normalized plan IDs/transforms. Actual building records determine multiplicity; canonical building_count is not used to fabricate extra identities. Source footprint evidence is considered only when its complete polygon lies within the associated parcel. Crossing observations remain untouched and are logged instead of clipped into a false footprint.

Orientation uses an adjoining actual road edge where available, otherwise a contained source footprint, otherwise the parcel's longest minimum-rectangle edge. Most parcels have the same source orientation, so similar model yaw is expected. Front doors are not identified in GLB metadata; edge alignment does not claim entrance alignment.

Candidates are tested within a parcel inset. Buildings use a 2m visual setback, trees 1.5m, benches 1.2m and lights 0.8m; these are illustrative configuration choices, not statutory rules. Envelopes, including tree crowns, must fit wholly inside the inset. A 0.6m separation check prevents object overlap, including across neighbouring parcels. Placement is off-centre and ranked by available footprint/access or boundary relationships. Park trees/lights have explicit perimeter anchors. SHA-256 of stable IDs breaks ties and chooses permitted variants; no Math.random or index-based parcel relocation is used.

## Acceptance checks

Python topology/placement checks verify shared-edge connectivity, every containment/setback, no pairwise model-envelope intersections, parking-marking containment, semantic family restrictions and complete 0/1/multiple building-record representation. Browser checks verify calibrated world bounds and ground contact, raycasting for buildings and underlying land, a real pointer click opening the right parcel, deterministic reload, and template reuse. The image below was visually inspected for scale, orientation, setbacks, readable boundaries, trees/benches, parking paint and access placement.

![Pilot neighbourhood](stage5-pilot.png)

Performance: {b['uniqueAssets']} distinct GLB loads; reused geometry/materials. Trees, benches and lights use static instancing with per-instance identities. Draw calls decreased from 669 to {b['diagnostics']['drawCalls']}; rendered triangles {b['diagnostics']['triangles']:,}. In the software-rendered test, sampled animation-frame turnaround was median {b['medianFrameMs']:.1f}ms, p95 {b['p95FrameMs']:.1f}ms. This short measurement includes browser scheduling and is **not** a hardware GPU benchmark or production frame-rate guarantee. Idle rendering remains event-driven.

## Problems before city-wide expansion

1. **Road connectivity is not established.** This is a placement pilot, not a verified traversable neighbourhood. Most parcels lack explicit frontage/access links. Do not present invented streets as cadastral truth.
2. **Asset coverage is incomplete.** Low-rise residential, college/utility and small civic models are needed. Park/parking assemblies are too large; smaller assemblies or separately calibrated appropriate source assets are needed. Empty/marked parcels are intentional.
3. **Source footprint disagreement remains.** See the per-building issues in `data/pilot-plan.json`; crossing observed footprints cannot safely dictate placement. No correction or authority decision was fabricated.
4. **Draw calls remain high.** Although instancing helps, complex building assets still dominate. Profile target hardware and consider model-level draw-call reduction/LOD and cell loading before expanding.
5. **Underlying topology risks persist.** Stage 4's canonical overlaps were not repaired by decoration. Pilot placement envelopes do not overlap, but that does not certify the cadastral fabric.

## Reproduction

`npm ci`; `npm run test:install-browser`; `npm test` runs pilot, dataset, asset and previous foundation/UI tests. Install Python requirements from `tools/requirements-import.txt`; `python tests/test_pilot.py` runs placement validation. Regenerate using `python tools/build_pilot.py /path/to/PRAMAN_DATA`, then `python tools/report_pilot.py` after browser tests. The supplied property_type column is read at build time; rendering never reads workbook column names. Raw/evaluation files remain excluded.

## Per-parcel inventory

| Actual parcel ID | Property type | Building records represented | GLB / marker count |
|---|---|---:|---|
'''
for i in p['parcelIds']:
 rows=[x for x in p['placements'] if x['parcelId']==i and x['kind']=='building'];text+=f"| {i} | {p['propertyTypes'][i]} | {len(rows)} | {sum(bool(x['assetId']) for x in rows)} / {sum(not x['assetId'] for x in rows)} |\n"
text+='\n## Unique placement issue counts\n\n| Issue | Records |\n|---|---:|\n'
for reason,n in reasons.items():text+=f'| {reason} | {n} |\n'
text+='\nFull asset placements, exact footprint envelopes, source-related issue IDs, semantic classifications, orientation provenance and selection adjacency are in `data/pilot-plan.json`.\n'
(R/'docs/STAGE5_PILOT_REPORT.md').write_text(text)
print(dict(reasons))
