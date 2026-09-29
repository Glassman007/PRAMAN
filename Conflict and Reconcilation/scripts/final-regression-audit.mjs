import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_DEFINITIONS, REQUIRED_PRODUCTION_PATHS } from '../src/data/pramanDatasetConfig.js';
import { parsePramanTable } from '../src/data/pramanTableParser.js';
import { buildPramanDataModel, validatePramanDataModel } from '../src/data/pramanDataModel.js';
import { buildReconciliationWorkspace } from '../src/data/reconciliationWorkspace.js';
import { deriveFilterOptions, getCaseStatus } from '../src/data/conflictExplorerSelectors.js';
import { buildConflictInvestigation } from '../src/data/conflictInvestigation.js';
import { computeGeometryViewport } from '../src/data/geometryViewport.js';
import {
  readWorkspaceLocation,
  navigateWorkspace,
  openConflictCase,
  openReconciliation,
} from '../src/navigation/workspaceNavigation.js';
import {
  loadReviewerActivity,
  loadReviewerState,
  saveReviewerState,
  clearReviewerState,
} from '../src/data/reviewerStateService.js';

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
const relationshipIssues = validatePramanDataModel(model);
assert(relationshipIssues.length === 0, `Runtime relationship validation produced ${relationshipIssues.length} issue(s).`);

// A — stale old-world assumptions in runtime application sources.
const srcFiles = [];
async function collectFiles(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(full);
    else if (/\.(?:js|jsx)$/.test(entry.name)) srcFiles.push(full);
  }
}
await collectFiles(path.join(root, 'src'));
const applicationSource = (await Promise.all(srcFiles.map((file) => fs.readFile(file, 'utf8')))).join('\n');
const stalePatterns = [
  /\b128\b/,
  /parcel-grid\.png/i,
  /Queue age/i,
  /localhost:5173/i,
  /localhost:5174/i,
  /\bDesk Review\b/i,
  /\bSenior Review\b/i,
  /\bSuggested\b/,
  /\bIn Progress\b/,
  /\bEscalated\b/,
  /Revenue\s*\|\s*Survey\s*\|\s*Canonical/i,
];
for (const pattern of stalePatterns) assert(!pattern.test(applicationSource), `Stale runtime assumption remains: ${pattern}`);

const appSource = await fs.readFile(path.join(root, 'src', 'App.jsx'), 'utf8');
const nav = appSource.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? '';
assert(nav.includes('Conflict Explorer'), 'Primary conflict navigation does not expose Conflict Explorer.');
assert(!/>\s*(?:Reconciliation|Reconcile)\s*</i.test(nav), 'Reconciliation appears as an independent top-navigation entry.');

// B — visible numeric values are expressions/data, not literal dashboard KPIs.
for (const file of srcFiles.filter((file) => file.endsWith('.jsx'))) {
  const source = await fs.readFile(file, 'utf8');
  const literalTextNumbers = [...source.matchAll(/>\s*(\d+(?:\.\d+)?%?)\s*</g)].map((match) => match[1]);
  assert(literalTextNumbers.length === 0, `${path.relative(root, file)} contains visible literal numeric text: ${literalTextNumbers.join(', ')}`);
}
const keyDerivedTotals = [
  model.aggregates.totalConflictRecords,
  model.aggregates.affectedParcelCases,
  model.aggregates.openConflictRecords,
  model.aggregates.resolvedConflictRecords,
  model.aggregates.parcelsRequiringHumanReview,
  model.geometryById.size,
  model.geometryVersionById.size,
];
for (const value of keyDerivedTotals.filter((item) => item >= 100)) {
  assert(!new RegExp(`\\b${value}\\b`).test(applicationSource), `Dataset-derived aggregate ${value} is hardcoded in application source.`);
}

// C — dynamic category discovery, including removal from a changed runtime case projection.
const baseOptions = deriveFilterOptions(model.parcelConflictCases);
const dimensionSpecs = [
  ['status', 'conflicts', 'status'],
  ['conflictType', 'conflicts', 'conflict_type'],
  ['severity', 'conflicts', 'severity'],
  ['criticality', 'conflicts', 'criticality'],
];
for (const [optionKey, , rowField] of dimensionSpecs) {
  const removed = baseOptions[optionKey][0];
  if (!removed) continue;
  const changedCases = model.parcelConflictCases
    .map((parcelCase) => {
      const conflicts = parcelCase.conflicts.filter((conflict) => conflict[rowField] !== removed);
      return {
        ...parcelCase,
        conflicts,
        conflictTypes: [...new Set(conflicts.map((conflict) => conflict.conflict_type).filter(Boolean))],
      };
    })
    .filter((parcelCase) => parcelCase.conflicts.length);
  const changedOptions = deriveFilterOptions(changedCases);
  assert(!changedOptions[optionKey].includes(removed), `${optionKey} still exposes a category removed from the changed runtime case projection.`);
}
if (baseOptions.sourceType[0]) {
  const removed = baseOptions.sourceType[0];
  const changed = model.parcelConflictCases.map((parcelCase) => ({
    ...parcelCase,
    sourceTypes: parcelCase.sourceTypes.filter((value) => value !== removed),
  }));
  assert(!deriveFilterOptions(changed).sourceType.includes(removed), 'Source filter retains a source type absent from the changed runtime projection.');
}
if (baseOptions.cell[0]) {
  const removed = baseOptions.cell[0];
  const changed = model.parcelConflictCases.filter((parcelCase) => parcelCase.parcelMetadata?.cell_id !== removed);
  assert(!deriveFilterOptions(changed).cell.includes(removed), 'Cell filter retains a cell absent from the changed runtime projection.');
}

// D — multi-conflict parcel behavior and exact selected-conflict reconstruction.
const multiCase = [...model.parcelConflictCases].filter((parcelCase) => parcelCase.openConflicts.length > 1).sort((a, b) => b.openConflicts.length - a.openConflicts.length)[0];
assert(multiCase?.openConflicts.length > 1, 'No multi-open-conflict parcel case was available for reconciliation regression testing.');
if (multiCase?.openConflicts.length > 1) {
  const first = multiCase.openConflicts[0];
  const second = multiCase.openConflicts[1];
  const firstWorkspace = buildReconciliationWorkspace(model, multiCase.parcelId, first.conflict_id);
  const secondWorkspace = buildReconciliationWorkspace(model, multiCase.parcelId, second.conflict_id);
  assert(firstWorkspace.valid && secondWorkspace.valid, 'Multi-conflict reconciliation routes did not reconstruct.');
  assert(firstWorkspace.selectedConflict?.conflict_id === first.conflict_id, 'First multi-conflict selection was not retained exactly.');
  assert(secondWorkspace.selectedConflict?.conflict_id === second.conflict_id, 'Changing selected conflict did not update reconciliation context exactly.');
  const expectedUnresolved = multiCase.reconciliation?.unresolved_conflicts ?? [];
  assert(firstWorkspace.unresolvedConflicts.map((item) => item.conflictId).join('|') === expectedUnresolved.join('|'), 'Reconciliation unresolved conflict IDs do not match RECONCILED_PARCELS.');
}
const mixedCase = model.parcelConflictCases.find((parcelCase) => parcelCase.openConflicts.length && parcelCase.resolvedConflicts.length);
assert(Boolean(mixedCase), 'No mixed open/resolved parcel case was available for regression testing.');
assert(!mixedCase || getCaseStatus(mixedCase) === 'MIXED', 'Mixed open/resolved parcel case is not represented as MIXED.');
if (mixedCase) {
  const resolvedWorkspace = buildReconciliationWorkspace(model, mixedCase.parcelId, mixedCase.resolvedConflicts[0].conflict_id);
  assert(!resolvedWorkspace.valid && resolvedWorkspace.reason === 'SELECTED_CONFLICT_NOT_OPEN', 'Resolved conflict inside a mixed parcel case can still enter reconciliation.');
}

// Direct reconciliation URLs must reject invalid context rather than silently selecting another case/conflict.
const sampleCase = model.parcelConflictCases.find((parcelCase) => parcelCase.openConflicts.length > 0);
assert(Boolean(sampleCase), 'No open-conflict parcel case was available for route regression testing.');
const foreignCase = model.parcelConflictCases.find((parcelCase) => parcelCase.parcelId !== sampleCase.parcelId);
const invalidParcelWorkspace = buildReconciliationWorkspace(model, '__INVALID_PARCEL__', sampleCase.openConflicts[0].conflict_id);
assert(!invalidParcelWorkspace.valid && invalidParcelWorkspace.reason === 'PARCEL_CASE_NOT_FOUND', 'Invalid parcel route does not produce the expected clean error state.');
const missingConflictWorkspace = buildReconciliationWorkspace(model, sampleCase.parcelId, null);
assert(!missingConflictWorkspace.valid && missingConflictWorkspace.reason === 'CONFLICT_CONTEXT_REQUIRED', 'Missing reconciliation conflict context silently falls back instead of failing.');
const foreignConflictWorkspace = buildReconciliationWorkspace(model, sampleCase.parcelId, foreignCase?.conflicts[0]?.conflict_id ?? '__INVALID_CONFLICT__');
assert(!foreignConflictWorkspace.valid && foreignConflictWorkspace.reason === 'CONFLICT_NOT_FOUND_FOR_PARCEL', 'Invalid/foreign conflict route silently falls back instead of failing.');

// E — historical parcel resolution.
const historicalCase = model.parcelConflictCases.find((parcelCase) => parcelCase.isHistorical && !parcelCase.isCurrent && parcelCase.openConflicts.length > 0)
  ?? model.parcelConflictCases.find((parcelCase) => parcelCase.isHistorical && !parcelCase.isCurrent);
assert(Boolean(historicalCase), 'No historical conflict case was exercised.');
if (historicalCase) {
  assert(Boolean(historicalCase.historicalParcel), 'Historical conflict case did not resolve HISTORICAL_PARCELS.');
  assert(!historicalCase.canonicalParcel, 'Historical-only case was silently substituted with a current canonical parcel.');
  assert(historicalCase.lineageReferences.length + historicalCase.geoGitEvents.length + historicalCase.geometryVersions.length > 0, 'Historical case has no supporting history/lineage/geometry context.');
  const conflict = historicalCase.openConflicts[0] ?? historicalCase.conflicts[0];
  const historicalWorkspace = buildReconciliationWorkspace(model, historicalCase.parcelId, conflict.conflict_id);
  if (historicalCase.openConflicts.length) assert(historicalWorkspace.valid, 'Open historical reconciliation workspace did not reconstruct.');
  else assert(!historicalWorkspace.valid && historicalWorkspace.reason === 'SELECTED_CONFLICT_NOT_OPEN', 'Resolved-only historical case should be read-only in reconciliation.');
}

// F — geometry must resolve to indexed WKT-derived records and fit into the viewport for different extents.
let geometryComparisonsChecked = 0;
for (const parcelCase of model.parcelConflictCases) {
  for (const conflict of parcelCase.conflicts) {
    const investigation = buildConflictInvestigation(model, parcelCase, conflict);
    if (!investigation.geometryEntries.length) continue;
    geometryComparisonsChecked += 1;
    for (const entry of investigation.geometryEntries) {
      assert(model.geometryById.has(entry.geometryId) || model.geometryVersionById.has(entry.geometryId), `${conflict.conflict_id}: displayed geometry ${entry.geometryId} is not dataset-indexed.`);
    }
    const viewport = computeGeometryViewport(investigation.geometryEntries);
    assert(viewport && Number.isFinite(viewport.scale) && viewport.scale > 0, `${conflict.conflict_id}: geometry viewport could not be fitted.`);
    if (viewport) {
      const corners = [
        [viewport.bounds.minX, viewport.bounds.minY],
        [viewport.bounds.maxX, viewport.bounds.maxY],
      ].map(viewport.project);
      for (const [x, y] of corners) {
        assert(x >= -0.001 && x <= viewport.width + 0.001 && y >= -0.001 && y <= viewport.height + 0.001, `${conflict.conflict_id}: fitted viewport projects geometry outside canvas bounds.`);
      }
    }
  }
}
assert(geometryComparisonsChecked > 1, 'Geometry regression did not exercise multiple spatial extents.');
assert(!/Math\.random\s*\(/.test(applicationSource), 'Runtime application contains random geometry/data generation.');

// G — route integration and explorer context preservation.
const sampleConflict = sampleCase.openConflicts[0];
const initialUrl = new URL('https://praman.test/?view=conflicts&ce_search=ownership&ce_status=' + encodeURIComponent(sampleConflict.status) + '&ce_sort=parcelId&ce_direction=asc&ce_page=2');
let currentUrl = new URL(initialUrl);
const localStorageMap = new Map();
const fakeLocalStorage = {
  get length() { return localStorageMap.size; },
  key(index) { return [...localStorageMap.keys()][index] ?? null; },
  getItem(key) { return localStorageMap.has(key) ? localStorageMap.get(key) : null; },
  setItem(key, value) { localStorageMap.set(key, String(value)); },
  removeItem(key) { localStorageMap.delete(key); },
};
const originalWindow = globalThis.window;
const originalPopStateEvent = globalThis.PopStateEvent;
const originalCustomEvent = globalThis.CustomEvent;
globalThis.PopStateEvent = globalThis.PopStateEvent ?? class PopStateEvent { constructor(type) { this.type = type; } };
globalThis.CustomEvent = globalThis.CustomEvent ?? class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.window = {
  get location() { return currentUrl; },
  localStorage: fakeLocalStorage,
  history: {
    pushState(_state, _title, url) { currentUrl = new URL(url); },
    replaceState(_state, _title, url) { currentUrl = new URL(url); },
  },
  dispatchEvent() {},
};
try {
  const parsedInitial = readWorkspaceLocation(globalThis.window.location);
  assert(parsedInitial.explorerState.filters.search === 'ownership', 'Explorer search context was not parsed from URL.');
  assert(parsedInitial.explorerState.filters.status === sampleConflict.status, 'Explorer filter context was not parsed from URL.');
  assert(parsedInitial.explorerState.sort.key === 'parcelId' && parsedInitial.explorerState.page === 2, 'Explorer sort/page context was not parsed from URL.');

  openConflictCase(sampleCase.parcelId, sampleConflict.conflict_id);
  assert(currentUrl.searchParams.get('ce_search') === 'ownership', 'Opening a parcel case discarded explorer search context.');
  openReconciliation(sampleCase.parcelId, sampleConflict.conflict_id, sampleCase.openConflicts.map((conflict) => conflict.conflict_id));
  assert(currentUrl.searchParams.get('ce_status') === sampleConflict.status, 'Opening reconciliation discarded explorer filter context.');
  navigateWorkspace({ view: 'conflicts', parcelId: sampleCase.parcelId, selectedConflictId: sampleConflict.conflict_id });
  const returnLocation = readWorkspaceLocation(globalThis.window.location);
  assert(returnLocation.parcelId === sampleCase.parcelId && returnLocation.selectedConflictId === sampleConflict.conflict_id, 'Returning from reconciliation did not restore the same parcel/conflict selection.');
  assert(returnLocation.explorerState.filters.search === 'ownership' && returnLocation.explorerState.page === 2, 'Returning from reconciliation did not preserve explorer search/page context.');

  // Reviewer state must be isolated by parcel + conflict + action ID, not array position.
  const conflictA = multiCase?.openConflicts[0] ?? sampleConflict;
  const conflictB = multiCase?.openConflicts[1] ?? foreignCase.conflicts[0];
  clearReviewerState(multiCase?.parcelId ?? sampleCase.parcelId);
  const reviewParcel = multiCase?.parcelId ?? sampleCase.parcelId;
  const actionA = saveReviewerState(reviewParcel, conflictA.conflict_id, { actionId: 'audit-action-a', action: 'ACCEPT_PROPOSAL', note: 'audit A' });
  const actionB = saveReviewerState(reviewParcel, conflictB.conflict_id, { actionId: 'audit-action-b', action: 'REQUEST_ADDITIONAL_EVIDENCE', note: 'audit B' });
  assert(actionA.actionId !== actionB.actionId, 'Reviewer actions do not retain distinct stable action IDs.');
  assert(loadReviewerState(reviewParcel, conflictA.conflict_id)?.action === 'ACCEPT_PROPOSAL', 'Reviewer action for first conflict was overwritten by another conflict.');
  assert(loadReviewerState(reviewParcel, conflictB.conflict_id)?.action === 'REQUEST_ADDITIONAL_EVIDENCE', 'Reviewer action for second conflict was not isolated.');
  const activity = loadReviewerActivity(reviewParcel);
  assert(activity.some((entry) => entry.actionId === 'audit-action-a') && activity.some((entry) => entry.actionId === 'audit-action-b'), 'Reviewer activity is not keyed/recoverable by stable action IDs.');
} finally {
  globalThis.window = originalWindow;
  if (originalPopStateEvent === undefined) delete globalThis.PopStateEvent; else globalThis.PopStateEvent = originalPopStateEvent;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = originalCustomEvent;
}

// H — evaluation-only data isolation.
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public', 'data-manifest.json'), 'utf8'));
assert(manifest.files.length === REQUIRED_PRODUCTION_PATHS.length, 'Production manifest exposes a file outside the required dashboard dataset contract.');
assert(manifest.files.every((file) => REQUIRED_PRODUCTION_PATHS.includes(file)), 'Production manifest contains non-required/evaluation files.');
assert(!manifest.files.some((file) => /99 Eval only|SYNTHETIC_GROUND_TRUTH|BENCHMARK_CASES/i.test(file)), 'Evaluation-only material is exposed through the production manifest.');
let publicEvalExists = true;
try { await fs.access(path.join(dataRoot, '99 Eval only')); } catch { publicEvalExists = false; }
assert(!publicEvalExists, '99 Eval only is physically present in the dashboard public data tree.');
assert(!/fetch\([^\n]*(?:SYNTHETIC_GROUND_TRUTH|BENCHMARK_CASES|99 Eval only)/i.test(applicationSource), 'Runtime source attempts to fetch evaluation-only material.');

// Navigation and reviewer UI integration source checks.
const reconciliationSource = await fs.readFile(path.join(root, 'src', 'components', 'ReconciliationEntry.jsx'), 'utf8');
const detailSource = await fs.readFile(path.join(root, 'src', 'components', 'ParcelConflictCaseDetail.jsx'), 'utf8');
const reviewerSource = await fs.readFile(path.join(root, 'src', 'data', 'reviewerStateService.js'), 'utf8');
assert(reconciliationSource.includes('Return to Conflict Explorer'), 'Reviewer workflow lacks a Return to Conflict Explorer action.');
assert(detailSource.includes('separate from dataset status'), 'Returned parcel investigation does not visibly separate reviewer activity from dataset status.');
assert(reviewerSource.includes('actionsById') && reviewerSource.includes('[actionId]'), 'Reviewer state is not keyed by stable action ID.');
assert(reviewerSource.includes('keyFor(parcelId, conflictId)'), 'Reviewer persistence is not scoped by stable parcel and conflict IDs.');

if (failures.length) {
  console.error(`Final regression audit failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Final Conflict → Reconcile → Conflict regression audit passed.');
console.log(`Conflict records audited: ${model.aggregates.totalConflictRecords}`);
console.log(`Parcel cases audited: ${model.parcelConflictCases.length}`);
console.log(`Multi-open-conflict case used: ${multiCase.parcelId} (${multiCase.openConflicts.length} open conflicts)`);
console.log(`Historical cases available: ${model.parcelConflictCases.filter((item) => item.isHistorical).length}`);
console.log(`Geometry investigations viewport-checked: ${geometryComparisonsChecked}`);
console.log(`Production data files exposed: ${manifest.files.length}`);
console.log('Explorer route context, exact conflict reconstruction, reviewer-state isolation, and evaluation-data isolation all passed.');
