import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js';
import { fileURLToPath } from 'node:url';
import {
  LINEAGE_MODES,
  allLineageEdges,
  buildGraphLayout,
  crossCellEdge,
  defaultLineageMode,
  nodeState,
  relationshipSummary,
  visibleLineageEdges
} from './src/lineageGraph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, 'public/layer4-data');
const detailRoot = path.join(dataRoot, 'parcels');
const index = JSON.parse(fs.readFileSync(path.join(dataRoot, 'index.json'), 'utf8'));
const details = {};
for (const summary of index.parcels) {
  const detail = JSON.parse(fs.readFileSync(path.join(detailRoot, `${encodeURIComponent(summary.parcelId)}.json`), 'utf8'));
  details[summary.parcelId] = detail;
}

const uniqueEdges = allLineageEdges(details);
assert(uniqueEdges.length > 0, 'Dataset exposes no explicit parcel lineage edges');

const expectedEdgeKeys = new Set();
for (const detail of Object.values(details)) {
  for (const edge of detail.lineage?.edges || []) {
    expectedEdgeKeys.add(`${edge.lineageEventId || ''}|${edge.parentParcelId}|${edge.childParcelId}|${edge.eventSubtype || edge.semanticType || ''}`);
    assert(edge.parentParcelId && edge.childParcelId, 'Lineage edge missing explicit parent/child identity');
    assert(['SPLIT', 'MERGE'].includes(edge.semanticType), `Unsupported inferred semantic lineage type: ${edge.semanticType}`);
    assert(details[edge.parentParcelId], `Parent parcel ${edge.parentParcelId} missing from Layer 4 directory`);
    assert(details[edge.childParcelId], `Child parcel ${edge.childParcelId} missing from Layer 4 directory`);
  }
}
assert.equal(uniqueEdges.length, expectedEdgeKeys.size, 'Lineage graph duplicates explicit lineage rows');

const eventSubtypes = [...new Set(uniqueEdges.map((edge) => edge.eventSubtype).filter(Boolean))].sort();
const permittedFromDataset = ['CROSS_CELL_MERGE', 'CROSS_CELL_SPLIT', 'MERGE', 'REDEVELOPMENT_CONSOLIDATION', 'SPLIT'];
assert.deepEqual(eventSubtypes, permittedFromDataset, 'Lineage relationship subtypes differ from current dataset');

let actualCrossCell = 0;
let crossCellSubtype = 0;
for (const edge of uniqueEdges) {
  if (crossCellEdge(edge, details)) actualCrossCell += 1;
  if (String(edge.eventSubtype || '').startsWith('CROSS_CELL_')) crossCellSubtype += 1;
}
assert(actualCrossCell > 0, 'No true cross-cell lineage relationship was preserved');
assert(crossCellSubtype >= actualCrossCell, 'Cross-cell lineage subtype coverage is inconsistent');

const active = Object.values(details).find((detail) => detail.parcel.identityClass === 'ACTIVE_CANONICAL' && detail.lineage?.parents?.length);
const historical = Object.values(details).find((detail) => detail.parcel.identityClass === 'HISTORICAL_RETIRED' && detail.lineage?.children?.length);
assert(active, 'No active parcel with ancestry found for default-mode validation');
assert(historical, 'No historical parcel with descendants found for full-lineage validation');
assert.equal(defaultLineageMode(active.parcel), LINEAGE_MODES.ANCESTORS, 'Current parcel must default to Ancestors');
assert.equal(defaultLineageMode(historical.parcel), LINEAGE_MODES.FULL, 'Historical parcel must default to Full Lineage');
assert.equal(nodeState(active).key, 'current', 'Active authoritative parcel node lost current-authoritative semantics');
assert.equal(nodeState(historical).key, 'historical', 'Historical parcel node lost historical semantics');
assert(!nodeState(active).label.includes('PROPOSED'), 'Pending proposal marker must not replace current parcel node status');

const initialVisible = new Set([active.parcel.parcelId, ...(active.lineage.parents || [])]);
const initialMap = Object.fromEntries([...initialVisible].map((id) => [id, details[id]]));
const visibleEdges = visibleLineageEdges(initialMap, initialVisible);
assert(visibleEdges.length > 0, 'Immediate ancestry does not render explicit relationship edges');
const layout = buildGraphLayout(active.parcel.parcelId, initialMap, initialVisible, LINEAGE_MODES.ANCESTORS);
const selectedPosition = layout.positions[active.parcel.parcelId];
for (const parentId of active.lineage.parents) {
  assert(layout.positions[parentId], `Parent ${parentId} missing from ancestor layout`);
  assert(layout.positions[parentId].y > selectedPosition.y, 'Earlier ancestry must appear below the selected current parcel');
}

const historicalInitial = new Set([historical.parcel.parcelId, ...(historical.lineage.parents || []), ...(historical.lineage.children || [])]);
const historicalMap = Object.fromEntries([...historicalInitial].map((id) => [id, details[id]]));
const fullLayout = buildGraphLayout(historical.parcel.parcelId, historicalMap, historicalInitial, LINEAGE_MODES.FULL);
for (const parentId of historical.lineage.parents || []) {
  assert(fullLayout.positions[parentId].y > fullLayout.positions[historical.parcel.parcelId].y, 'Historical ancestor must render below selected parcel in Full Lineage');
}
for (const childId of historical.lineage.children || []) {
  assert(fullLayout.positions[childId].y < fullLayout.positions[historical.parcel.parcelId].y, 'Historical descendant must render above selected parcel in Full Lineage');
}

const summary = relationshipSummary(historical);
assert(Array.isArray(summary.children) && summary.children.length > 0, 'Node inspector must expose descendants from explicit lineage');
assert(summary.ended !== 'No explicit descendant relationship recorded', 'Historical lineage ending summary ignored explicit outgoing edges');

const lineageSource = fs.readFileSync(path.join(__dirname, 'src/ParcelLineage.jsx'), 'utf8');
const timelineSource = fs.readFileSync(path.join(__dirname, 'src/ParcelTimeline.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, 'src/App.jsx'), 'utf8');
assert(timelineSource.includes('PARCEL LINEAGE VIEW'), 'Parcel History does not expose the Parcel Lineage View action');
assert(appSource.includes("view === 'lineage'"), 'App route does not isolate Lineage as a second Layer 4 view');
assert(lineageSource.includes('Expand Earlier'), 'Progressive ancestry expansion control missing');
assert(lineageSource.includes('Expand Descendants'), 'Progressive descendant expansion control missing');
assert(lineageSource.includes('Fit Graph'), 'Fit Graph control missing');
assert(lineageSource.includes('Reset'), 'Reset control missing');
assert(lineageSource.includes('OPEN FULL HISTORY'), 'Node inspector does not gate full-history navigation behind explicit action');
assert(lineageSource.includes('setSelectedNodeId(id)'), 'Node click does not open the node inspector first');
assert(!lineageSource.includes('fetchParcelHistoryIndex'), 'Lineage view must not pre-render or fetch the whole parcel directory');
assert(!lineageSource.includes('SURVEY_OBSERVATION') && !lineageSource.includes('CONFLICT') && !lineageSource.includes('OFFICIAL_APPROVAL'), 'History-only event classes leaked into lineage graph rendering');

for (const file of ['src/ParcelLineage.jsx', 'src/ParcelTimeline.jsx', 'src/App.jsx']) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext
    },
    reportDiagnostics: true,
    fileName: file
  });
  const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `${file}: JSX parse errors: ${errors.map((e) => e.messageText).join('; ')}`);
}

console.log(JSON.stringify({
  ok: true,
  parcelIdentities: index.parcels.length,
  explicitLineageEdges: uniqueEdges.length,
  relationshipSubtypes: eventSubtypes,
  crossCellSubtypeEdges: crossCellSubtype,
  trueCrossCellEdges: actualCrossCell,
  activeDefaultParcel: active.parcel.parcelId,
  historicalDefaultParcel: historical.parcel.parcelId
}, null, 2));
