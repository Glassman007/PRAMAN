import { NODE_TYPES, EDGE_TYPES } from '../data/constants.mjs';
import { REPLAY_STAGES } from './stages.mjs';
import { ADAPTER_DEFINITIONS } from './adapterProcessing.mjs';
import { classifyMatchOutcome, buildMatchingObservationModel } from './distortionAwareMatching.mjs';
import { buildParcelHistoryLineageModel } from './historyLineage.mjs';

const stageIndexById = new Map(REPLAY_STAGES.map((s, i) => [s.id, i]));
const uniq = (xs) => [...new Set((xs ?? []).filter(Boolean))];
const byId = (rows, field) => new Map(rows.map((r) => [r[field], r]));
const nodeKey = (type, id) => `${type}:${id}`;
const edgeId = (type, from, to, qualifier = '') => `parcel-edge:${type}:${from}->${to}:${qualifier}`;

function decorate(node, stageId, extra = {}) {
  const stageIndex = stageIndexById.get(stageId);
  return {
    ...node,
    ...extra,
    stageId,
    stageIndex,
    aggregate: false,
    count: 1,
    memberRecordIds: node.datasetRecordId ? [node.datasetRecordId] : [],
    data: { ...(node.data ?? {}), parcelMode: true, ...(extra.data ?? {}) }
  };
}

function edge(type, from, to, stageId, metadataRef = null, data = null, qualifier = '') {
  return {
    id: edgeId(type, from, to, qualifier), type, from, to, stageId,
    stageIndex: stageIndexById.get(stageId), count: 1,
    memberRecordIds: [], metadataRef, data: { parcelMode: true, ...(data ?? {}) }
  };
}

function adapterNode(definition, observations, sourceNames) {
  const recordIds = observations.map((o) => o.observation_id);
  const sourceTypes = uniq(observations.map((o) => o.source_type));
  const sources = sourceTypes.map((t) => sourceNames.get(t) ?? t);
  const id = `AdapterConcept:${definition.id}`;
  return {
    id, type: NODE_TYPES.AdapterConcept, entityType: NODE_TYPES.AdapterConcept,
    datasetRecordId: definition.id, canonicalParcelId: null, sourceId: null,
    timestamp: null, status: 'ARCHITECTURE_ROUTE', confidence: null,
    metadataRef: { table: 'PRAMAN_ADAPTER_ARCHITECTURE', recordId: definition.id, field: null },
    label: definition.name,
    subtitle: `${recordIds.length} contributing observation${recordIds.length === 1 ? '' : 's'} · ${sources.join(', ')}`,
    stageId: 'adapters', stageIndex: stageIndexById.get('adapters'), aggregate: false,
    count: recordIds.length, memberRecordIds: recordIds,
    metric: { label: 'PARCEL OBSERVATIONS ROUTED', value: recordIds.length },
    data: {
      parcelMode: true, memberTable: 'SOURCE_OBSERVATIONS', memberRecordIds: recordIds, adapterId: definition.id, adapterName: definition.name,
      executionRecordsAvailable: false, architectureRoute: true,
      input: definition.input, processing: definition.processing, output: definition.output,
      transformations: [...definition.transformations], sourceTypes, sourceNames: sources,
      sourceCount: sourceTypes.length, recordsProcessed: recordIds.length,
      successfulOutputs: recordIds.length, observationIds: recordIds,
      qualityWarningCount: 0,
      details: {
        adapterId: definition.id, adapterName: definition.name, sourceCount: sourceTypes.length,
        recordsProcessed: recordIds.length, successfulOutputs: recordIds.length,
        sourceTypes, sources: sourceTypes.map((sourceType) => ({ sourceType, sourceName: sourceNames.get(sourceType) ?? sourceType })),
        input: definition.input, processing: definition.processing, output: definition.output,
        transformations: [...definition.transformations], executionRecordsAvailable: false,
        quarantineAvailable: false
      }
    }
  };
}

function matchDecisionLabel(recon) {
  const group = classifyMatchOutcome(recon.match_status);
  if (group === 'ACCEPTED') return `Accepted match · ${recon.match_status}`;
  if (group === 'AMBIGUOUS') return `Ambiguous match outcome · ${recon.match_status}`;
  if (group === 'REJECTED') return `Rejected match outcome · ${recon.match_status}`;
  return `Match outcome · ${recon.match_status || 'UNKNOWN'}`;
}

function statusCounts(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = row[field] || 'UNSPECIFIED';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function confidenceRange(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function buildParcelSearchIndexUncached(layer) {
  if (!layer?.tables) throw new Error('buildParcelSearchIndex requires the evidence data layer');
  const reconByParcel = byId(layer.tables.reconciledParcels, 'canonical_parcel_id');
  const parcelRows = [
    ...layer.tables.canonicalParcels.map((row) => ({ row, registry: 'ACTIVE' })),
    ...layer.tables.historicalParcels.map((row) => ({ row, registry: 'HISTORICAL' })),
  ];

  const observationParcel = new Map();
  for (const reconciliation of layer.tables.reconciledParcels) {
    for (const observationId of reconciliation.matchedSourceIds || []) {
      observationParcel.set(String(observationId), String(reconciliation.canonical_parcel_id));
    }
  }

  const sourceAliasesByParcel = new Map();
  for (const observation of layer.tables.sourceObservations) {
    const sourceParcelId = String(observation.source_parcel_id || '').trim();
    const parcelId = observationParcel.get(String(observation.observation_id));
    if (!sourceParcelId || !parcelId) continue;
    if (!sourceAliasesByParcel.has(parcelId)) sourceAliasesByParcel.set(parcelId, new Map());
    const aliases = sourceAliasesByParcel.get(parcelId);
    if (!aliases.has(sourceParcelId)) aliases.set(sourceParcelId, new Set());
    aliases.get(sourceParcelId).add(observation.source_type);
  }

  const entries = [];
  for (const { row, registry } of parcelRows) {
    const parcelId = row.canonical_parcel_id;
    const recon = reconByParcel.get(parcelId);
    const common = {
      parcelId,
      status: registry === 'ACTIVE' ? (row.parcel_status || 'ACTIVE') : (row.record_status || 'HISTORICAL_RETIRED'),
      registry,
      cellId: row.cell_id || null,
      owner: registry === 'ACTIVE' ? (row.owner_entity || null) : (row.former_owner || null),
      landUse: row.land_use || null,
      propertyType: row.property_type || null,
      matchStatus: recon?.match_status ?? null,
    };
    entries.push({
      ...common,
      searchId: parcelId,
      identifierType: 'CANONICAL_PARCEL',
      sourceTypes: [],
      label: `${parcelId} · ${registry === 'ACTIVE' ? (row.land_use || row.property_type || 'ACTIVE') : (row.lineage_status || row.record_status || 'HISTORICAL')}`,
    });

    const aliases = sourceAliasesByParcel.get(parcelId) || new Map();
    for (const [sourceParcelId, sourceTypes] of aliases) {
      entries.push({
        ...common,
        searchId: sourceParcelId,
        identifierType: 'SOURCE_PARCEL',
        sourceTypes: [...sourceTypes].sort(),
        label: `${sourceParcelId} → ${parcelId} · source parcel identifier`,
      });
    }
  }

  return entries.sort((a, b) => a.searchId.localeCompare(b.searchId, undefined, { numeric: true }) || a.parcelId.localeCompare(b.parcelId, undefined, { numeric: true }));
}

function buildIndividualParcelModeModelUncached(layer, parcelId) {
  if (!layer?.tables) throw new Error('buildIndividualParcelModeModel requires the evidence data layer');
  const base = layer.getParcelEvidence(parcelId);
  if (!base.found) return { found: false, parcelId, nodes: [], edges: [], story: null, applicableStages: [], omittedStageNotes: {}, diagnostics: base.diagnostics ?? [] };

  const evidenceNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const recon = layer.tables.reconciledParcels.find((r) => r.canonical_parcel_id === parcelId) ?? null;
  const canonical = layer.tables.canonicalParcels.find((r) => r.canonical_parcel_id === parcelId) ?? null;
  const historical = layer.tables.historicalParcels.find((r) => r.canonical_parcel_id === parcelId) ?? null;
  const matchedIds = new Set(recon?.matchedSourceIds ?? []);
  const observations = layer.tables.sourceObservations.filter((o) => matchedIds.has(o.observation_id));
  const observationById = byId(observations, 'observation_id');
  const normalizedById = byId(layer.tables.matchingInput, 'observation_id');
  const sourceByType = byId(layer.tables.sourceMetadata, 'source_type');
  const sourceNames = new Map(layer.tables.sourceMetadata.map((r) => [r.source_type, r.source_name || r.source_type]));
  const conflicts = layer.tables.conflicts.filter((c) => c.canonical_parcel_id === parcelId);
  const historyLineage = buildParcelHistoryLineageModel(layer, parcelId);
  const geometryVersions = historyLineage.geometryVersions ?? [];
  const directLineage = layer.getParcelLineage(parcelId).directEvents ?? [];
  const governanceEvents = layer.tables.geogitEvents
    .filter((e) => e.parcel_id === parcelId && ['HUMAN_REVIEW', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED'].includes(e.event_type))
    .sort((a,b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const nodes = new Map();
  const edges = new Map();
  const addNode = (n) => { if (n) nodes.set(n.id, n); return n; };
  const addEdge = (e) => { if (e && nodes.has(e.from) && nodes.has(e.to)) edges.set(e.id, e); return e; };

  // 1. Original source datasets + only the observation membership of this parcel.
  for (const sourceType of uniq(observations.map((o) => o.source_type))) {
    const source = sourceByType.get(sourceType);
    const sourceNode = source ? evidenceNodes.get(nodeKey(NODE_TYPES.SourceDataset, source.source_id)) : null;
    if (sourceNode) addNode(decorate(sourceNode, 'sources', {
      label: source.source_name || sourceType,
      subtitle: `${sourceType} · contributing to ${parcelId}`,
      data: { ...(sourceNode.data ?? {}), parcelMode: true, contributingObservationIds: observations.filter((o) => o.source_type === sourceType).map((o) => o.observation_id) }
    }));
  }
  for (const obs of observations) {
    const baseNode = evidenceNodes.get(nodeKey(NODE_TYPES.SourceObservation, obs.observation_id));
    if (!baseNode) continue;
    const on = addNode(decorate(baseNode, 'sources', {
      label: obs.source_record_id || obs.observation_id,
      subtitle: `${sourceNames.get(obs.source_type) ?? obs.source_type} · ${obs.observation_id}`,
      data: { ...(baseNode.data ?? {}), parcelMode: true }
    }));
    const source = sourceByType.get(obs.source_type);
    const sn = source ? nodes.get(nodeKey(NODE_TYPES.SourceDataset, source.source_id)) : null;
    if (sn) addEdge(edge('PROVIDED_OBSERVATION', sn.id, on.id, 'sources', on.metadataRef, { sourceType: obs.source_type }, obs.observation_id));
  }

  // 2. Conceptual adapter routing. No fake execution record is created.
  const activeAdapters = [];
  for (const definition of ADAPTER_DEFINITIONS) {
    const routed = observations.filter((o) => definition.sourceTypes.includes(o.source_type));
    if (!routed.length) continue;
    const an = addNode(adapterNode(definition, routed, sourceNames));
    activeAdapters.push({ definition, node: an, observations: routed });
    for (const obs of routed) {
      const on = nodes.get(nodeKey(NODE_TYPES.SourceObservation, obs.observation_id));
      if (on) addEdge(edge(EDGE_TYPES.ROUTED_TO_ADAPTER, on.id, an.id, 'adapters', on.metadataRef, { architectureRoute: true, adapterId: definition.id }, obs.observation_id));
    }
  }

  // 3. Normalized observations retain the same observation IDs.
  for (const obs of observations) {
    const norm = normalizedById.get(obs.observation_id);
    const baseNode = norm ? evidenceNodes.get(nodeKey(NODE_TYPES.NormalizedObservation, obs.observation_id)) : null;
    if (!baseNode) continue;
    const nn = addNode(decorate(baseNode, 'normalization', { label: obs.observation_id, subtitle: `${obs.source_type} · normalized representation` }));
    for (const adapter of activeAdapters.filter((a) => a.definition.sourceTypes.includes(obs.source_type))) {
      addEdge(edge(EDGE_TYPES.NORMALIZED_TO, adapter.node.id, nn.id, 'normalization', nn.metadataRef, { sourceObservationId: obs.observation_id, sourceStatePreserved: true }, `${adapter.definition.id}:${obs.observation_id}`));
    }
  }

  // 4. Recorded candidate associations for contributing observations only.
  const candidateNodes = [];
  for (const obs of observations) {
    const candidates = [
      ...(obs.candidate_canonical_parcel_id ? [{ parcelId: obs.candidate_canonical_parcel_id, role: 'PRIMARY', ordinal: 0 }] : []),
      ...obs.alternateCandidateParcelIds.map((p, i) => ({ parcelId: p, role: 'ALTERNATE', ordinal: i }))
    ];
    for (const c of candidates) {
      const id = `${obs.observation_id}:${c.parcelId}:${c.role}:${c.ordinal}`;
      const bn = evidenceNodes.get(nodeKey(NODE_TYPES.MatchCandidate, id));
      if (!bn) continue;
      const cn = addNode(decorate(bn, 'matching', {
        label: `${c.role === 'PRIMARY' ? 'Primary' : 'Alternate'} candidate · ${c.parcelId}`,
        subtitle: obs.observation_id,
        data: { ...(bn.data ?? {}), parcelMode: true, matchingRole: 'candidate', observationId: obs.observation_id, candidateParcelId: c.parcelId, role: c.role, pairwiseScoreAvailable: false, pairwiseDecisionAvailable: false }
      }));
      candidateNodes.push(cn);
      const nn = nodes.get(nodeKey(NODE_TYPES.NormalizedObservation, obs.observation_id));
      if (nn) addEdge(edge(EDGE_TYPES.HAS_CANDIDATE, nn.id, cn.id, 'matching', bn.metadataRef, { role: c.role }, id));
    }
  }

  let matchDecision = null;
  if (recon) {
    const bn = evidenceNodes.get(nodeKey(NODE_TYPES.MatchDecision, parcelId));
    if (bn) {
      const outcomeGroup = classifyMatchOutcome(recon.match_status);
      matchDecision = addNode(decorate(bn, 'matching', {
        label: matchDecisionLabel(recon), subtitle: 'Parcel-level recorded match outcome', status: outcomeGroup,
        metric: { label: 'PARCEL OUTCOME', value: 1 },
        data: { ...(bn.data ?? {}), parcelMode: true, matchingRole: 'outcome-group', details: { matchingPhase: 'OUTCOME_GROUP', outcomeGroup, statusCounts: { [recon.match_status || 'UNKNOWN']: 1 }, parcelLevelOnly: true } }
      }));
      for (const cn of candidateNodes.filter((n) => n.data?.role === 'PRIMARY' && n.data?.candidateParcelId === parcelId)) {
        addEdge(edge(EDGE_TYPES.RECORDED_MATCH_OUTCOME, cn.id, matchDecision.id, 'matching', bn.metadataRef, { parcelLevelOnly: true, pairwiseAcceptanceDecisionAvailable: false }, cn.datasetRecordId));
      }
    }
  }

  // Only explicit conflicts. Clean parcel => no conflict node.
  const conflictNodes = [];
  for (const c of conflicts) {
    const bn = evidenceNodes.get(nodeKey(NODE_TYPES.Conflict, c.conflict_id));
    if (!bn) continue;
    const cn = addNode(decorate(bn, 'conflict-detection', { label: c.conflict_type?.replaceAll('_',' ') || c.conflict_id, subtitle: `${c.attribute_or_geometry || 'disagreement'} · ${c.status || ''}` }));
    conflictNodes.push(cn);
    if (matchDecision) addEdge(edge(EDGE_TYPES.GENERATED_CONFLICT, matchDecision.id, cn.id, 'conflict-detection', bn.metadataRef, { identityRetained: true }, c.conflict_id));
  }

  // 6. Reconciliation proposal.
  let proposal = null;
  if (recon) {
    const bn = evidenceNodes.get(nodeKey(NODE_TYPES.ReconciliationProposal, parcelId));
    if (bn) {
      proposal = addNode(decorate(bn, 'reconciliation', { label: 'Reconciliation proposal', subtitle: recon.match_status || 'Recorded proposal' }));
      if (conflictNodes.length) {
        for (const cn of conflictNodes) addEdge(edge(EDGE_TYPES.RECONCILED_WITH, cn.id, proposal.id, 'reconciliation', bn.metadataRef, { conflictId: cn.datasetRecordId }, cn.datasetRecordId));
      } else if (matchDecision) {
        addEdge(edge(EDGE_TYPES.RECONCILED_WITH, matchDecision.id, proposal.id, 'reconciliation', bn.metadataRef, { noRecordedConflicts: true }, 'clean'));
      }
    }
  }

  // 7. Explicit governance events + stored authority state.
  let previousGovernance = proposal;
  for (const event of governanceEvents) {
    const type = event.event_type === 'HUMAN_REVIEW' ? NODE_TYPES.ReviewEvent : NODE_TYPES.ReviewDecision;
    const bn = evidenceNodes.get(nodeKey(type, event.event_id));
    if (!bn) continue;
    const role = event.event_type === 'HUMAN_REVIEW' ? 'human-review' : 'authorized-decision';
    const gn = addNode(decorate(bn, 'authority-review', {
      label: event.event_type.replaceAll('_',' '), subtitle: `${event.actor_type || event.source || 'Recorded governance action'} · ${event.timestamp || ''}`,
      data: { ...(bn.data ?? {}), parcelMode: true, details: { authorityRole: role, eventType: event.event_type, actorType: event.actor_type, source: event.source, reason: event.reason, timestamp: event.timestamp } }
    }));
    if (previousGovernance) addEdge(edge(previousGovernance === proposal ? EDGE_TYPES.ENTERS_GOVERNANCE_PATH : EDGE_TYPES.GOVERNANCE_OUTCOME, previousGovernance.id, gn.id, 'authority-review', gn.metadataRef, { eventType: event.event_type }, event.event_id));
    previousGovernance = gn;
  }
  let authority = null;
  if (recon) {
    const bn = evidenceNodes.get(nodeKey(NODE_TYPES.AuthoritativeState, parcelId));
    if (bn) {
      authority = addNode(decorate(bn, 'authority-review', {
        label: `Authoritative state · ${recon.authoritativeState?.state || 'RECORDED'}`,
        subtitle: governanceEvents.length ? 'Resulting recorded authority state' : 'Recorded authority state · no explicit governance event',
        data: { ...(bn.data ?? {}), parcelMode: true, details: { authorityRole: 'authoritative-state', explicitGovernanceEvents: governanceEvents.length, resultingState: recon.authoritativeState?.state ?? null } }
      }));
      if (previousGovernance) addEdge(edge(EDGE_TYPES.AUTHORITY_STATE, previousGovernance.id, authority.id, 'authority-review', bn.metadataRef, { explicitGovernanceEvent: governanceEvents.length > 0 }, 'authority'));
    }
  }

  // 8. Actual active or historical parcel state.
  let parcelNode = null;
  const parcelType = canonical ? NODE_TYPES.CanonicalParcel : NODE_TYPES.HistoricalParcel;
  const parcelRecord = canonical ?? historical;
  if (parcelRecord) {
    const bn = evidenceNodes.get(nodeKey(parcelType, parcelId));
    if (bn) {
      parcelNode = addNode(decorate(bn, 'canonical-state', {
        label: parcelId,
        subtitle: canonical ? `${canonical.land_use || ''} · authoritative canonical parcel`.replace(/^ · /,'') : `${historical.lineage_status || historical.record_status || 'Historical parcel'}`,
        data: { ...(bn.data ?? {}), parcelMode: true, canonicalRole: canonical ? 'parcel' : 'historical-parcel', details: { canonicalRole: canonical ? 'parcel' : 'historical-parcel', registry: canonical ? 'ACTIVE' : 'HISTORICAL' } }
      }));
      if (authority) addEdge(edge(EDGE_TYPES.MATERIALIZED_IN_REGISTRY, authority.id, parcelNode.id, 'canonical-state', bn.metadataRef, { registry: canonical ? 'ACTIVE' : 'HISTORICAL' }, 'registry'));
      else if (proposal) addEdge(edge(EDGE_TYPES.MATERIALIZED_IN_REGISTRY, proposal.id, parcelNode.id, 'canonical-state', bn.metadataRef, { authorityEventUnavailable: true }, 'registry-no-authority'));
    }
  }

  // 9. History / lineage is a parallel explainability branch. GeoGit supports parcel/version history;
  // it is not the source of the Evidence Graph and is never joined directly to a geometry version.
  if (parcelNode && historyLineage.found) {
    const parcelHistoryNodes = new Map([[parcelId, parcelNode]]);
    let order = 10;
    for (const related of historyLineage.relatedParcels) {
      const type = related.registry === 'ACTIVE' ? NODE_TYPES.CanonicalParcel : NODE_TYPES.HistoricalParcel;
      const record = related.record ?? {};
      const id = nodeKey(type, related.parcelId);
      const relatedNode = addNode({
        id, type, entityType: type, datasetRecordId: related.parcelId, canonicalParcelId: related.parcelId, sourceId: null,
        timestamp: record.retired_date || null, status: related.status, confidence: null,
        metadataRef: { table: related.registry === 'ACTIVE' ? 'CANONICAL_PARCELS' : 'HISTORICAL_PARCELS', recordId: related.parcelId, field: null },
        label: related.parcelId,
        subtitle: related.registry === 'HISTORICAL' ? `${record.lineage_status || record.record_status || 'Historical parcel'} · related lineage state` : 'Related current parcel',
        stageId: 'history-lineage', stageIndex: stageIndexById.get('history-lineage'), aggregate: false, count: 1, memberRecordIds: [related.parcelId],
        data: { ...record, parcelMode: true, historyRole: 'related-parcel', selectedParcelId: parcelId, visualTone: related.registry === 'HISTORICAL' ? 'historical' : 'related-current', registry: related.registry, lineageRoles: related.roles, order: order++ }
      });
      parcelHistoryNodes.set(related.parcelId, relatedNode);
    }

    const transactionNodes = new Map();
    for (const tx of historyLineage.transactions) {
      const firstId = tx.memberLineageEventIds[0];
      const txNode = addNode({
        id: `LineageTransaction:${tx.id}`, type: NODE_TYPES.LineageTransaction, entityType: NODE_TYPES.LineageTransaction,
        datasetRecordId: firstId, canonicalParcelId: parcelId, sourceId: null, timestamp: tx.effectiveDate, status: tx.acceptedStatuses.join(';') || null, confidence: null,
        metadataRef: { table: 'PARCEL_LINEAGE', recordId: firstId, field: null },
        label: `${tx.type} lineage transaction`,
        subtitle: tx.type === 'SPLIT' ? `${tx.parentParcelIds.join(' + ')} → ${tx.childParcelIds.join(' + ')}` : `${tx.parentParcelIds.join(' + ')} → ${tx.childParcelIds.join(' + ')}`,
        stageId: 'history-lineage', stageIndex: stageIndexById.get('history-lineage'), aggregate: tx.memberLineageEventIds.length > 1,
        count: tx.memberLineageEventIds.length, memberRecordIds: tx.memberLineageEventIds,
        metric: { label: 'LINEAGE EDGES', value: tx.memberLineageEventIds.length },
        data: { parcelMode: true, historyRole: 'lineage-transaction', selectedParcelId: parcelId, visualTone: 'lineage', order: order++, details: tx }
      });
      transactionNodes.set(tx.id, txNode);
      for (const parentId of tx.parentParcelIds) {
        const pn = parcelHistoryNodes.get(parentId);
        if (pn) addEdge(edge(EDGE_TYPES.LINEAGE_INPUT, pn.id, txNode.id, 'history-lineage', txNode.metadataRef, { lineageType: tx.type, transactionId: tx.id }, `${tx.id}:${parentId}`));
      }
      for (const childId of tx.childParcelIds) {
        const cn = parcelHistoryNodes.get(childId);
        if (cn) addEdge(edge(EDGE_TYPES.LINEAGE_RESULT, txNode.id, cn.id, 'history-lineage', txNode.metadataRef, { lineageType: tx.type, transactionId: tx.id }, `${tx.id}:${childId}`));
      }
    }

    const geometryNodes = new Map();
    for (const g of geometryVersions) {
      const bn = evidenceNodes.get(nodeKey(NODE_TYPES.GeometryVersion, g.geometry_id));
      if (!bn) continue;
      const gn = addNode(decorate(bn, 'history-lineage', {
        label: g.isCurrentCanonicalGeometry ? `Current geometry · ${g.version_label || g.geometry_id}` : (g.isCurrent ? `Historical reference geometry · ${g.version_label || g.geometry_id}` : `${g.version_label || g.geometry_id}`),
        subtitle: `${g.historyKinds.join(' · ').replaceAll('_',' ')} · ${g.effective_date || ''}`,
        data: { ...(bn.data ?? {}), parcelMode: true, historyRole: 'geometry-version', selectedParcelId: parcelId, historyKinds: g.historyKinds, visualTone: g.visualTone, isCurrentGeometry: g.isCurrentCanonicalGeometry, isSelectedGeometryReference: g.isCurrent, order: order++, details: g }
      }));
      geometryNodes.set(g.geometry_id, gn);
      addEdge(edge(EDGE_TYPES.VERSION_OF, gn.id, parcelNode.id, 'history-lineage', bn.metadataRef, { historyKinds: g.historyKinds, current: g.isCurrent }, g.geometry_id));
    }
    for (const g of geometryVersions) {
      if (!g.supersedes_geometry_id) continue;
      const newer = geometryNodes.get(g.geometry_id);
      const older = geometryNodes.get(g.supersedes_geometry_id);
      if (newer && older) addEdge(edge(EDGE_TYPES.SUPERSEDES, newer.id, older.id, 'history-lineage', newer.metadataRef, { noDirectGeoGitGeometryLink: true }, g.geometry_id));
    }

    const geogitNodes = new Map();
    for (const ge of historyLineage.geogitEvents) {
      const bn = evidenceNodes.get(nodeKey(NODE_TYPES.GeoGitEvent, ge.event_id));
      if (!bn) continue;
      const gen = addNode(decorate(bn, 'history-lineage', {
        label: ge.event_type?.replaceAll('_',' ') || ge.event_id,
        subtitle: `${ge.timestamp || ''} · supporting GeoGit/version evidence`,
        data: { ...(bn.data ?? {}), parcelMode: true, historyRole: 'geogit-event', selectedParcelId: parcelId, visualTone: 'supporting', order: order++, details: { ...ge, supportingHistoricalEvidence: true, evidenceGraphDependency: false } }
      }));
      geogitNodes.set(ge.event_id, gen);
      if (ge.parcel_id === parcelId) addEdge(edge(EDGE_TYPES.HAS_GEOGIT_EVENT, parcelNode.id, gen.id, 'history-lineage', bn.metadataRef, { supportingHistoricalEvidence: true, evidenceGraphDependency: false }, ge.event_id));
    }
    for (const tx of historyLineage.transactions) {
      const txn = transactionNodes.get(tx.id);
      if (!txn) continue;
      for (const ge of tx.geogitEvents) {
        const gen = geogitNodes.get(ge.event_id);
        if (gen) addEdge(edge(EDGE_TYPES.RECORDED_IN_GEOGIT, txn.id, gen.id, 'history-lineage', gen.metadataRef, { supportingHistoricalEvidence: true, noGeometryLink: true }, ge.event_id));
      }
    }
  }

  const matchingModels = observations.map((o) => buildMatchingObservationModel(layer, o.observation_id)).filter((m) => m.found);
  const conflictTypes = uniq(conflicts.map((c) => c.conflict_type));
  const openConflicts = conflicts.filter((c) => c.status === 'OPEN');
  const resolvedConflicts = conflicts.filter((c) => c.status === 'RESOLVED');
  const story = {
    parcelId,
    registry: canonical ? 'ACTIVE' : 'HISTORICAL',
    sourceRecords: observations.map((o) => ({ observationId: o.observation_id, sourceRecordId: o.source_record_id, sourceParcelId: o.source_parcel_id, sourceType: o.source_type, sourceName: sourceNames.get(o.source_type) ?? o.source_type, observationDate: o.observation_date })),
    adapters: activeAdapters.map((a) => ({ adapterId: a.definition.id, adapterName: a.definition.name, observationIds: a.observations.map((o) => o.observation_id), executionLogAvailable: false })),
    matching: recon ? {
      matchStatus: recon.match_status, outcomeGroup: classifyMatchOutcome(recon.match_status), criticalityLevel: recon.criticality_level,
      criticalityReason: recon.criticality_reason, overallMatchConfidence: recon.overallMatchConfidence,
      geometryConfidence: recon.geometryConfidence, ownershipConfidence: recon.ownershipConfidence,
      landUseConfidence: recon.landUseConfidence, lineageConfidence: recon.lineageConfidence,
      reconciliationConfidence: recon.reconciliationConfidence,
      candidateAssociations: candidateNodes.length,
      primaryCandidates: candidateNodes.filter((n) => n.data?.role === 'PRIMARY').length,
      alternateCandidates: candidateNodes.filter((n) => n.data?.role === 'ALTERNATE').length,
      sourceReliabilityRange: confidenceRange(observations.map((o) => o.sourceReliability)),
      identifierConfidenceRange: confidenceRange(observations.map((o) => o.identifierConfidence)),
      geometryEvidenceRange: confidenceRange(observations.map((o) => o.geometryConfidence)),
      pairwiseScoreAvailable: false, pairwiseDecisionAvailable: false,
      observationEvidence: matchingModels
    } : null,
    conflicts: { count: conflicts.length, types: conflictTypes, open: openConflicts.length, resolved: resolvedConflicts.length, ids: conflicts.map((c) => c.conflict_id) },
    reconciliation: recon ? { proposedState: recon.proposedState, reconciliationConfidence: recon.reconciliationConfidence, matchStatus: recon.match_status, unresolvedConflictIds: recon.unresolvedConflictIds, timestamp: recon.reconciliation_timestamp } : null,
    humanReview: recon ? { required: recon.requiresHumanReview, explicitReviewEvents: governanceEvents.filter((e) => e.event_type === 'HUMAN_REVIEW'), decisionEvents: governanceEvents.filter((e) => ['PROPOSAL_ACCEPTED','PROPOSAL_REJECTED'].includes(e.event_type)) } : null,
    authoritative: recon ? { state: recon.authoritativeState, registryRecord: parcelRecord, governanceEvents } : { state: null, registryRecord: parcelRecord, governanceEvents },
    historyLineage: historyLineage.found ? {
      architecturePrinciple: historyLineage.architecturePrinciple,
      currentGeometryId: historyLineage.currentGeometryId,
      geometryVersions: historyLineage.geometryVersions,
      geometryKindCounts: historyLineage.geometryKindCounts,
      lineageTransactions: historyLineage.transactions,
      directLineageEvents: directLineage,
      directParents: historyLineage.directParents, directChildren: historyLineage.directChildren,
      ancestors: historyLineage.ancestors, descendants: historyLineage.descendants,
      relatedParcels: historyLineage.relatedParcels,
      geogitEvents: historyLineage.geogitEvents, geogitEventTypeCounts: historyLineage.geogitEventTypeCounts,
      hasSplit: historyLineage.hasSplit, hasMerge: historyLineage.hasMerge, hasResurvey: historyLineage.hasResurvey,
      hasBoundaryCorrection: historyLineage.hasBoundaryCorrection, hasMutation: historyLineage.hasMutation, hasRollback: historyLineage.hasRollback,
      hasSupersededGeometry: historyLineage.hasSupersededGeometry, hasNewCanonicalVersion: historyLineage.hasNewCanonicalVersion,
      directGeoGitGeometryLinkAvailable: false
    } : null
  };

  const applicableStages = REPLAY_STAGES.filter((stage) => [...nodes.values()].some((n) => n.stageId === stage.id)).map((s) => s.id);
  const omittedStageNotes = {};
  if (!conflicts.length) omittedStageNotes['conflict-detection'] = 'No explicit CONFLICTS rows are recorded for this parcel; the conflict operation contains no fabricated conflict node.';
  if (!governanceEvents.length) omittedStageNotes['authority-review'] = 'No HUMAN_REVIEW / PROPOSAL_ACCEPTED / PROPOSAL_REJECTED event is recorded for this parcel; the stored authoritative state remains visible without fabricating a decision event.';
  if (!(historyLineage.transactions?.length || historyLineage.geometryVersions?.length || historyLineage.geogitEvents?.length)) omittedStageNotes['history-lineage'] = 'No lineage transaction, geometry version history, or history-relevant GeoGit event is recorded for this parcel; none is fabricated.';

  return {
    found: true, parcelId, nodes: [...nodes.values()], edges: [...edges.values()], story,
    applicableStages, omittedStageNotes, diagnostics: base.diagnostics ?? [],
    evidenceMembership: { matchedSourceIds: [...matchedIds], sourceObservationCount: observations.length },
    sourceStatusCounts: statusCounts(observations, 'record_status')
  };
}

const parcelSearchIndexCache = new WeakMap();
const individualParcelModelCache = new WeakMap();

export function buildParcelSearchIndex(layer) {
  if (parcelSearchIndexCache.has(layer)) return parcelSearchIndexCache.get(layer);
  const value = buildParcelSearchIndexUncached(layer);
  parcelSearchIndexCache.set(layer, value);
  return value;
}

export function buildIndividualParcelModeModel(layer, parcelId) {
  let byParcel = individualParcelModelCache.get(layer);
  if (!byParcel) { byParcel = new Map(); individualParcelModelCache.set(layer, byParcel); }
  if (!byParcel.has(parcelId)) byParcel.set(parcelId, buildIndividualParcelModeModelUncached(layer, parcelId));
  return byParcel.get(parcelId);
}
