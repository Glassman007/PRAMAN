import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_DEFINITIONS } from '../src/data/pramanDatasetConfig.js';
import { parsePramanTable } from '../src/data/pramanTableParser.js';
import { buildPramanDataModel, classifyConflictStatus, validatePramanDataModel } from '../src/data/pramanDataModel.js';
import { buildConflictInvestigation } from '../src/data/conflictInvestigation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'public', 'data', 'PRAMAN_DATA');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const tables = {};
for (const [key, definition] of Object.entries(TABLE_DEFINITIONS)) {
  const csv = await fs.readFile(path.join(dataRoot, definition.path), 'utf8');
  tables[key] = parsePramanTable(key, csv).rows;
}

const model = buildPramanDataModel(tables);
const runtimeIssues = validatePramanDataModel(model);
assert(runtimeIssues.length === 0, `Runtime relationship validation produced ${runtimeIssues.length} warning(s).`);

let investigations = 0;
let spatialInvestigations = 0;
let investigationsWithGeometry = 0;
let additionalSourceInvestigations = 0;
let nonObservationEvidenceRows = 0;

for (const parcelCase of model.parcelConflictCases) {
  for (const conflict of parcelCase.conflicts) {
    const investigation = buildConflictInvestigation(model, parcelCase, conflict);
    investigations += 1;
    assert(investigation.conflict.conflict_id === conflict.conflict_id, `Investigation changed conflict identity ${conflict.conflict_id}.`);
    assert(investigation.evidenceItems.length === (model.evidenceByConflictId.get(conflict.conflict_id) ?? []).length, `${conflict.conflict_id}: evidence join changed row count.`);

    if (conflict.source_a) assert(investigation.sourceGroups.some((group) => group.sourceType === conflict.source_a), `${conflict.conflict_id}: source A missing from dynamic source comparison.`);
    if (conflict.source_b) assert(investigation.sourceGroups.some((group) => group.sourceType === conflict.source_b), `${conflict.conflict_id}: source B missing from dynamic source comparison.`);

    const evidenceSourceTypes = new Set(investigation.evidenceItems.map((item) => item.sourceType).filter(Boolean));
    for (const sourceType of evidenceSourceTypes) {
      assert(investigation.sourceGroups.some((group) => group.sourceType === sourceType), `${conflict.conflict_id}: evidence source ${sourceType} missing from dynamic comparison.`);
    }
    if (investigation.sourceGroups.length > new Set([conflict.source_a, conflict.source_b].filter(Boolean)).size) additionalSourceInvestigations += 1;

    for (const item of investigation.evidenceItems) {
      if (item.evidence.observation_id) assert(item.observation, `${conflict.conflict_id}: evidence observation ${item.evidence.observation_id} did not resolve.`);
      if (item.evidence.geometry_id) assert(item.geometry, `${conflict.conflict_id}: evidence geometry ${item.evidence.geometry_id} did not resolve.`);
      if (!item.evidence.observation_id) nonObservationEvidenceRows += 1;
    }

    if (investigation.isSpatialConflict) spatialInvestigations += 1;
    if (investigation.hasGeometry) investigationsWithGeometry += 1;
    for (const entry of investigation.geometryEntries) {
      assert(entry.geometry && ['Polygon', 'MultiPolygon'].includes(entry.geometry.type), `${conflict.conflict_id}: unsupported displayed geometry.`);
      assert(entry.geometryId, `${conflict.conflict_id}: displayed geometry missing dataset geometry ID.`);
    }
  }
}

assert(investigations === tables.conflicts.length, 'Every conflict must produce exactly one investigation model.');
assert(investigationsWithGeometry > 0, 'No conflict investigations resolved dataset geometry.');
assert(spatialInvestigations > 0, 'No conflicts were recognized as spatial from their dataset fields.');
assert(nonObservationEvidenceRows > 0, 'Non-observation evidence was expected but none was retained by investigation joins.');
assert(additionalSourceInvestigations > 0, 'No conflict retained supporting source types beyond source A/source B.');

for (const parcelCase of model.parcelConflictCases) {
  const expectedOpen = parcelCase.conflicts.filter((conflict) => classifyConflictStatus(conflict.status) === 'open').map((conflict) => conflict.conflict_id);
  assert(expectedOpen.length === parcelCase.openConflicts.length, `${parcelCase.parcelId}: reconciliation open-conflict context is inconsistent.`);
}

const filesToScan = [
  'src/components/ParcelConflictCaseDetail.jsx',
  'src/components/GeometryEvidenceMap.jsx',
  'src/components/ReconciliationEntry.jsx',
  'src/data/conflictInvestigation.js',
  'src/navigation/workspaceNavigation.js',
  'src/App.jsx',
];
const source = (await Promise.all(filesToScan.map((file) => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
for (const forbidden of ['parcel-grid.png', 'localhost:5173', 'localhost:5174', 'Math.random(', 'Revenue | Survey | Canonical']) {
  assert(!source.includes(forbidden), `Forbidden legacy/static investigation behavior remains: ${forbidden}`);
}

const navigationSource = await fs.readFile(path.join(root, 'src/navigation/workspaceNavigation.js'), 'utf8');
assert(navigationSource.includes("const SELECTED_CONFLICT_PARAM = 'conflict'"), 'Selected conflict ID must be encoded in navigation state.');
assert(navigationSource.includes("const OPEN_CONFLICTS_PARAM = 'open_conflicts'"), 'Open conflict IDs must be encoded in reconciliation navigation state.');
assert(navigationSource.includes("context: 'parcel-conflict-case'"), 'Reconciliation navigation must identify parcel-conflict-case context.');

const reconciliationSource = await fs.readFile(path.join(root, 'src/components/ReconciliationEntry.jsx'), 'utf8');
const reconciliationWorkspaceSource = await fs.readFile(path.join(root, 'src/data/reconciliationWorkspace.js'), 'utf8');
assert(reconciliationSource.includes('buildReconciliationWorkspace(model, parcelId, selectedConflictId)'), 'Reconciliation UI must reconstruct through the dataset workspace model.');
assert(reconciliationWorkspaceSource.includes('model.parcelConflictCaseByParcelId.get(parcelId)'), 'Reconciliation workspace must reconstruct the parcel case from the dataset model.');
assert(reconciliationWorkspaceSource.includes('model.conflictById.get(conflictId)'), 'Reconciliation workspace must resolve dataset conflict references from the conflict index.');

if (failures.length) {
  console.error(`Conflict case workspace validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Conflict case workspace validation passed.');
console.log(`Investigations checked: ${investigations}`);
console.log(`Spatial investigations: ${spatialInvestigations}`);
console.log(`Investigations with displayed dataset geometry: ${investigationsWithGeometry}`);
console.log(`Investigations with additional supporting source types: ${additionalSourceInvestigations}`);
console.log(`Non-observation evidence rows retained: ${nonObservationEvidenceRows}`);
console.log('Reconciliation handoff is URL-reconstructable from parcel ID, selected conflict ID, and open conflict IDs.');
