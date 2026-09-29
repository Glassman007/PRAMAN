import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { TABLE_DEFINITIONS } from '../src/data/pramanDatasetConfig.js';
import { parsePramanTable } from '../src/data/pramanTableParser.js';
import { buildPramanDataModel, validatePramanDataModel } from '../src/data/pramanDataModel.js';

const root = fileURLToPath(new URL('../public/data/PRAMAN_DATA/', import.meta.url));
const tables = {};
const parseWarnings = [];

for (const [tableKey, definition] of Object.entries(TABLE_DEFINITIONS)) {
  const text = await readFile(join(root, definition.path), 'utf8');
  const parsed = parsePramanTable(tableKey, text, { onWarning: (warning) => parseWarnings.push(warning) });
  tables[tableKey] = parsed.rows;
}

const model = buildPramanDataModel(tables);
const issues = validatePramanDataModel(model);
const failures = [];

if (parseWarnings.length) failures.push(`${parseWarnings.length} CSV parse warning(s)`);
if (issues.length) failures.push(`${issues.length} runtime relationship warning(s)`);
if (model.parcelConflictCases.length !== model.conflictsByParcelId.size) {
  failures.push('ParcelConflictCase count does not match the number of conflict-bearing parcel IDs.');
}
if ([...model.parcelConflictCaseByParcelId.values()].some((parcelCase) => parcelCase.conflicts.length === 0)) {
  failures.push('At least one ParcelConflictCase has no conflicts.');
}
if ([...model.geometryById.values()].some((row) => row.normalized_geometry_wkt && !row.normalizedGeometry)) {
  failures.push('At least one source normalized WKT geometry failed to parse.');
}
if ([...model.geometryVersionById.values()].some((row) => row.geometry_wkt && !row.geometry)) {
  failures.push('At least one authoritative/historical geometry WKT failed to parse.');
}

const selectorChecks = [
  ['total conflicts', model.selectors.getTotalConflictRecords(), tables.conflicts.length],
  ['affected parcel cases', model.selectors.getAffectedParcelCases(), model.conflictsByParcelId.size],
  ['conflict-count-per-parcel index size', model.selectors.getConflictCountPerParcel().size, model.conflictsByParcelId.size],
  ['evidence-count-per-conflict index size', model.selectors.getEvidenceCountPerConflict().size, tables.conflicts.length],
];
for (const [name, actual, expected] of selectorChecks) {
  if (actual !== expected) failures.push(`${name}: selector returned ${actual}, independently derived value is ${expected}.`);
}

if (failures.length) {
  console.error('PRAMAN runtime validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  parseWarnings.slice(0, 20).forEach((warning) => console.error(`- parser: ${warning}`));
  issues.slice(0, 20).forEach((issue) => console.error(`- ${issue.code}: ${issue.message}`));
  process.exit(1);
}

const multiConflictCases = model.parcelConflictCases.filter((parcelCase) => parcelCase.conflicts.length > 1).length;
const historicalCases = model.parcelConflictCases.filter((parcelCase) => parcelCase.isHistorical).length;
console.log('PRAMAN runtime validation passed.');
console.log(`Conflict records: ${model.aggregates.totalConflictRecords}`);
console.log(`Affected parcel cases: ${model.aggregates.affectedParcelCases}`);
console.log(`Multi-conflict parcel cases: ${multiConflictCases}`);
console.log(`Historical conflict cases: ${historicalCases}`);
console.log(`Source geometries parsed: ${model.geometryById.size}`);
console.log(`Geometry versions parsed: ${model.geometryVersionById.size}`);
console.log('All configured relationship checks resolved without mock fallbacks.');
