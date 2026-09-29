import { classifyConflictStatus } from './pramanDataModel.js';

export const EMPTY_FILTERS = Object.freeze({
  search: '',
  status: '',
  conflictType: '',
  severity: '',
  criticality: '',
  humanReview: '',
  sourceType: '',
  parcelKind: '',
  cell: '',
});

function clean(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return clean(value).toLowerCase();
}

export function getCaseStatus(parcelCase) {
  const classifications = new Set(parcelCase.conflicts.map((conflict) => classifyConflictStatus(conflict.status)));
  if (classifications.has('open') && classifications.has('resolved')) return 'MIXED';
  if (classifications.has('open')) return 'OPEN';
  if (classifications.size === 1 && classifications.has('resolved')) return 'RESOLVED';
  return 'OTHER';
}

export function getCaseCell(parcelCase) {
  return parcelCase.parcelMetadata?.cell_id ?? null;
}

export function getCaseLocality(parcelCase) {
  return parcelCase.canonicalParcel?.locality ?? null;
}

export function getCaseSourceCount(parcelCase) {
  return parcelCase.sourceTypes.length;
}

function caseSearchText(parcelCase) {
  return [
    parcelCase.parcelId,
    getCaseLocality(parcelCase),
    ...parcelCase.conflicts.map((conflict) => conflict.conflict_id),
    ...parcelCase.conflictTypes,
    ...parcelCase.sourceTypes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function conflictsMatchingDimension(parcelCase, filterKey, value) {
  if (!value) return true;
  if (filterKey === 'status') {
    return parcelCase.conflicts.some((conflict) => clean(conflict.status) === value);
  }
  if (filterKey === 'conflictType') {
    return parcelCase.conflicts.some((conflict) => clean(conflict.conflict_type) === value);
  }
  if (filterKey === 'severity') {
    return parcelCase.conflicts.some((conflict) => clean(conflict.severity) === value);
  }
  if (filterKey === 'criticality') {
    return parcelCase.conflicts.some((conflict) => clean(conflict.criticality) === value);
  }
  if (filterKey === 'sourceType') {
    return parcelCase.sourceTypes.includes(value);
  }
  return true;
}

export function caseMatchesFilters(parcelCase, filters, ignoredFilterKey = null) {
  if (ignoredFilterKey !== 'search' && filters.search) {
    const terms = normalized(filters.search).split(/\s+/).filter(Boolean);
    const haystack = caseSearchText(parcelCase);
    if (!terms.every((term) => haystack.includes(term))) return false;
  }

  for (const key of ['status', 'conflictType', 'severity', 'criticality', 'sourceType']) {
    if (ignoredFilterKey !== key && filters[key] && !conflictsMatchingDimension(parcelCase, key, filters[key])) return false;
  }

  if (ignoredFilterKey !== 'humanReview' && filters.humanReview) {
    const expected = filters.humanReview === 'required';
    if (parcelCase.humanReviewRequired !== expected) return false;
  }

  if (ignoredFilterKey !== 'parcelKind' && filters.parcelKind && parcelCase.parcelKind !== filters.parcelKind) {
    return false;
  }

  if (ignoredFilterKey !== 'cell' && filters.cell && getCaseCell(parcelCase) !== filters.cell) return false;
  return true;
}

export function filterParcelCases(cases, filters) {
  return cases.filter((parcelCase) => caseMatchesFilters(parcelCase, filters));
}

function semanticRank(value) {
  const text = normalized(value);
  if (!text) return -1;
  if (/critical|severe|very high/.test(text)) return 5;
  if (/major|high/.test(text)) return 4;
  if (/moderate|medium/.test(text)) return 3;
  if (/minor|low/.test(text)) return 2;
  if (/info|negligible/.test(text)) return 1;
  return 0;
}

function compareText(a, b) {
  return clean(a).localeCompare(clean(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortParcelCases(cases, sort) {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...cases].sort((a, b) => {
    let result = 0;
    switch (sort.key) {
      case 'parcelId':
        result = compareText(a.parcelId, b.parcelId);
        break;
      case 'openConflicts':
        result = a.openConflicts.length - b.openConflicts.length;
        break;
      case 'severity':
        result = semanticRank(a.highestSeverity) - semanticRank(b.highestSeverity) || compareText(a.highestSeverity, b.highestSeverity);
        break;
      case 'criticality':
        result = semanticRank(a.highestCriticality) - semanticRank(b.highestCriticality) || compareText(a.highestCriticality, b.highestCriticality);
        break;
      case 'conflictCount':
        result = a.conflicts.length - b.conflicts.length;
        break;
      case 'humanReview':
        result = Number(a.humanReviewRequired) - Number(b.humanReviewRequired);
        break;
      default:
        result = 0;
    }
    return (result || compareText(a.parcelId, b.parcelId)) * direction;
  });
}

function distinct(values) {
  return [...new Set(values.filter((value) => value != null && clean(value) !== ''))].sort(compareText);
}

export function deriveFilterOptions(cases) {
  return Object.freeze({
    status: distinct(cases.flatMap((parcelCase) => parcelCase.conflicts.map((conflict) => conflict.status))),
    conflictType: distinct(cases.flatMap((parcelCase) => parcelCase.conflictTypes)),
    severity: distinct(cases.flatMap((parcelCase) => parcelCase.conflicts.map((conflict) => conflict.severity))),
    criticality: distinct(cases.flatMap((parcelCase) => parcelCase.conflicts.map((conflict) => conflict.criticality))),
    sourceType: distinct(cases.flatMap((parcelCase) => parcelCase.sourceTypes)),
    parcelKind: distinct(cases.map((parcelCase) => parcelCase.parcelKind)),
    cell: distinct(cases.map(getCaseCell)),
    humanReview: [
      ...(cases.some((parcelCase) => parcelCase.humanReviewRequired) ? ['required'] : []),
      ...(cases.some((parcelCase) => !parcelCase.humanReviewRequired) ? ['not-required'] : []),
    ],
  });
}

function matchesOption(parcelCase, key, option) {
  if (key === 'humanReview') return parcelCase.humanReviewRequired === (option === 'required');
  if (key === 'parcelKind') return parcelCase.parcelKind === option;
  if (key === 'cell') return getCaseCell(parcelCase) === option;
  return conflictsMatchingDimension(parcelCase, key, option);
}

export function contextualOptionCounts(cases, filters, key, options) {
  const base = cases.filter((parcelCase) => caseMatchesFilters(parcelCase, filters, key));
  return new Map(options.map((option) => [option, base.filter((parcelCase) => matchesOption(parcelCase, key, option)).length]));
}

export function summarizeVisibleCases(cases) {
  const conflicts = cases.flatMap((parcelCase) => parcelCase.conflicts);
  return Object.freeze({
    cases: cases.length,
    conflicts: conflicts.length,
    openConflicts: conflicts.filter((conflict) => classifyConflictStatus(conflict.status) === 'open').length,
    resolvedConflicts: conflicts.filter((conflict) => classifyConflictStatus(conflict.status) === 'resolved').length,
    humanReviewCases: cases.filter((parcelCase) => parcelCase.humanReviewRequired).length,
  });
}
