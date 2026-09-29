const uniq = (values) => [...new Set((values ?? []).filter(Boolean))];

function countBy(rows, fn) {
  const out = {};
  for (const row of rows ?? []) {
    const key = String(fn(row) ?? 'UNSPECIFIED');
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function byParcel(rows) { return new Map((rows ?? []).map((r) => [r.canonical_parcel_id, r])); }
function numberOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export const AUTHORITY_PRINCIPLE = 'AI CONFIDENCE ≠ LEGAL / AUTHORITATIVE STATUS';
const GOVERNANCE_EVENT_TYPES = Object.freeze(['HUMAN_REVIEW', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED']);

function buildAuthorityReviewModelUncached(layer) {
  const recon = layer.tables.reconciledParcels ?? [];
  const events = layer.tables.geogitEvents ?? [];
  const geometry = layer.tables.geometryVersions ?? [];
  const governanceEvents = events.filter((e) => GOVERNANCE_EVENT_TYPES.includes(e.event_type));
  const reviewEvents = governanceEvents.filter((e) => e.event_type === 'HUMAN_REVIEW');
  const acceptedEvents = governanceEvents.filter((e) => e.event_type === 'PROPOSAL_ACCEPTED');
  const rejectedEvents = governanceEvents.filter((e) => e.event_type === 'PROPOSAL_REJECTED');
  const authorityStateCounts = countBy(recon, (r) => r.authoritativeState?.state || 'UNSPECIFIED');
  const matchStatusCounts = countBy(recon, (r) => r.match_status || 'UNSPECIFIED');
  const reviewRequirementCounts = countBy(recon, (r) => r.requiresHumanReview ? 'REQUIRES_HUMAN_REVIEW' : 'NO_HUMAN_REVIEW_FLAG');
  const gateParcelIds = uniq(governanceEvents.map((e) => e.parcel_id));
  const pendingRows = recon.filter((r) => (r.authoritativeState?.state || '') === 'UNCHANGED_PENDING');
  const authoritativeRows = recon.filter((r) => (r.authoritativeState?.state || '') === 'AUTHORITATIVE');
  const pendingConf = pendingRows.map((r) => r.overallMatchConfidence).filter((v) => v != null);
  const authoritativeConf = authoritativeRows.map((r) => r.overallMatchConfidence).filter((v) => v != null);

  return {
    principle: AUTHORITY_PRINCIPLE,
    reconciliationRows: recon,
    governanceEvents,
    reviewEvents,
    acceptedEvents,
    rejectedEvents,
    proposedParcelIds: recon.filter((r) => r.proposedState != null).map((r) => r.canonical_parcel_id),
    gateParcelIds,
    withoutExplicitGovernanceEvent: recon.filter((r) => !gateParcelIds.includes(r.canonical_parcel_id)).map((r) => r.canonical_parcel_id),
    matchStatusCounts,
    reviewRequirementCounts,
    authorityStateCounts,
    geometryAuthorityCounts: countBy(geometry, (r) => r.accepted_status || 'UNSPECIFIED'),
    eventActorCounts: countBy(governanceEvents, (e) => e.actor_type || 'UNSPECIFIED'),
    eventSourceCounts: countBy(governanceEvents, (e) => e.source || 'UNSPECIFIED'),
    confidenceAuthorityCrosscheck: {
      pendingCount: pendingConf.length,
      authoritativeCount: authoritativeConf.length,
      pendingOverallMatchRange: pendingConf.length ? [Math.min(...pendingConf), Math.max(...pendingConf)] : [null, null],
      authoritativeOverallMatchRange: authoritativeConf.length ? [Math.min(...authoritativeConf), Math.max(...authoritativeConf)] : [null, null],
      overlapExists: pendingConf.length && authoritativeConf.length
        ? Math.max(...pendingConf) >= Math.min(...authoritativeConf)
        : false
    }
  };
}

function buildAuthorityInspectionModelUncached(layer, recordId) {
  const reconByParcel = byParcel(layer.tables.reconciledParcels ?? []);
  const events = layer.tables.geogitEvents ?? [];
  const event = events.find((e) => e.event_id === recordId && GOVERNANCE_EVENT_TYPES.includes(e.event_type)) ?? null;
  const parcelId = event?.parcel_id || recordId;
  const recon = reconByParcel.get(parcelId) ?? null;
  if (!recon) return { found: false, requestedId: recordId };

  const parcelEvents = events.filter((e) => e.parcel_id === parcelId && GOVERNANCE_EVENT_TYPES.includes(e.event_type));
  const sourceObservations = (layer.tables.sourceObservations ?? []).filter((o) => recon.matchedSourceIds?.includes(o.observation_id));
  const conflicts = (layer.tables.conflicts ?? []).filter((c) => c.canonical_parcel_id === parcelId);
  const conflictEvidence = (layer.tables.conflictEvidence ?? []).filter((ce) => conflicts.some((c) => c.conflict_id === ce.conflict_id));
  const canonical = (layer.tables.canonicalParcels ?? []).find((p) => p.canonical_parcel_id === parcelId) ?? null;
  const historical = (layer.tables.historicalParcels ?? []).find((p) => p.canonical_parcel_id === parcelId) ?? null;
  const geometryVersions = (layer.tables.geometryVersions ?? []).filter((g) => g.canonical_parcel_id === parcelId);

  return {
    found: true,
    requestedId: recordId,
    parcelId,
    selectedEvent: event,
    governanceEvents: parcelEvents,
    systemInference: {
      matchStatus: recon.match_status,
      criticalityLevel: recon.criticality_level,
      criticalityReason: recon.criticality_reason,
      requiresHumanReview: Boolean(recon.requiresHumanReview),
      unresolvedConflictIds: recon.unresolvedConflictIds ?? [],
      confidence: {
        overallMatch: numberOrNull(recon.overallMatchConfidence),
        geometry: numberOrNull(recon.geometryConfidence),
        ownership: numberOrNull(recon.ownershipConfidence),
        landUse: numberOrNull(recon.landUseConfidence),
        lineage: numberOrNull(recon.lineageConfidence),
        reconciliation: numberOrNull(recon.reconciliationConfidence)
      }
    },
    proposedState: recon.proposedState,
    policyGate: {
      explicitEvents: parcelEvents.map((e) => ({ eventId: e.event_id, eventType: e.event_type, source: e.source, actorType: e.actor_type, reason: e.reason, timestamp: e.timestamp })),
      requiresHumanReview: Boolean(recon.requiresHumanReview),
      matchStatus: recon.match_status
    },
    decision: event ? {
      eventId: event.event_id,
      eventType: event.event_type,
      actorType: event.actor_type || null,
      source: event.source || null,
      reason: event.reason || null,
      timestamp: event.timestamp || null,
      previousVersion: event.previous_version || null,
      resultingVersion: event.resulting_version || null
    } : null,
    authoritativeState: recon.authoritativeState,
    reconciliationTimestamp: recon.reconciliation_timestamp || null,
    evidence: {
      sourceObservationIds: sourceObservations.map((o) => o.observation_id),
      sourceCount: sourceObservations.length,
      conflictIds: conflicts.map((c) => c.conflict_id),
      openConflictIds: conflicts.filter((c) => c.status === 'OPEN').map((c) => c.conflict_id),
      conflictEvidenceCount: conflictEvidence.length
    },
    registry: { canonical, historical },
    geometryAuthority: geometryVersions.map((g) => ({ geometryId: g.geometry_id, geometryStatus: g.geometry_status, acceptedStatus: g.accepted_status, effectiveDate: g.effective_date }))
  };
}

const authorityReviewModelCache = new WeakMap();
export function buildAuthorityReviewModel(layer) {
  if (authorityReviewModelCache.has(layer)) return authorityReviewModelCache.get(layer);
  const value = buildAuthorityReviewModelUncached(layer);
  authorityReviewModelCache.set(layer, value);
  return value;
}

const authorityInspectionCache = new WeakMap();
export function buildAuthorityInspectionModel(layer, recordId) {
  let byId = authorityInspectionCache.get(layer);
  if (!byId) { byId = new Map(); authorityInspectionCache.set(layer, byId); }
  if (!byId.has(recordId)) byId.set(recordId, buildAuthorityInspectionModelUncached(layer, recordId));
  return byId.get(recordId);
}
