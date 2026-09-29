const fmt = new Intl.NumberFormat('en-IN');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function safeNumber(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }

function semanticFamily(node) {
  if (node?.stageId === 'conflict-detection' || ['Conflict','ConflictEvidence'].includes(node?.entityType)) return 'conflict';
  if (node?.stageId === 'authority-review' || node?.stageId === 'reconciliation') return 'governance';
  if (node?.stageId === 'canonical-state' || ['CanonicalParcel','AuthoritativeState'].includes(node?.entityType)) return 'outcome';
  if (node?.stageId === 'history-lineage' || ['HistoricalParcel','GeometryVersion','GeoGitEvent','LineageEvent'].includes(node?.entityType)) return 'history';
  if (node?.stageId === 'matching' || node?.stageId === 'normalization') return 'process';
  return 'input';
}


export const GRAPH_VIRTUALIZATION_THRESHOLD = 80;

/**
 * Pure virtualization planner used by the DOM renderer and performance tests.
 * The underlying snapshot remains complete; this decides only which DOM/SVG
 * elements need to exist for the current viewport.
 */
export function buildVirtualRenderPlan(nodes, edges, positions, viewport, {
  threshold = GRAPH_VIRTUALIZATION_THRESHOLD,
  overscanX = 360,
  overscanY = 420,
  nodeWidth = 196,
  nodeHeight = 70,
} = {}) {
  const allNodeIds = new Set((nodes ?? []).map((node) => node.id));
  const allEdgeIds = new Set((edges ?? []).map((edge) => edge.id));
  if ((nodes?.length ?? 0) <= threshold || !viewport || !(viewport.width > 0) || !(viewport.height > 0)) {
    return { virtualized: false, nodeIds: allNodeIds, edgeIds: allEdgeIds, totalNodes: allNodeIds.size, totalEdges: allEdgeIds.size };
  }
  const left = viewport.left - overscanX;
  const right = viewport.left + viewport.width + overscanX;
  const top = viewport.top - overscanY;
  const bottom = viewport.top + viewport.height + overscanY;
  const nodeIds = new Set();
  for (const node of nodes ?? []) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const x0 = pos.x - nodeWidth / 2;
    const x1 = x0 + nodeWidth;
    const y0 = pos.y - 30;
    const y1 = y0 + nodeHeight;
    if (x1 >= left && x0 <= right && y1 >= top && y0 <= bottom) nodeIds.add(node.id);
  }
  const edgeIds = new Set();
  for (const edge of edges ?? []) if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) edgeIds.add(edge.id);
  return { virtualized: true, nodeIds, edgeIds, totalNodes: allNodeIds.size, totalEdges: allEdgeIds.size };
}



export const WATERFALL_OPERATION_LABELS = Object.freeze({
  sources: 'SOURCE OBSERVATIONS',
  adapters: 'ADAPTER INTERPRETATION',
  normalization: 'NORMALIZED EVIDENCE',
  matching: 'MATCHING / CANDIDATE RELATIONSHIPS',
  'conflict-detection': 'CONFLICTS',
  reconciliation: 'RECONCILIATION',
  'authority-review': 'AUTHORITY / POLICY / HUMAN DECISION',
  'canonical-state': 'AUTHORITATIVE CANONICAL STATE',
  'history-lineage': 'HISTORY / LINEAGE / FINAL OUTCOME',
});

function stableNodeOrder(a, b) {
  const ao = Number(a?.data?.order ?? Number.MAX_SAFE_INTEGER);
  const bo = Number(b?.data?.order ?? Number.MAX_SAFE_INTEGER);
  return ao - bo || String(a?.label || a?.id || '').localeCompare(String(b?.label || b?.id || ''));
}

function localDepths(stageNodes, stageEdges) {
  const ids = new Set(stageNodes.map((node) => node.id));
  const indegree = new Map(stageNodes.map((node) => [node.id, 0]));
  const adjacency = new Map(stageNodes.map((node) => [node.id, []]));
  for (const edge of stageEdges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    adjacency.get(edge.from).push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  }
  const nodeById = new Map(stageNodes.map((node) => [node.id, node]));
  const queue = stageNodes.filter((node) => (indegree.get(node.id) || 0) === 0).sort(stableNodeOrder);
  const depth = new Map(stageNodes.map((node) => [node.id, 0]));
  let visited = 0;
  while (queue.length) {
    const node = queue.shift();
    visited += 1;
    for (const childId of adjacency.get(node.id) || []) {
      depth.set(childId, Math.max(depth.get(childId) || 0, (depth.get(node.id) || 0) + 1));
      indegree.set(childId, (indegree.get(childId) || 0) - 1);
      if (indegree.get(childId) === 0) {
        queue.push(nodeById.get(childId));
        queue.sort(stableNodeOrder);
      }
    }
  }
  if (visited !== stageNodes.length) {
    const fallbackDepth = Math.max(0, ...depth.values()) + 1;
    for (const node of stageNodes) if ((indegree.get(node.id) || 0) > 0) depth.set(node.id, fallbackDepth);
  }
  return depth;
}

function placeWaterfallRow(rowNodes, incomingByTarget, positions, width, { nodeWidth, horizontalGap, leftPad, rightPad }) {
  const minX = leftPad + nodeWidth / 2;
  const maxX = width - rightPad - nodeWidth / 2;
  const centerX = width / 2;
  const withTargets = rowNodes.map((node, index) => {
    const parents = (incomingByTarget.get(node.id) || []).map((edge) => positions.get(edge.from)).filter(Boolean);
    const target = parents.length ? parents.reduce((sum, pos) => sum + pos.x, 0) / parents.length : null;
    return { node, index, target };
  }).sort((a, b) => {
    if (a.target != null && b.target != null) return a.target - b.target || stableNodeOrder(a.node, b.node);
    if (a.target != null) return -1;
    if (b.target != null) return 1;
    return stableNodeOrder(a.node, b.node);
  });
  if (withTargets.length === 1) return [{ node: withTargets[0].node, x: Math.max(minX, Math.min(maxX, withTargets[0].target ?? centerX)) }];

  const spacing = nodeWidth + horizontalGap;
  const totalWidth = (withTargets.length - 1) * spacing;
  const targetValues = withTargets.map((entry) => entry.target).filter((value) => value != null);
  const preferredCenter = targetValues.length
    ? targetValues.reduce((sum, value) => sum + value, 0) / targetValues.length
    : centerX;
  // Keep the target-derived ordering, but place the entire row as one bounded unit.
  // This prevents a late constraint shift from pushing the last node outside the canvas.
  const start = Math.max(minX, Math.min(maxX - totalWidth, preferredCenter - totalWidth / 2));
  return withTargets.map((entry, index) => ({ node: entry.node, x: start + index * spacing }));
}

/**
 * Data-driven vertical layout for the evidence waterfall. Internal pipeline
 * groupings define operation labels only; node depth is derived from real edges.
 */
export function buildWaterfallLayout(nodes, edges, width, {
  nodeWidth = 196,
  nodeHeight = 108,
  horizontalGap = 28,
  rowGap = 22,
  depthGap = 14,
  operationGap = 30,
  operationLabelHeight = 38,
  leftPad = 42,
  rightPad = 42,
  topPad = 24,
  maxColumns = 5,
} = {}) {
  const grouped = new Map();
  for (const node of nodes || []) {
    const stageIndex = Number(node.stageIndex ?? 0);
    if (!grouped.has(stageIndex)) grouped.set(stageIndex, []);
    grouped.get(stageIndex).push(node);
  }
  for (const group of grouped.values()) group.sort(stableNodeOrder);
  const incomingByTarget = new Map();
  for (const edge of edges || []) {
    if (!incomingByTarget.has(edge.to)) incomingByTarget.set(edge.to, []);
    incomingByTarget.get(edge.to).push(edge);
  }
  const usableWidth = Math.max(nodeWidth, width - leftPad - rightPad);
  const columns = Math.max(1, Math.min(maxColumns, Math.floor((usableWidth + horizontalGap) / (nodeWidth + horizontalGap))));
  const positions = new Map();
  const operationLayouts = new Map();
  let cursorY = topPad;
  const visibleStageIndexes = [...grouped.keys()].sort((a, b) => a - b);
  for (const stageIndex of visibleStageIndexes) {
    const stageNodes = grouped.get(stageIndex) || [];
    if (!stageNodes.length) continue;
    const ids = new Set(stageNodes.map((node) => node.id));
    const localEdges = (edges || []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    const depthById = localDepths(stageNodes, localEdges);
    const byDepth = new Map();
    for (const node of stageNodes) {
      const depth = depthById.get(node.id) || 0;
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth).push(node);
    }
    const operationTop = cursorY;
    let y = cursorY + operationLabelHeight;
    for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
      const levelNodes = byDepth.get(depth).sort(stableNodeOrder);
      for (let offset = 0; offset < levelNodes.length; offset += columns) {
        const row = levelNodes.slice(offset, offset + columns);
        const placements = placeWaterfallRow(row, incomingByTarget, positions, width, { nodeWidth, horizontalGap, leftPad, rightPad });
        for (const { node, x } of placements) {
          positions.set(node.id, { x, y: y + nodeHeight / 2, left: x - nodeWidth / 2, top: y, nodeHeight });
        }
        y += nodeHeight + rowGap;
      }
      y += depthGap;
    }
    const height = Math.max(operationLabelHeight + nodeHeight, y - operationTop - rowGap + 6);
    operationLayouts.set(stageIndex, { top: operationTop, height, labelTop: operationTop, contentTop: operationTop + operationLabelHeight });
    cursorY = operationTop + height + operationGap;
  }
  return { positions, operationLayouts, height: Math.max(480, cursorY + 18), columns };
}

export class EvidenceGraphRenderer {
  constructor({ container, onNodeSelected = null } = {}) {
    if (!(container instanceof Element)) throw new Error('EvidenceGraphRenderer requires a DOM Element container');
    this.container = container;
    this.onNodeSelected = onNodeSelected;
    this.viewport = container.closest?.('.eg-canvas') ?? container.parentElement ?? container;
    this.lastSnapshot = null;
    this.lastStructureKey = null;
    this.scrollFrame = null;
    this.lastFollowOperationIndex = -1;
    this.lastVisibleNodeIds = new Set();
    this.lastTimelinePosition = -1;
    this.container.replaceChildren();
    this.summaryPanel = document.createElement('div');
    this.summaryPanel.className = 'eg-final-summary';
    this.summaryPanel.hidden = true;
    this.surface = document.createElement('div');
    this.surface.className = 'eg-graph-surface';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('eg-edge-layer');
    this.nodesLayer = document.createElement('div');
    this.nodesLayer.className = 'eg-node-layer';
    this.onNodeClick = (event) => {
      const button = event.target?.closest?.('[data-node-id]');
      if (button && this.nodesLayer.contains(button)) this.onNodeSelected?.(button.dataset.nodeId);
    };
    this.nodesLayer.addEventListener('click', this.onNodeClick);
    this.surface.append(this.svg, this.nodesLayer);
    this.container.append(this.summaryPanel, this.surface);
    this.onViewportChange = () => {
      if (!this.lastSnapshot || this.scrollFrame != null || this.surface.dataset.virtualized !== 'true') return;
      const schedule = globalThis.requestAnimationFrame ?? ((fn) => setTimeout(fn, 16));
      this.scrollFrame = schedule(() => {
        this.scrollFrame = null;
    this.lastFollowOperationIndex = -1;
        if (this.lastSnapshot) this.render(this.lastSnapshot, { forceGraph: true });
      });
    };
    this.viewport?.addEventListener?.('scroll', this.onViewportChange, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onViewportChange);
      this.resizeObserver.observe(this.viewport);
    }
  }

  structureKey(snapshot, nodes, edges) {
    return [
      snapshot?.mode || 'run', snapshot?.parcelId || '', snapshot?.currentStageIndex ?? 0, snapshot?.playbackState || 'idle',
      snapshot?.selectedNodeId || '', snapshot?.filterSummary?.active ? JSON.stringify(snapshot.filters ?? {}) : '',
      nodes.map((node) => node.id).join('|'), edges.map((edge) => edge.id).join('|')
    ].join('::');
  }

  updateProgress(snapshot) {
    const progress = Number(snapshot?.stageProgress ?? 0);
    const currentSection = this.nodesLayer.querySelector('.eg-waterfall-operation.is-active');
    if (currentSection) currentSection.style.setProperty('--eg-operation-progress', `${Math.round(progress * 100)}%`);
    const offset = String(Math.round((1 - progress) * 48));
    for (const path of this.svg.querySelectorAll('.eg-edge.is-current')) path.style.strokeDashoffset = offset;
  }

  render(snapshot, { forceGraph = false } = {}) {
    const nodes = snapshot?.visibleNodes ?? [];
    const edges = snapshot?.visibleEdges ?? [];
    const currentStageIndex = snapshot?.currentStageIndex ?? 0;
    const finalSummary = snapshot?.metrics?.finalSummary ?? null;
    const traceCoverage = snapshot?.metrics?.traceCoverage ?? null;
    const consistency = snapshot?.metrics?.consistency ?? null;
    const parcelStory = snapshot?.metrics?.parcelStory ?? null;
    const filterSummary = snapshot?.filterSummary ?? null;
    const structureKey = this.structureKey(snapshot, nodes, edges);
    const timelinePosition = Number(snapshot?.timelinePosition ?? currentStageIndex ?? 0);
    if (timelinePosition + 0.001 < this.lastTimelinePosition) this.lastVisibleNodeIds.clear();
    const newlyVisibleNodeIds = forceGraph ? new Set() : new Set(nodes.filter((node) => !this.lastVisibleNodeIds.has(node.id)).map((node) => node.id));
    this.lastTimelinePosition = timelinePosition;
    this.lastSnapshot = snapshot;
    if (!forceGraph && this.lastStructureKey === structureKey) {
      this.updateProgress(snapshot);
      return;
    }
    this.lastStructureKey = structureKey;
    if (snapshot?.mode === 'parcel' && parcelStory) {
      const m = parcelStory.matching ?? {};
      const c = parcelStory.conflicts ?? {};
      const r = parcelStory.reconciliation ?? {};
      const h = parcelStory.humanReview ?? {};
      const a = parcelStory.authoritative ?? {};
      const hist = parcelStory.historyLineage ?? {};
      const range = (v) => v ? `${Number(v.min).toFixed(3)}–${Number(v.max).toFixed(3)}` : 'not recorded';
      const cards = [
        ['Source records', `${fmt.format(parcelStory.sourceRecords?.length || 0)} contributing records`, [...new Set((parcelStory.sourceRecords || []).map((x) => x.sourceName))].join(' · ') || 'None'],
        ['Adapter routes', `${fmt.format(parcelStory.adapters?.length || 0)} conceptual adapters`, (parcelStory.adapters || []).map((x) => x.adapterName).join(' · ') || 'No routed adapter'],
        ['Why matched', m.matchStatus || 'No recorded match outcome', m.criticalityReason || 'Recorded evidence supported the parcel-level outcome; pairwise solver rationale is not stored.'],
        ['Match evidence', m.overallMatchConfidence == null ? 'Overall confidence not recorded' : `overall ${m.overallMatchConfidence}`, `geometry ${range(m.geometryEvidenceRange)} · identifier ${range(m.identifierConfidenceRange)} · source reliability ${range(m.sourceReliabilityRange)}`],
        ['Conflicts', `${fmt.format(c.count || 0)} explicit conflicts`, c.count ? `${(c.types || []).map((x) => x.replaceAll('_',' ')).join(' · ')} · ${c.open || 0} open / ${c.resolved || 0} resolved` : 'No explicit conflict row; none fabricated'],
        ['Conflict handling', r.matchStatus || 'No reconciliation record', `${r.unresolvedConflictIds?.length || 0} unresolved conflict references · proposal ${r.proposedState ? 'recorded' : 'not recorded'}`],
        ['Human review', h.required ? 'REQUIRED' : 'NOT REQUIRED', `${h.explicitReviewEvents?.length || 0} review events · ${h.decisionEvents?.length || 0} decision events`],
        ['Authoritative result', a.state?.state || a.registryRecord?.record_status || a.registryRecord?.parcel_status || 'Recorded state unavailable', a.registryRecord ? `${parcelStory.registry} registry record present` : 'No registry record'],
        ['History / lineage', (hist.lineageTransactions?.length || hist.geometryVersions?.length || hist.geogitEvents?.length) ? `${hist.lineageTransactions?.length || 0} lineage transactions` : 'No recorded history for this parcel', `${hist.geometryVersions?.length || 0} geometry versions · ${hist.geogitEvents?.length || 0} supporting GeoGit events`]
      ];
      this.summaryPanel.hidden = false;
      this.summaryPanel.innerHTML = `<div class="eg-parcel-summary-head"><span>INDIVIDUAL PARCEL MODE</span><strong>${esc(parcelStory.parcelId)}</strong><small>Only this parcel's dataset-backed evidence lifecycle is shown.</small></div><div class="eg-parcel-story-grid">${cards.map(([title,value,detail]) => `<div><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join('')}</div>`;
    } else if (finalSummary && snapshot?.playbackState === 'completed') {
      if (filterSummary?.active) {
        const items = [
          ['Parcels in subset', filterSummary.visibleParcels],
          ['Source observations', filterSummary.visibleObservations],
          ['Conflicts', filterSummary.visibleConflicts],
          ['Sources represented', filterSummary.visibleSources],
          ['Graph nodes shown', filterSummary.filteredNodeCount],
          ['Active filters', filterSummary.activeFilterCount],
        ];
        this.summaryPanel.hidden = false;
        this.summaryPanel.innerHTML = `<div class="eg-final-summary-head"><span>FILTERED SUBSET</span><strong>Evidence Graph exploration</strong></div><div class="eg-final-summary-grid">${items.map(([label,value]) => `<div><span>${label}</span><strong>${fmt.format(Number(value) || 0)}</strong></div>`).join('')}</div><div class="eg-final-summary-foot"><span>The graph is filtered; global end-of-run totals are intentionally not presented as subset totals.</span><span>Clear Filters to restore the complete replay.</span></div>`;
        // Continue to graph rendering below.
      } else {
      const items = [
        ['Active canonical', finalSummary.activeCanonicalParcels],
        ['Historical / retired', finalSummary.historicalRetiredParcels],
        ['Source observations', finalSummary.sourceObservations],
        ['Candidate relationships', finalSummary.candidateAssociations],
        ['Accepted matches', finalSummary.acceptedMatches],
        ['Ambiguous matches', finalSummary.ambiguousCases],
        ['Rejected matches', finalSummary.rejectedMatches],
        ['Unmatched observations', finalSummary.unmatchedObservationCases],
        ['Conflicts', finalSummary.conflicts],
        ['Reconciliation records', finalSummary.reconciliationRecords],
        ['Unresolved parcels', finalSummary.unresolvedCases],
        ['Human-review required', finalSummary.humanReviewCases],
        ['Split / merge lineage', `${fmt.format(finalSummary.splitLineageRelationships)} / ${fmt.format(finalSummary.mergeLineageRelationships)}`]
      ];
      this.summaryPanel.hidden = false;
      this.summaryPanel.innerHTML = `<div class="eg-final-summary-head"><span>FINAL DATASET SUMMARY</span><strong>Authoritative canonical state</strong></div><div class="eg-final-summary-grid">${items.map(([label,value]) => `<div><span>${label}</span><strong>${typeof value === 'number' ? fmt.format(value) : value}</strong></div>`).join('')}</div><div class="eg-final-summary-foot"><span>${traceCoverage ? `${fmt.format(traceCoverage.complete)} / ${fmt.format(traceCoverage.totalActiveCanonicalParcels)} active parcels have complete supported trace coverage` : 'Trace coverage unavailable'} · ${fmt.format(finalSummary.reconciledStatusCases)} rows carry MATCH_STATUS=RECONCILED</span><span>${consistency?.registryVsReconciliationDiscrepancy ? `Registry discrepancy: ${fmt.format(consistency.activeCanonicalRegistryRows)} canonical vs ${fmt.format(consistency.activeReconciliationRows)} ACTIVE reconciliation rows` : 'Active registry count is internally consistent'} · ${fmt.format(finalSummary.explicitHumanReviewEvents)} explicit HUMAN_REVIEW events</span></div>`;
      }
    } else {
      this.summaryPanel.hidden = true;
      this.summaryPanel.replaceChildren();
    }
    const nodeWidth = 210;
    const width = Math.max(this.container.clientWidth || 900, 900);
    const { positions, operationLayouts, height } = buildWaterfallLayout(nodes, edges, width, { nodeWidth });
    const grouped = new Map();
    for (const node of nodes) {
      const index = Number(node.stageIndex ?? 0);
      if (!grouped.has(index)) grouped.set(index, []);
      grouped.get(index).push(node);
    }
    for (const group of grouped.values()) group.sort(stableNodeOrder);

    this.surface.style.width = `${width}px`;
    this.surface.style.height = `${height}px`;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.replaceChildren();
    this.nodesLayer.replaceChildren();
    const viewport = this.viewport ? {
      left: Number(this.viewport.scrollLeft || 0),
      top: Math.max(0, Number(this.viewport.scrollTop || 0) - Number(this.surface.offsetTop || 0)),
      width: Number(this.viewport.clientWidth || this.container.clientWidth || 0),
      height: Number(this.viewport.clientHeight || this.container.clientHeight || 0),
    } : null;
    const renderPlan = buildVirtualRenderPlan(nodes, edges, positions, viewport, { nodeWidth, nodeHeight: 108 });
    const renderedNodeIds = renderPlan.nodeIds;
    const selectedNodeId = snapshot.selectedNodeId || null;
    const directNeighborIds = new Set();
    const directParentIds = new Set();
    const directChildIds = new Set();
    if (selectedNodeId) {
      for (const edge of edges) {
        if (edge.from === selectedNodeId) { directNeighborIds.add(edge.to); directChildIds.add(edge.to); }
        if (edge.to === selectedNodeId) { directNeighborIds.add(edge.from); directParentIds.add(edge.from); }
      }
    }
    this.surface.classList.toggle('has-selection', Boolean(selectedNodeId));
    this.surface.dataset.selectedNodeId = selectedNodeId || '';
    this.surface.dataset.virtualized = String(renderPlan.virtualized);
    this.surface.dataset.totalNodes = String(nodes.length);
    this.surface.dataset.renderedNodes = String(renderedNodeIds.size);
    this.surface.dataset.totalEdges = String(edges.length);
    this.surface.dataset.renderedEdges = String(renderPlan.edgeIds.size);
    this.surface.dataset.layout = 'waterfall';

    for (const stageIndex of [...grouped.keys()].sort((a, b) => a - b)) {
      const stage = snapshot.stages?.[stageIndex];
      const layout = operationLayouts.get(stageIndex);
      if (!layout) continue;
      const isActive = stageIndex === currentStageIndex && snapshot.playbackState !== 'completed';
      const operation = document.createElement('div');
      operation.className = `eg-waterfall-operation${isActive ? ' is-active' : ' is-complete'}`;
      operation.style.top = `${layout.labelTop}px`;
      operation.style.left = '24px';
      operation.style.width = `${Math.max(0, width - 48)}px`;
      operation.dataset.operationId = stage?.id || String(stageIndex);
      if (isActive) operation.style.setProperty('--eg-operation-progress', `${Math.round((snapshot.stageProgress ?? 0) * 100)}%`);
      const operationLabel = WATERFALL_OPERATION_LABELS[stage?.id] || stage?.label || 'LIFECYCLE OPERATION';
      operation.innerHTML = `<span class="eg-waterfall-operation-rule" aria-hidden="true"></span><strong>${esc(operationLabel)}</strong><span class="eg-waterfall-operation-state">${isActive ? (snapshot.playbackState === 'paused' ? 'PAUSED' : 'FLOWING') : 'TRACE RETAINED'}</span>`;
      this.nodesLayer.append(operation);

      const stageNodes = grouped.get(stageIndex) ?? [];
      stageNodes.forEach((node) => {

        if (!renderedNodeIds.has(node.id)) return;
        const pos = positions.get(node.id);
        if (!pos) return;
        const nx = pos.left;
        const ny = pos.top;
        const button = document.createElement('button');
        button.type = 'button';
        const isSelected = selectedNodeId === node.id;
        const isNeighbor = directNeighborIds.has(node.id);
        const isParentNeighbor = directParentIds.has(node.id);
        const isChildNeighbor = directChildIds.has(node.id);
        button.className = `eg-graph-node eg-node-family-${semanticFamily(node)}${newlyVisibleNodeIds.has(node.id) ? ' is-newly-revealed' : ''}${isSelected ? ' is-selected' : ''}${isNeighbor ? ' is-direct-neighbor' : ''}${isParentNeighbor ? ' is-parent-neighbor' : ''}${isChildNeighbor ? ' is-child-neighbor' : ''}${node.entityType === 'SourceDataset' ? ' eg-source-cluster' : ''}${node.entityType === 'AdapterConcept' ? ' eg-adapter-cluster' : ''}${node.data?.normalizationSpace ? ' eg-normalization-space' : ''}${node.stageId === 'matching' ? ' eg-matching-cluster' : ''}${node.data?.matchingRole ? ` eg-matching-${node.data.matchingRole}` : ''}${node.stageId === 'conflict-detection' ? ' eg-conflict-cluster' : ''}${node.data?.conflictRole ? ` eg-conflict-${node.data.conflictRole}` : ''}${node.stageId === 'authority-review' ? ' eg-authority-cluster' : ''}${node.data?.details?.authorityRole ? ` eg-authority-${node.data.details.authorityRole}` : ''}${node.stageId === 'canonical-state' ? ' eg-canonical-cluster' : ''}${node.data?.canonicalRole ? ` eg-canonical-${node.data.canonicalRole}` : ''}${node.stageId === 'history-lineage' ? ' eg-history-cluster' : ''}${node.data?.historyRole ? ` eg-history-${node.data.historyRole}` : ''}${node.data?.visualTone ? ` eg-history-tone-${node.data.visualTone}` : ''}`;
        button.setAttribute('aria-pressed', String(isSelected));
        button.style.left = `${nx}px`;
        button.style.top = `${ny}px`;
        button.style.width = `${nodeWidth}px`;
        button.dataset.nodeId = node.id;
        button.dataset.entityType = node.entityType || node.type || 'Evidence';
        button.dataset.stageId = node.stageId || '';
        button.dataset.status = node.status || '';
        button.title = `${node.label || node.id}${node.subtitle ? ` — ${node.subtitle}` : ''}`;

        if (node.entityType === 'SourceDataset' || node.entityType === 'AdapterConcept' || node.data?.normalizationSpace || node.stageId === 'matching' || node.stageId === 'conflict-detection' || node.stageId === 'authority-review' || node.stageId === 'canonical-state' || node.stageId === 'history-lineage') {
          const kind = document.createElement('span');
          kind.className = 'eg-node-kind';
          if (node.data?.normalizationSpace) kind.textContent = 'NORMALIZED EVIDENCE';
          else if (node.entityType === 'SourceDataset') kind.textContent = 'SOURCE DATASET';
          else if (node.entityType === 'AdapterConcept') kind.textContent = 'ADAPTER';
          else if (node.data?.matchingRole === 'candidate-generation') kind.textContent = 'CANDIDATES';
          else if (node.data?.matchingRole === 'candidate') kind.textContent = 'MATCH CANDIDATE';
          else if (node.data?.matchingRole === 'recorded-evidence') kind.textContent = 'MATCHING EVIDENCE';
          else if (node.data?.matchingRole === 'recorded-outcomes') kind.textContent = 'PARCEL OUTCOMES';
          else if (node.data?.matchingRole === 'outcome-group') kind.textContent = 'MATCH OUTCOME';
          else if (node.data?.conflictRole === 'category') kind.textContent = 'CONFLICT CATEGORY';
          else if (node.stageId === 'conflict-detection') kind.textContent = 'CONFLICT CASE';
          else if (node.data?.details?.authorityRole === 'system-inference') kind.textContent = 'SYSTEM INFERENCE';
          else if (node.data?.details?.authorityRole === 'proposed-state') kind.textContent = 'PROPOSED STATE';
          else if (node.data?.details?.authorityRole === 'governance-path') kind.textContent = 'GOVERNANCE PATH';
          else if (node.data?.details?.authorityRole === 'human-review') kind.textContent = 'HUMAN REVIEW';
          else if (node.data?.details?.authorityRole === 'authorized-decision') kind.textContent = 'AUTHORIZED DECISION';
          else if (node.data?.details?.authorityRole === 'authoritative-state') kind.textContent = 'AUTHORITATIVE STATE';
          else if (node.data?.canonicalRole === 'registry') kind.textContent = 'CANONICAL REGISTRY';
          else if (node.data?.canonicalRole === 'cell') kind.textContent = 'REGISTRY CELL';
          else if (node.stageId === 'canonical-state') kind.textContent = 'CANONICAL STATE';
          else if (node.data?.historyRole === 'lineage-transaction') kind.textContent = node.data?.details?.type === 'SPLIT' ? 'SPLIT LINEAGE' : 'MERGE LINEAGE';
          else if (node.data?.historyRole === 'geometry-version') kind.textContent = node.data?.isCurrentGeometry ? 'CURRENT GEOMETRY' : 'GEOMETRY HISTORY';
          else if (node.data?.historyRole === 'geogit-event') kind.textContent = 'GEOGIT SUPPORT';
          else if (node.data?.historyRole === 'related-parcel') kind.textContent = node.data?.registry === 'HISTORICAL' ? 'HISTORICAL PARCEL' : 'RELATED PARCEL';
          else if (node.stageId === 'history-lineage') kind.textContent = 'HISTORY / LINEAGE';
          else kind.textContent = 'MATCHING';
          button.append(kind);
        }
        const title = document.createElement('span');
        title.className = 'eg-node-title';
        title.textContent = node.label || node.id;
        const sub = document.createElement('span');
        sub.className = 'eg-node-subtitle';
        sub.textContent = node.subtitle || node.entityType || node.type || '';
        button.append(title, sub);
        if (node.entityType === 'SourceDataset' || node.entityType === 'AdapterConcept' || node.data?.normalizationSpace || node.stageId === 'matching' || node.stageId === 'conflict-detection' || node.stageId === 'authority-review' || node.stageId === 'canonical-state' || node.stageId === 'history-lineage') {
          const details = node.data?.details ?? {};
          const meta = document.createElement('span');
          meta.className = 'eg-node-meta';
          const quality = [];
          if (node.entityType === 'SourceDataset') {
            if (Number.isFinite(Number(details.reliability))) quality.push(`reliability ${Number(details.reliability).toFixed(2)}`);
            if (details.nominalAccuracy) quality.push(details.nominalAccuracy);
          } else if (node.data?.normalizationSpace) {
            quality.push(`${fmt.format(Number(details.sourceDatasetCount) || 0)} sources`);
            quality.push(`${fmt.format(Number(details.crsChangedObservationCount) || 0)} CRS-transformed`);
            quality.push('source state preserved');
          } else if (node.stageId === 'matching') {
            if (details.matchingPhase === 'CANDIDATE_GENERATION') quality.push(`${fmt.format(Number(details.primaryCandidates) || 0)} primary`, `${fmt.format(Number(details.alternateCandidates) || 0)} alternate`);
            if (details.matchingPhase === 'RECORDED_MATCHING_EVIDENCE') quality.push('recorded observation fields', 'no pair score');
            if (details.matchingPhase === 'PARCEL_MATCH_OUTCOMES') quality.push('recorded match_status', 'no solver execution log');
            if (details.matchingPhase === 'OUTCOME_GROUP') quality.push(Object.entries(details.statusCounts || {}).map(([k,v]) => `${k.replaceAll('_',' ')} ${fmt.format(v)}`).join(' · '));
          } else if (node.stageId === 'conflict-detection') {
            quality.push(`${fmt.format(Number(details.parcelCount) || 0)} parcels`);
            if (details.statusCounts) quality.push(Object.entries(details.statusCounts).map(([k,v]) => `${k.toLowerCase()} ${fmt.format(v)}`).join(' · '));
            if (Number(details.humanReviewRequired) > 0) quality.push(`${fmt.format(Number(details.humanReviewRequired))} require review`);
          } else if (node.stageId === 'authority-review') {
            if (details.authorityRole === 'system-inference') quality.push('confidence is advisory', 'not authority');
            if (details.authorityRole === 'proposed-state') quality.push('proposal only', 'not yet authoritative');
            if (details.authorityRole === 'governance-path') quality.push(`${fmt.format(Number(details.explicitParcelCoverage) || 0)} parcels with explicit governance event`);
            if (details.authorityRole === 'human-review') quality.push('recorded review event', 'not acceptance');
            if (details.authorityRole === 'authorized-decision') quality.push(String(details.eventType || '').replaceAll('_',' ').toLowerCase());
            if (details.authorityRole === 'authoritative-state') quality.push(String(node.status || '').replaceAll('_',' ').toLowerCase());
          } else if (node.stageId === 'canonical-state') {
            if (details.canonicalRole === 'registry') {
              quality.push(`${fmt.format(Number(details.traceCoverage?.complete) || 0)} traceable`);
              quality.push('evidence chain preserved');
            } else if (details.canonicalRole === 'cell') quality.push('active registry members');
          } else if (node.stageId === 'history-lineage') {
            if (node.data?.historyRole === 'lineage-transaction') quality.push(`${node.data?.details?.parentParcelIds?.length || 0} parent${node.data?.details?.parentParcelIds?.length === 1 ? '' : 's'}`, `${node.data?.details?.childParcelIds?.length || 0} child/result${node.data?.details?.childParcelIds?.length === 1 ? '' : 's'}`);
            if (node.data?.historyRole === 'geometry-version') quality.push((node.data?.historyKinds || []).map((x) => x.replaceAll('_',' ').toLowerCase()).join(' · '));
            if (node.data?.historyRole === 'geogit-event') quality.push('supporting version/history evidence', 'not Evidence Graph source');
            if (node.data?.historyRole === 'related-parcel') quality.push(node.data?.registry === 'HISTORICAL' ? 'historical state' : 'related current state');
          } else {
            quality.push(`${fmt.format(Number(details.sourceCount) || 0)} source${Number(details.sourceCount) === 1 ? '' : 's'}`);
            quality.push(`${fmt.format(Number(details.successfulOutputs) || 0)} outputs`);
            if (Number(details.qualityWarningCount) > 0) quality.push(`${fmt.format(Number(details.qualityWarningCount))} QC flags`);
          }
          meta.textContent = quality.filter(Boolean).join(' · ');
          if (meta.textContent) button.append(meta);
        }
        const signalDetails = node.data?.details ?? {};
        const confidenceSignals = [
          ['source reliability', safeNumber(signalDetails.reliability)],
          ['matching confidence', safeNumber(signalDetails.overallMatchConfidence)],
          ['correction confidence', safeNumber(signalDetails.correctionConfidence)],
          ['reconciliation confidence', safeNumber(signalDetails.reconciliationConfidence)],
        ].filter(([, value]) => value !== null);
        if (confidenceSignals.length) {
          const signal = document.createElement('span');
          signal.className = 'eg-confidence-cues';
          for (const [kind, value] of confidenceSignals) {
            const cue = document.createElement('i');
            cue.className = 'eg-confidence-cue';
            cue.style.setProperty('--eg-confidence', String(Math.max(0, Math.min(1, value))));
            cue.title = `${kind}: ${value}`;
            cue.setAttribute('aria-label', `${kind}: ${value}`);
            signal.append(cue);
          }
          button.append(signal);
        }
        const metricValue = safeNumber(node.metric?.value);
        if (metricValue !== null || (node.aggregate && safeNumber(node.count) !== null)) {
          const badge = document.createElement('span');
          badge.className = 'eg-node-badge';
          const value = metricValue ?? Number(node.count);
          badge.textContent = `${fmt.format(value)}${node.metric?.label ? ` ${node.metric.label}` : node.aggregate ? ' records' : ''}`;
          button.append(badge);
        }
        this.nodesLayer.append(button);
      });
    }


    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'eg-arrow'); marker.setAttribute('markerWidth', '7'); marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '6'); marker.setAttribute('refY', '3.5'); marker.setAttribute('orient', 'auto');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M0,0 L7,3.5 L0,7 Z'); arrow.setAttribute('class', 'eg-arrow-head');
    marker.append(arrow); defs.append(marker); this.svg.append(defs);

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of edges) {
      if (!renderPlan.edgeIds.has(edge.id)) continue;
      const a = positions.get(edge.from), b = positions.get(edge.to);
      if (!a || !b) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const isReferenceBacklink = b.y <= a.y;
      const upper = isReferenceBacklink ? b : a;
      const lower = isReferenceBacklink ? a : b;
      const fromY = upper.y + Math.min(38, Number(upper.nodeHeight || 76) / 2);
      const toY = lower.y - Math.min(38, Number(lower.nodeHeight || 76) / 2);
      const verticalDistance = Math.max(24, toY - fromY);
      const control = Math.max(28, verticalDistance * 0.46);
      path.setAttribute('d', `M ${upper.x} ${fromY} C ${upper.x} ${fromY + control}, ${lower.x} ${toY - control}, ${lower.x} ${toY}`);
      const isMatching = edge.stageId === 'matching';
      const isConflict = edge.stageId === 'conflict-detection';
      const isAuthority = edge.stageId === 'authority-review';
      const isCanonical = edge.stageId === 'canonical-state';
      const isHistory = edge.stageId === 'history-lineage';
      const fromNode = nodeById.get(edge.from); const toNode = nodeById.get(edge.to);
      const touchesSelected = Boolean(selectedNodeId && (edge.from === selectedNodeId || edge.to === selectedNodeId));
      const touchesRejected = [fromNode?.status, toNode?.status].some((status) => /REJECT/i.test(String(status || '')));
      const isCandidateRelation = ['HAS_CANDIDATE','CANDIDATE_FOR','PAIR_EVIDENCE_FOR'].includes(edge.type);
      path.setAttribute('class', `eg-edge${Number(edge.stageIndex) === currentStageIndex ? ' is-current' : ''}${touchesSelected ? ' is-selection-edge' : ''}${edge.type === 'ROUTED_TO_ADAPTER' ? ' is-adapter-route' : ''}${edge.type === 'NORMALIZED_TO' ? ' is-normalization-route' : ''}${isCandidateRelation ? ' is-candidate-relation' : ''}${touchesRejected ? ' is-rejected-relation' : ''}${isMatching ? ' is-matching-route' : ''}${isConflict ? ' is-conflict-route' : ''}${isAuthority ? ' is-authority-route' : ''}${isCanonical ? ' is-canonical-route' : ''}${isHistory ? ' is-history-route' : ''}${isReferenceBacklink ? ' is-reference-backlink' : ''}`);
      path.dataset.edgeType = edge.type || '';
      path.dataset.stageIndex = String(edge.stageIndex ?? '');
      path.dataset.visualDirection = isReferenceBacklink ? 'undirected-back-reference' : 'downstream';
      if ((edge.type === 'ROUTED_TO_ADAPTER' || edge.type === 'NORMALIZED_TO' || isMatching || isConflict || isAuthority || isCanonical || isHistory) && Number(edge.stageIndex) === currentStageIndex) {
        path.style.strokeDasharray = edge.type === 'NORMALIZED_TO' ? '5 8' : isMatching ? '4 7' : isConflict ? '3 7' : isAuthority ? '6 7' : isCanonical ? '7 6' : isHistory ? '5 7' : '7 9';
        path.style.strokeDashoffset = String(Math.round((1 - Number(snapshot.stageProgress || 0)) * 48));
      }
      if (!isReferenceBacklink) path.setAttribute('marker-end', 'url(#eg-arrow)');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${edge.type}${edge.count ? ` · ${fmt.format(edge.count)} linked records` : ''}${isReferenceBacklink ? ' · reference link to earlier authoritative state' : ''}`;
      path.append(title);
      this.svg.append(path);
    }
    this.lastVisibleNodeIds = new Set(nodes.map((node) => node.id));
  }

  destroy() {
    this.viewport?.removeEventListener?.('scroll', this.onViewportChange);
    this.resizeObserver?.disconnect?.();
    this.nodesLayer?.removeEventListener?.('click', this.onNodeClick);
    this.container.replaceChildren();
    this.lastSnapshot = null;
    this.lastFollowOperationIndex = -1;
    this.lastVisibleNodeIds = new Set();
    this.lastTimelinePosition = -1;
  }
}
