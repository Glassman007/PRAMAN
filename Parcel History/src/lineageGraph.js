export const LINEAGE_MODES = Object.freeze({
  ANCESTORS: 'ancestors',
  FULL: 'full',
  DESCENDANTS: 'descendants'
});

export function defaultLineageMode(parcel) {
  return parcel?.identityClass === 'HISTORICAL_RETIRED' || parcel?.primaryStatus === 'HISTORICAL'
    ? LINEAGE_MODES.FULL
    : LINEAGE_MODES.ANCESTORS;
}

export function nodeState(detail) {
  if (!detail?.parcel) return { key: 'unknown', label: 'STATUS UNAVAILABLE', authoritative: false };

  const status = String(detail.parcel.primaryStatus || '').toUpperCase();
  const identityClass = String(detail.parcel.identityClass || '').toUpperCase();
  const current = detail.currentAuthoritative;

  if (current && status === 'ACTIVE' && String(current.authorityStatus || '').toUpperCase() === 'AUTHORITATIVE') {
    return { key: 'current', label: 'CURRENT AUTHORITATIVE', authoritative: true };
  }
  if (status === 'PROPOSED' || identityClass === 'PROPOSED') {
    return { key: 'proposed', label: 'PROPOSED — NOT AUTHORITATIVE', authoritative: false };
  }
  if (status === 'SUPERSEDED') {
    return { key: 'superseded', label: 'SUPERSEDED', authoritative: false };
  }
  if (status === 'HISTORICAL' || identityClass === 'HISTORICAL_RETIRED') {
    return { key: 'historical', label: 'HISTORICAL', authoritative: false };
  }
  return { key: 'unknown', label: status || 'STATUS UNAVAILABLE', authoritative: false };
}

export function nodeArea(detail) {
  if (!detail) return null;
  if (detail.currentAuthoritative?.areaSqM !== null && detail.currentAuthoritative?.areaSqM !== undefined) {
    return detail.currentAuthoritative.areaSqM;
  }
  const retired = (detail.historicalStates || []).find((state) => state.stateScope === 'RETIRED_PARCEL');
  return retired?.areaSqM ?? null;
}

export function nodePeriod(detail) {
  if (!detail) return { start: null, end: null, label: null };
  if (detail.currentAuthoritative) {
    return {
      start: detail.currentAuthoritative.effectiveDate || null,
      end: null,
      label: detail.currentAuthoritative.effectiveDate ? `Effective ${detail.currentAuthoritative.effectiveDate}` : 'Current period not dated'
    };
  }
  const retired = (detail.historicalStates || []).find((state) => state.stateScope === 'RETIRED_PARCEL');
  if (!retired) return { start: null, end: null, label: null };
  const values = [retired.effectiveDate, retired.retiredDate].filter(Boolean);
  return {
    start: retired.effectiveDate || null,
    end: retired.retiredDate || null,
    label: values.length === 2 ? `${values[0]} → ${values[1]}` : values[0] || null
  };
}

export function allLineageEdges(detailMap) {
  const unique = new Map();
  Object.values(detailMap || {}).forEach((detail) => {
    (detail?.lineage?.edges || []).forEach((edge) => {
      if (!edge?.parentParcelId || !edge?.childParcelId) return;
      const key = `${edge.lineageEventId || ''}|${edge.parentParcelId}|${edge.childParcelId}|${edge.eventSubtype || edge.semanticType || ''}`;
      if (!unique.has(key)) unique.set(key, edge);
    });
  });
  return [...unique.values()];
}

export function visibleLineageEdges(detailMap, visibleIds) {
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
  return allLineageEdges(detailMap).filter((edge) => visible.has(edge.parentParcelId) && visible.has(edge.childParcelId));
}

function bfsLevels(selectedId, detailMap, direction, visibleIds) {
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
  const levels = new Map([[selectedId, 0]]);
  const queue = [selectedId];

  while (queue.length) {
    const id = queue.shift();
    const detail = detailMap[id];
    if (!detail) continue;
    const next = direction === 'parents' ? detail.lineage?.parents || [] : detail.lineage?.children || [];
    for (const relatedId of next) {
      if (!visible.has(relatedId) || levels.has(relatedId)) continue;
      levels.set(relatedId, levels.get(id) + 1);
      queue.push(relatedId);
    }
  }
  return levels;
}

export function buildGraphLayout(selectedId, detailMap, visibleIds, mode, options = {}) {
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
  const nodeWidth = options.nodeWidth || 222;
  const nodeHeight = options.nodeHeight || 126;
  const xGap = options.xGap || 54;
  const yGap = options.yGap || 92;
  const rowStep = nodeHeight + yGap;
  const minWidth = options.minWidth || 820;
  const topPadding = 54;
  const bottomPadding = 70;

  const ancestorLevels = bfsLevels(selectedId, detailMap, 'parents', visible);
  const descendantLevels = bfsLevels(selectedId, detailMap, 'children', visible);
  const rows = new Map();

  const put = (level, id) => {
    if (!rows.has(level)) rows.set(level, []);
    rows.get(level).push(id);
  };

  put(0, selectedId);
  if (mode === LINEAGE_MODES.ANCESTORS || mode === LINEAGE_MODES.FULL) {
    ancestorLevels.forEach((depth, id) => { if (id !== selectedId) put(depth, id); });
  }
  if (mode === LINEAGE_MODES.DESCENDANTS) {
    descendantLevels.forEach((depth, id) => { if (id !== selectedId) put(depth, id); });
  } else if (mode === LINEAGE_MODES.FULL) {
    descendantLevels.forEach((depth, id) => { if (id !== selectedId) put(-depth, id); });
  }

  for (const [level, ids] of rows) {
    rows.set(level, [...new Set(ids)].sort());
  }

  const sortedLevels = [...rows.keys()].sort((a, b) => a - b);
  const maxNodes = Math.max(1, ...sortedLevels.map((level) => rows.get(level).length));
  const width = Math.max(minWidth, maxNodes * nodeWidth + Math.max(0, maxNodes - 1) * xGap + 96);
  const minLevel = Math.min(...sortedLevels);
  const maxLevel = Math.max(...sortedLevels);
  const height = topPadding + (maxLevel - minLevel) * rowStep + nodeHeight + bottomPadding;
  const positions = {};

  sortedLevels.forEach((level) => {
    const ids = rows.get(level);
    const total = ids.length * nodeWidth + Math.max(0, ids.length - 1) * xGap;
    const startX = (width - total) / 2;
    ids.forEach((id, index) => {
      positions[id] = {
        x: startX + index * (nodeWidth + xGap),
        y: topPadding + (level - minLevel) * rowStep,
        level
      };
    });
  });

  return { width, height, positions, minLevel, maxLevel, nodeWidth, nodeHeight };
}

function humanRelationshipType(value) {
  return String(value || 'relationship')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function relationshipSummary(detail) {
  const incoming = detail?.lineage?.incomingEdges || [];
  const outgoing = detail?.lineage?.outgoingEdges || [];
  const parents = detail?.lineage?.parents || [];
  const children = detail?.lineage?.children || [];

  const originTypes = [...new Set(incoming.map((edge) => edge.eventSubtype || edge.semanticType).filter(Boolean))].map(humanRelationshipType);
  const endTypes = [...new Set(outgoing.map((edge) => edge.eventSubtype || edge.semanticType).filter(Boolean))].map(humanRelationshipType);

  const originated = incoming.length
    ? `${originTypes.join(' / ')} from ${parents.join(', ') || 'recorded parent parcel(s)'}`
    : 'No explicit lineage origin recorded';

  let ended = 'No explicit descendant relationship recorded';
  const state = nodeState(detail);
  if (outgoing.length) ended = `${endTypes.join(' / ')} to ${children.join(', ') || 'recorded descendant parcel(s)'}`;
  else if (state.key === 'current') ended = 'Current authoritative parcel';

  return { originated, ended, parents, children };
}

export function crossCellEdge(edge, detailMap) {
  const parentCell = detailMap[edge?.parentParcelId]?.parcel?.cellId || null;
  const childCell = detailMap[edge?.childParcelId]?.parcel?.cellId || null;
  return Boolean(parentCell && childCell && parentCell !== childCell);
}
