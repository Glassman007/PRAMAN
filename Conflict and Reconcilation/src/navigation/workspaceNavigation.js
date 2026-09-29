const VIEW_PARAM = 'view';
const PARCEL_PARAM = 'parcel';
const SELECTED_CONFLICT_PARAM = 'conflict';
const OPEN_CONFLICTS_PARAM = 'open_conflicts';
const CONTEXT_PARAM = 'context';

const EXPLORER_FILTER_PARAMS = Object.freeze({
  search: 'ce_search',
  status: 'ce_status',
  conflictType: 'ce_type',
  severity: 'ce_severity',
  criticality: 'ce_criticality',
  humanReview: 'ce_review',
  sourceType: 'ce_source',
  parcelKind: 'ce_parcel_state',
  cell: 'ce_cell',
});
const EXPLORER_SORT_PARAM = 'ce_sort';
const EXPLORER_SORT_DIRECTION_PARAM = 'ce_direction';
const EXPLORER_PAGE_PARAM = 'ce_page';

export const DEFAULT_EXPLORER_ROUTE_STATE = Object.freeze({
  filters: Object.freeze({
    search: '',
    status: '',
    conflictType: '',
    severity: '',
    criticality: '',
    humanReview: '',
    sourceType: '',
    parcelKind: '',
    cell: '',
  }),
  sort: Object.freeze({ key: 'openConflicts', direction: 'desc' }),
  page: 1,
});

const ALLOWED_SORT_KEYS = new Set(['parcelId', 'openConflicts', 'severity', 'criticality', 'conflictCount', 'humanReview']);

function splitIds(value) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function parsePositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readExplorerState(params) {
  const filters = Object.fromEntries(
    Object.entries(EXPLORER_FILTER_PARAMS).map(([key, param]) => [key, params.get(param) ?? ''])
  );
  const requestedSort = params.get(EXPLORER_SORT_PARAM) ?? DEFAULT_EXPLORER_ROUTE_STATE.sort.key;
  const requestedDirection = params.get(EXPLORER_SORT_DIRECTION_PARAM) ?? DEFAULT_EXPLORER_ROUTE_STATE.sort.direction;
  return {
    filters,
    sort: {
      key: ALLOWED_SORT_KEYS.has(requestedSort) ? requestedSort : DEFAULT_EXPLORER_ROUTE_STATE.sort.key,
      direction: requestedDirection === 'asc' ? 'asc' : 'desc',
    },
    page: parsePositiveInteger(params.get(EXPLORER_PAGE_PARAM), 1),
  };
}

function writeExplorerState(url, explorerState) {
  const filters = explorerState?.filters ?? DEFAULT_EXPLORER_ROUTE_STATE.filters;
  for (const [key, param] of Object.entries(EXPLORER_FILTER_PARAMS)) {
    const value = filters[key];
    if (value) url.searchParams.set(param, String(value));
    else url.searchParams.delete(param);
  }

  const sort = explorerState?.sort ?? DEFAULT_EXPLORER_ROUTE_STATE.sort;
  if (sort.key && sort.key !== DEFAULT_EXPLORER_ROUTE_STATE.sort.key) url.searchParams.set(EXPLORER_SORT_PARAM, sort.key);
  else url.searchParams.delete(EXPLORER_SORT_PARAM);
  if (sort.direction && sort.direction !== DEFAULT_EXPLORER_ROUTE_STATE.sort.direction) url.searchParams.set(EXPLORER_SORT_DIRECTION_PARAM, sort.direction);
  else url.searchParams.delete(EXPLORER_SORT_DIRECTION_PARAM);

  const page = parsePositiveInteger(explorerState?.page, 1);
  if (page > 1) url.searchParams.set(EXPLORER_PAGE_PARAM, String(page));
  else url.searchParams.delete(EXPLORER_PAGE_PARAM);
}

export function readWorkspaceLocation(location = window.location) {
  const params = new URLSearchParams(location.search);
  return {
    view: params.get(VIEW_PARAM) === 'reconcile' ? 'reconcile' : 'conflicts',
    parcelId: params.get(PARCEL_PARAM) || null,
    selectedConflictId: params.get(SELECTED_CONFLICT_PARAM) || null,
    openConflictIds: splitIds(params.get(OPEN_CONFLICTS_PARAM)),
    context: params.get(CONTEXT_PARAM) || null,
    explorerState: readExplorerState(params),
  };
}

export function navigateWorkspace({
  view,
  parcelId = null,
  selectedConflictId = null,
  openConflictIds = [],
  context = null,
}, { replace = false } = {}) {
  const url = new URL(window.location.href);
  const resolvedView = view === 'reconcile' ? 'reconcile' : 'conflicts';
  url.searchParams.set(VIEW_PARAM, resolvedView);

  if (parcelId) url.searchParams.set(PARCEL_PARAM, parcelId);
  else url.searchParams.delete(PARCEL_PARAM);

  if (selectedConflictId) url.searchParams.set(SELECTED_CONFLICT_PARAM, selectedConflictId);
  else url.searchParams.delete(SELECTED_CONFLICT_PARAM);

  if (resolvedView === 'reconcile' && openConflictIds.length) {
    url.searchParams.set(OPEN_CONFLICTS_PARAM, openConflictIds.join(','));
  } else {
    url.searchParams.delete(OPEN_CONFLICTS_PARAM);
  }

  if (resolvedView === 'reconcile' && context) url.searchParams.set(CONTEXT_PARAM, context);
  else url.searchParams.delete(CONTEXT_PARAM);

  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function updateExplorerRouteState(explorerState) {
  const url = new URL(window.location.href);
  writeExplorerState(url, explorerState);
  window.history.replaceState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function openConflictExplorer() {
  navigateWorkspace({ view: 'conflicts' });
}

export function openConflictCase(parcelId, selectedConflictId = null) {
  if (!parcelId) throw new Error('A dataset parcel ID is required to open a conflict case.');
  navigateWorkspace({ view: 'conflicts', parcelId, selectedConflictId });
}

export function selectConflictInCase(parcelId, selectedConflictId) {
  if (!parcelId || !selectedConflictId) throw new Error('Parcel and conflict IDs are required to select a conflict.');
  navigateWorkspace({ view: 'conflicts', parcelId, selectedConflictId }, { replace: true });
}

export function openReconciliation(parcelId, selectedConflictId, openConflictIds = []) {
  if (!parcelId) throw new Error('A dataset parcel ID is required to open reconciliation.');
  if (!selectedConflictId) throw new Error('A selected dataset conflict ID is required to open reconciliation.');
  navigateWorkspace({
    view: 'reconcile',
    parcelId,
    selectedConflictId,
    openConflictIds,
    context: 'parcel-conflict-case',
  });
}

export function selectConflictInReconciliation(parcelId, selectedConflictId, openConflictIds = []) {
  if (!parcelId || !selectedConflictId) throw new Error('Parcel and conflict IDs are required to select a reconciliation conflict.');
  navigateWorkspace({
    view: 'reconcile',
    parcelId,
    selectedConflictId,
    openConflictIds,
    context: 'parcel-conflict-case',
  }, { replace: true });
}
