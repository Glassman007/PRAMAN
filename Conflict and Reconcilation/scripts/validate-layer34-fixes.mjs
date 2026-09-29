import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePramanTable } from '../src/data/pramanTableParser.js';
import { TABLE_DEFINITIONS } from '../src/data/pramanDatasetConfig.js';
import { buildPramanDataModel } from '../src/data/pramanDataModel.js';
import { buildReconciliationWorkspace } from '../src/data/reconciliationWorkspace.js';
import { buildConflictInvestigation } from '../src/data/conflictInvestigation.js';
import { deriveParcelTopologyImpact } from '../src/data/spatialConflictAnalysis.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'public', 'data', 'PRAMAN_DATA');

async function loadModel() {
  const tables = {};
  for (const [tableKey, definition] of Object.entries(TABLE_DEFINITIONS)) {
    const text = await fs.readFile(path.join(DATA_ROOT, definition.path), 'utf8');
    tables[tableKey] = parsePramanTable(tableKey, text).rows;
  }
  return buildPramanDataModel(tables);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const model = await loadModel();
const mixedCase = model.parcelConflictCases.find((parcelCase) => parcelCase.openConflicts.length && parcelCase.resolvedConflicts.length);
assert(mixedCase, 'Expected at least one mixed open/resolved parcel case.');

const openId = mixedCase.openConflicts[0].conflict_id;
const resolvedId = mixedCase.resolvedConflicts[0].conflict_id;
const openWorkspace = buildReconciliationWorkspace(model, mixedCase.parcelId, openId);
const resolvedWorkspace = buildReconciliationWorkspace(model, mixedCase.parcelId, resolvedId);
assert(openWorkspace.valid, `Open conflict ${openId} should reconstruct a valid reconciliation workspace.`);
assert(!resolvedWorkspace.valid && resolvedWorkspace.reason === 'SELECTED_CONFLICT_NOT_OPEN', `Resolved conflict ${resolvedId} must be rejected as read-only.`);

const spatialCase = model.parcelConflictCases.find((parcelCase) => parcelCase.conflicts.some((conflict) => /geometry|boundary|spatial|survey|encroachment/i.test(`${conflict.conflict_type} ${conflict.attribute_or_geometry}`)));
assert(spatialCase, 'Expected at least one spatial conflict case.');
const spatialConflict = spatialCase.conflicts.find((conflict) => /geometry|boundary|spatial|survey|encroachment/i.test(`${conflict.conflict_type} ${conflict.attribute_or_geometry}`));
const investigation = buildConflictInvestigation(model, spatialCase, spatialConflict);
assert(investigation?.hasGeometry, `Spatial conflict ${spatialConflict.conflict_id} should resolve geometry.`);
assert(investigation.geometryDiscrepancy === null || Number.isFinite(investigation.geometryDiscrepancy.maxSeparationMeters), 'Geometry discrepancy must be null or dataset-derived numeric analysis.');

const topologyCase = model.parcelConflictCases.find((parcelCase) => parcelCase.currentGeometry?.geometry && deriveParcelTopologyImpact(model, parcelCase).neighbours.length > 0);
assert(topologyCase, 'Expected at least one conflict parcel with an authoritative touching neighbour.');
const topology = deriveParcelTopologyImpact(model, topologyCase);
assert(topology.neighbours.every((neighbour) => neighbour.parcelId !== topologyCase.parcelId), 'Topology must never return the selected parcel as its own neighbour.');
assert(topology.neighbours.every((neighbour) => neighbour.sharedLengthMeters > 0), 'Every topology neighbour must have positive derived shared-boundary length.');

const serviceText = await fs.readFile(path.join(ROOT, 'src', 'data', 'pramanDataService.js'), 'utf8');
assert(serviceText.includes('BASE_URL'), 'Dataset URLs must respect the Vite application base path.');
assert(!serviceText.includes("const manifestUrl = '/data-manifest.json'"), 'Root-only manifest URL must not return.');

const detailText = await fs.readFile(path.join(ROOT, 'src', 'components', 'ParcelConflictCaseDetail.jsx'), 'utf8');
assert(detailText.includes('selectedConflictIsOpen'), 'Case detail must guard based on the selected conflict, not merely parcel-level open count.');

console.log('Layer 3 + 4 targeted fix validation passed.');
console.log(`Mixed case checked: ${mixedCase.parcelId} (${openId} open, ${resolvedId} resolved)`);
console.log(`Spatial case checked: ${spatialCase.parcelId} / ${spatialConflict.conflict_id}`);
console.log(`Topology case checked: ${topologyCase.parcelId} / ${topology.neighbours.length} touching neighbour(s)`);
