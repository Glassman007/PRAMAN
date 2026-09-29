import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_DEFINITIONS } from '../src/data/pramanDatasetConfig.js';
import { parsePramanTable } from '../src/data/pramanTableParser.js';
import { buildPramanDataModel, validatePramanDataModel } from '../src/data/pramanDataModel.js';
import { buildReconciliationWorkspace } from '../src/data/reconciliationWorkspace.js';

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

let casesChecked = 0;
let workspaces = 0;
let readOnlyCases = 0;
let historicalWorkspaces = 0;
let workspacesWithProposalDifferences = 0;
let workspacesWithSpatialComparison = 0;
let proposedGeometries = 0;
let matchedObservationRefs = 0;
let unresolvedConflictRefs = 0;

for (const parcelCase of model.parcelConflictCases) {
  casesChecked += 1;
  const selectedConflict = parcelCase.openConflicts[0] ?? parcelCase.conflicts[0] ?? null;
  const workspace = buildReconciliationWorkspace(model, parcelCase.parcelId, selectedConflict?.conflict_id ?? null);
  if (!parcelCase.openConflicts.length) {
    readOnlyCases += 1;
    assert(!workspace.valid && workspace.reason === 'SELECTED_CONFLICT_NOT_OPEN', `${parcelCase.parcelId}: resolved-only case must remain read-only in reconciliation.`);
    continue;
  }
  workspaces += 1;
  assert(workspace.valid, `${parcelCase.parcelId}: open conflict reconciliation workspace did not reconstruct.`);
  if (!workspace.valid) continue;

  assert(workspace.parcelCase === parcelCase, `${parcelCase.parcelId}: workspace did not retain the indexed parcel case.`);
  assert(workspace.reconciliation === model.reconciliationByParcelId.get(parcelCase.parcelId), `${parcelCase.parcelId}: reconciliation row is not dataset indexed row.`);
  assert(workspace.selectedConflict?.canonical_parcel_id === parcelCase.parcelId, `${parcelCase.parcelId}: selected conflict does not belong to parcel.`);
  assert(workspace.proposalComparison.length === Object.keys(workspace.reconciliation.proposed_state ?? {}).length, `${parcelCase.parcelId}: proposal comparison added or dropped proposal fields.`);

  if (parcelCase.isHistorical) historicalWorkspaces += 1;
  if (workspace.proposalDifferences.length) workspacesWithProposalDifferences += 1;
  if (workspace.spatial.entries.length) workspacesWithSpatialComparison += 1;

  for (const { conflictId, conflict } of workspace.unresolvedConflicts) {
    unresolvedConflictRefs += 1;
    assert(conflict, `${parcelCase.parcelId}: unresolved conflict ${conflictId} did not resolve.`);
    assert(conflict?.canonical_parcel_id === parcelCase.parcelId, `${parcelCase.parcelId}: unresolved conflict ${conflictId} resolves to another parcel.`);
  }

  for (const { observationId, observation } of workspace.matchedObservations) {
    matchedObservationRefs += 1;
    assert(observation, `${parcelCase.parcelId}: matched source ID ${observationId} did not resolve to SOURCE_OBSERVATIONS.`);
  }

  const proposedGeometryId = workspace.reconciliation.proposed_state?.geometry_id ?? null;
  if (proposedGeometryId) {
    proposedGeometries += 1;
    assert(workspace.spatial.proposedGeometryResolved, `${parcelCase.parcelId}: proposed geometry ${proposedGeometryId} did not resolve.`);
    assert(workspace.spatial.entries.some((entry) => entry.role === 'proposed' && entry.geometryId === proposedGeometryId), `${parcelCase.parcelId}: proposed geometry is missing from spatial comparison.`);
  }

  for (const entry of workspace.spatial.entries) {
    assert(entry.geometry && ['Polygon', 'MultiPolygon'].includes(entry.geometry.type), `${parcelCase.parcelId}: spatial comparison contains unsupported/generated geometry.`);
    assert(entry.geometryId, `${parcelCase.parcelId}: spatial comparison entry is missing dataset geometry ID.`);
  }
}

assert(casesChecked === model.parcelConflictCases.length, 'Every parcel conflict case must be checked.');
assert(workspaces > 0, 'No open-conflict reconciliation workspaces were exercised.');
assert(readOnlyCases > 0, 'No resolved-only read-only reconciliation cases were exercised.');
assert(historicalWorkspaces > 0, 'Historical reconciliation cases were not exercised.');
assert(workspacesWithProposalDifferences > 0, 'No dataset proposal differences were detected.');
assert(workspacesWithSpatialComparison > 0, 'No spatial reconciliation comparisons were generated.');
assert(proposedGeometries > 0, 'No proposed geometry IDs were exercised.');
assert(matchedObservationRefs > 0, 'No matched source observations were exercised.');
assert(unresolvedConflictRefs > 0, 'No unresolved conflict references were exercised.');

const sampleCase = model.parcelConflictCases.find((parcelCase) => parcelCase.openConflicts.length > 0);
assert(Boolean(sampleCase), 'No parcel case with an open conflict was available for route validation.');
const otherCase = model.parcelConflictCases.find((parcelCase) => parcelCase.parcelId !== sampleCase.parcelId);
const missingConflictContext = buildReconciliationWorkspace(model, sampleCase.parcelId, null);
assert(!missingConflictContext.valid && missingConflictContext.reason === 'CONFLICT_CONTEXT_REQUIRED', 'Missing conflict route context must fail cleanly rather than selecting an arbitrary conflict.');
const invalidConflictContext = buildReconciliationWorkspace(model, sampleCase.parcelId, otherCase?.conflicts[0]?.conflict_id ?? '__invalid__');
assert(!invalidConflictContext.valid && invalidConflictContext.reason === 'CONFLICT_NOT_FOUND_FOR_PARCEL', 'Foreign/invalid conflict route context must fail cleanly rather than selecting an arbitrary conflict.');
const invalidParcelContext = buildReconciliationWorkspace(model, '__invalid_parcel__', sampleCase.openConflicts[0].conflict_id);
assert(!invalidParcelContext.valid && invalidParcelContext.reason === 'PARCEL_CASE_NOT_FOUND', 'Invalid parcel route context must fail cleanly.');

const mixedCase = model.parcelConflictCases.find((parcelCase) => parcelCase.openConflicts.length && parcelCase.resolvedConflicts.length);
assert(Boolean(mixedCase), 'No mixed open/resolved case was available to verify the resolved-conflict guard.');
if (mixedCase) {
  const resolvedContext = buildReconciliationWorkspace(model, mixedCase.parcelId, mixedCase.resolvedConflicts[0].conflict_id);
  assert(!resolvedContext.valid && resolvedContext.reason === 'SELECTED_CONFLICT_NOT_OPEN', 'Resolved conflict direct route must be rejected as read-only.');
}

const appSource = await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8');
const reconciliationSource = await fs.readFile(path.join(root, 'src/components/ReconciliationEntry.jsx'), 'utf8');
const navigationSource = await fs.readFile(path.join(root, 'src/navigation/workspaceNavigation.js'), 'utf8');
const reviewerSource = await fs.readFile(path.join(root, 'src/data/reviewerStateService.js'), 'utf8');
const workspaceSource = await fs.readFile(path.join(root, 'src/data/reconciliationWorkspace.js'), 'utf8');
const allSource = [appSource, reconciliationSource, navigationSource, reviewerSource, workspaceSource].join('\n');

for (const forbidden of ['localhost:5173', 'localhost:5174', 'parcel-grid.png', 'Math.random(', 'Queue age', 'Suggested', 'Desk Review']) {
  assert(!allSource.includes(forbidden), `Forbidden legacy reconciliation behavior remains: ${forbidden}`);
}

assert(appSource.includes('>\n            Conflict Explorer\n          </button>'), 'Conflict Explorer must remain the top-level conflict navigation item.');
assert(!/nav[\s\S]{0,900}>\s*Reconciliation\s*</i.test(appSource), 'Reconciliation must not be a permanent top-navigation item.');
assert(reconciliationSource.includes('buildReconciliationWorkspace(model, parcelId, selectedConflictId)'), 'Reconciliation UI must reconstruct from dataset identifiers.');
assert(reconciliationSource.includes('RECONCILED_PARCELS.unresolved_conflicts'), 'Unresolved conflict IDs must be represented as dataset reconciliation state.');
assert(reconciliationSource.includes('Reviewer/session state'), 'Reviewer state must be visibly separated from dataset state.');
assert(reviewerSource.includes('window.localStorage'), 'Prototype reviewer actions must persist through a separate local review-state service.');
assert(reviewerSource.includes('keyFor(parcelId, conflictId)'), 'Reviewer state must be scoped by stable parcel and conflict IDs.');
assert(reviewerSource.includes('actionsById') && reviewerSource.includes('[actionId]'), 'Reviewer activity must be keyed by stable action IDs rather than array position.');
assert(!reviewerSource.includes('RECONCILED_PARCELS'), 'Reviewer state service must not rewrite reconciliation dataset rows.');
assert(workspaceSource.includes('reconciliation?.proposed_state'), 'Parsed proposed_state must drive the proposal comparison.');
for (const field of ['overall_match_confidence', 'geometry_confidence', 'ownership_confidence', 'land_use_confidence', 'lineage_confidence', 'reconciliation_confidence']) {
  assert(reconciliationSource.includes(field), `Independent confidence field missing from reconciliation UI: ${field}`);
}

if (failures.length) {
  console.error(`Reconciliation workspace validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Reconciliation workspace validation passed.');
console.log(`Parcel conflict cases checked: ${casesChecked}`);
console.log(`Open-conflict reconciliation workspaces: ${workspaces}`);
console.log(`Resolved-only read-only cases: ${readOnlyCases}`);
console.log(`Historical reconciliation cases: ${historicalWorkspaces}`);
console.log(`Cases with proposal differences: ${workspacesWithProposalDifferences}`);
console.log(`Cases with dataset spatial comparison: ${workspacesWithSpatialComparison}`);
console.log(`Proposed geometry references checked: ${proposedGeometries}`);
console.log(`Matched observation references checked: ${matchedObservationRefs}`);
console.log(`Unresolved conflict references checked: ${unresolvedConflictRefs}`);
console.log('Reviewer actions remain separate local/session state and do not mutate CSV-derived records.');
