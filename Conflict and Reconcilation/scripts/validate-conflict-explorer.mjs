import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_DEFINITIONS } from '../src/data/pramanDatasetConfig.js';
import { parsePramanTable } from '../src/data/pramanTableParser.js';
import { buildPramanDataModel, validatePramanDataModel } from '../src/data/pramanDataModel.js';
import {
  EMPTY_FILTERS,
  contextualOptionCounts,
  deriveFilterOptions,
  filterParcelCases,
  getCaseStatus,
} from '../src/data/conflictExplorerSelectors.js';

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
const validationIssues = validatePramanDataModel(model);
assert(validationIssues.length === 0, `Runtime relationship validation produced ${validationIssues.length} warning(s).`);

const uniqueConflictParcelIds = new Set(tables.conflicts.map((row) => row.canonical_parcel_id));
assert(model.parcelConflictCases.length === uniqueConflictParcelIds.size, 'Conflict Explorer must expose exactly one case per conflicted parcel ID.');
assert(model.parcelConflictCases.every((parcelCase) => parcelCase.conflicts.length >= 1), 'Every parcel case must retain its individual conflict records.');
assert(model.parcelConflictCases.some((parcelCase) => parcelCase.conflicts.length > 1), 'Dataset contains multi-conflict parcels but the case model did not retain them.');
assert(model.parcelConflictCases.every((parcelCase) => parcelCase.isCurrent || parcelCase.isHistorical), 'Every conflict case must resolve to current or historical parcel context.');
assert(model.parcelConflictCases.filter((parcelCase) => parcelCase.isHistorical).every((parcelCase) => parcelCase.historicalParcel), 'Historical cases must resolve through HISTORICAL_PARCELS.');

const caseStates = new Set(model.parcelConflictCases.map(getCaseStatus));
assert(caseStates.has('OPEN'), 'Derived case states should include OPEN when open conflicts exist.');
assert(caseStates.has('RESOLVED'), 'Derived case states should include RESOLVED when fully resolved cases exist.');
if (model.parcelConflictCases.some((parcelCase) => parcelCase.openConflicts.length && parcelCase.resolvedConflicts.length)) {
  assert(caseStates.has('MIXED'), 'Mixed open/resolved cases must be explicitly represented as MIXED in the UI-derived state.');
}

const options = deriveFilterOptions(model.parcelConflictCases);
const expectedStatuses = new Set(tables.conflicts.map((row) => row.status).filter(Boolean));
assert(options.status.length === expectedStatuses.size && options.status.every((value) => expectedStatuses.has(value)), 'Conflict-status filters must come from CONFLICTS.status.');
const expectedTypes = new Set(tables.conflicts.map((row) => row.conflict_type).filter(Boolean));
assert(options.conflictType.length === expectedTypes.size && options.conflictType.every((value) => expectedTypes.has(value)), 'Conflict-type filters must come from the loaded dataset.');
const expectedSources = new Set(tables.conflicts.flatMap((row) => [row.source_a, row.source_b]).filter(Boolean));
assert(options.sourceType.every((value) => model.parcelConflictCases.some((parcelCase) => parcelCase.sourceTypes.includes(value))), 'Source filters must correspond to loaded case sources.');
assert([...expectedSources].every((value) => options.sourceType.includes(value)), 'Every conflict source type must be represented in the source filter options.');

const firstCase = model.parcelConflictCases[0];
assert(filterParcelCases(model.parcelConflictCases, { ...EMPTY_FILTERS, search: firstCase.parcelId }).some((item) => item.parcelId === firstCase.parcelId), 'Parcel ID search must find its case.');
const firstConflict = firstCase.conflicts[0];
assert(filterParcelCases(model.parcelConflictCases, { ...EMPTY_FILTERS, search: firstConflict.conflict_id }).some((item) => item.parcelId === firstCase.parcelId), 'Conflict ID search must find its parcel case.');
if (firstCase.sourceTypes[0]) {
  assert(filterParcelCases(model.parcelConflictCases, { ...EMPTY_FILTERS, search: firstCase.sourceTypes[0] }).some((item) => item.parcelId === firstCase.parcelId), 'Source-type search must find matching parcel cases.');
}

for (const key of ['status', 'conflictType', 'severity', 'criticality', 'humanReview', 'sourceType', 'parcelKind', 'cell']) {
  const values = options[key];
  if (!values.length) continue;
  const counts = contextualOptionCounts(model.parcelConflictCases, EMPTY_FILTERS, key, values);
  const summed = [...counts.values()].reduce((total, count) => total + count, 0);
  assert([...counts.values()].every((count) => Number.isInteger(count) && count >= 0), `${key} contextual filter counts must be calculated non-negative integers.`);
  assert(summed > 0, `${key} contextual filter counts unexpectedly sum to zero.`);
}

const srcFiles = [
  'src/App.jsx',
  'src/components/ConflictExplorer.jsx',
  'src/components/ParcelConflictCaseDetail.jsx',
  'src/data/conflictExplorerSelectors.js',
  'src/navigation/workspaceNavigation.js',
];
const source = (await Promise.all(srcFiles.map((file) => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
for (const forbidden of ['Queue age', 'parcel-grid.png', 'localhost:5173', 'localhost:5174', 'Suggested', 'In Progress', 'Escalated']) {
  assert(!source.includes(forbidden), `Obsolete UI/runtime assumption remains: ${forbidden}`);
}
const app = await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8');
const nav = app.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? '';
assert(nav.includes('Conflict Explorer'), 'Primary navigation must expose Conflict Explorer.');
assert(!/>\s*(?:Reconciliation|Reconcile)\s*</i.test(nav), 'Primary navigation must not expose a separate Reconciliation/Reconcile entry.');

for (const derivedNumber of [
  model.aggregates.totalConflictRecords,
  model.aggregates.affectedParcelCases,
  model.aggregates.openConflictRecords,
  model.aggregates.resolvedConflictRecords,
]) {
  if (derivedNumber >= 100) assert(!new RegExp(`\\b${derivedNumber}\\b`).test(source), `Dataset-derived total ${derivedNumber} appears hardcoded in application source.`);
}

if (failures.length) {
  console.error(`Conflict Explorer validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Conflict Explorer validation passed.');
console.log(`Cases: ${model.parcelConflictCases.length}`);
console.log(`Conflict records: ${model.aggregates.totalConflictRecords}`);
console.log(`Current/historical cases: ${model.parcelConflictCases.filter((item) => item.isCurrent).length}/${model.parcelConflictCases.filter((item) => item.isHistorical).length}`);
console.log(`Derived case states: ${[...caseStates].join(', ')}`);
console.log('All filter domains and displayed totals are dataset-derived.');
