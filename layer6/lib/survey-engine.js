const {
  polygonFromLatLngPoints,
  safeArea,
  geometrySimilarity,
  maxBoundaryDifferenceMeters,
  directionFromCentroid,
  coordinatePrecisionMeters,
  geometryVertexCount
} = require('./geometry');

function mean(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function percentDelta(reference, field) {
  if (!reference || !field) return null;
  return ((reference - field) / field) * 100;
}

function boolSignal(value) {
  if (value === true || value === 'true' || value === 'yes' || value === 'YES') return 1;
  if (value === false || value === 'false' || value === 'no' || value === 'NO') return 0;
  return null;
}

function deriveGnssProfile(parcel) {
  const geoms = Object.values(parcel.geometries || {}).filter(Boolean);
  const precisionMeters = mean(geoms.map(coordinatePrecisionMeters));
  const vertexCount = geoms.reduce((sum, g) => sum + geometryVertexCount(g), 0);
  const sourceCount = Array.isArray(parcel.sources) ? parcel.sources.length : 0;
  return {
    method: 'SIMULATED_RTK',
    accuracyMeters: precisionMeters,
    signalCount: vertexCount + sourceCount,
    correctionSource: parcel.sources?.join(', ') || null
  };
}

function comparison(parcel, surveyState) {
  const field = polygonFromLatLngPoints(surveyState.points || []);
  if (!field) return { fieldGeometry: null };
  const fieldArea = safeArea(field);
  const surveyGeom = parcel.geometries?.survey || null;
  const revenueGeom = parcel.geometries?.revenue || null;
  const canonicalGeom = parcel.geometries?.canonical || null;
  const surveyArea = safeArea(surveyGeom);
  const revenueArea = safeArea(revenueGeom);
  const canonicalArea = safeArea(canonicalGeom);
  const surveySimilarity = geometrySimilarity(surveyGeom, field);
  const revenueSimilarity = geometrySimilarity(revenueGeom, field);
  const canonicalSimilarity = geometrySimilarity(canonicalGeom, field);

  const candidates = [
    { source: 'Survey', geometry: surveyGeom, similarity: surveySimilarity },
    { source: 'Revenue', geometry: revenueGeom, similarity: revenueSimilarity },
    { source: 'Canonical', geometry: canonicalGeom, similarity: canonicalSimilarity }
  ].filter((x) => x.geometry && x.similarity !== null);
  candidates.sort((a, b) => b.similarity - a.similarity);
  const preferred = candidates[0] || null;

  const deviationCandidates = [
    { source: 'Revenue', geometry: revenueGeom },
    { source: 'Survey', geometry: surveyGeom }
  ].filter((x) => x.geometry).map((item) => {
    const diff = maxBoundaryDifferenceMeters(item.geometry, field);
    return diff ? { ...item, ...diff, direction: directionFromCentroid(field, diff.coordinate) } : null;
  }).filter(Boolean).sort((a, b) => b.meters - a.meters);

  return {
    fieldGeometry: field,
    fieldAreaSqm: fieldArea,
    surveyAreaSqm: surveyArea,
    revenueAreaSqm: revenueArea,
    canonicalAreaSqm: canonicalArea,
    surveyAreaDeltaPct: percentDelta(surveyArea, fieldArea),
    revenueAreaDeltaPct: percentDelta(revenueArea, fieldArea),
    canonicalAreaDeltaPct: percentDelta(canonicalArea, fieldArea),
    surveySimilarity,
    revenueSimilarity,
    canonicalSimilarity,
    preferredSource: preferred?.source || null,
    largestBoundaryDifference: deviationCandidates[0] ? {
      source: deviationCandidates[0].source,
      meters: deviationCandidates[0].meters,
      direction: deviationCandidates[0].direction
    } : null
  };
}

function updatedConfidence(parcel, surveyState, comp) {
  const signals = [];
  if (typeof parcel.confidence === 'number') signals.push(parcel.confidence);
  for (const value of [comp.surveySimilarity, comp.revenueSimilarity, comp.canonicalSimilarity]) {
    if (typeof value === 'number') signals.push(value);
  }
  const verification = surveyState.verification || {};
  for (const field of ['ownerPresent', 'neighbourPresent', 'physicalMarkerFound', 'buildingMatchesMap']) {
    const signal = boolSignal(verification[field]);
    if (signal !== null) signals.push(signal);
  }
  if (verification.boundaryAcknowledgement) {
    const text = String(verification.boundaryAcknowledgement).toLowerCase();
    if (text === 'confirmed') signals.push(1);
    if (text === 'disputed') signals.push(0);
  }
  return mean(signals);
}

function findings(parcel, surveyState, comp) {
  const out = [];
  if (comp.surveySimilarity !== null) out.push({ type: 'geometry', source: 'Survey', similarity: comp.surveySimilarity });
  if (comp.revenueSimilarity !== null) out.push({ type: 'geometry', source: 'Revenue', similarity: comp.revenueSimilarity });
  const v = surveyState.verification || {};
  if (v.ownerPresent !== undefined && v.ownerPresent !== null) out.push({ type: 'owner_presence', value: boolSignal(v.ownerPresent) });
  if (v.physicalMarkerFound !== undefined && v.physicalMarkerFound !== null) out.push({ type: 'marker', value: boolSignal(v.physicalMarkerFound) });
  if (v.boundaryAcknowledgement) out.push({ type: 'boundary_acknowledgement', value: v.boundaryAcknowledgement });
  return out;
}

function recommendation(parcel, surveyState, comp) {
  const preferred = comp.preferredSource;
  const diff = comp.largestBoundaryDifference;
  if (!preferred) return {
    code: 'FIELD_EVIDENCE_REVIEW',
    title: 'Review field evidence against available parcel records',
    detail: 'No comparable departmental polygon was available for a geometry preference.'
  };
  if (preferred === 'Survey') {
    return {
      code: 'SURVEY_GEOMETRY_PREFERRED',
      title: 'Use Survey geometry as preferred evidence',
      detail: diff ? `Send the ${diff.source} boundary discrepancy for reconciliation.` : 'Submit the field-verified Survey geometry to reconciliation.'
    };
  }
  if (preferred === 'Revenue') {
    return {
      code: 'REVENUE_GEOMETRY_PREFERRED',
      title: 'Use Revenue geometry as preferred evidence',
      detail: diff ? `Send the ${diff.source} boundary discrepancy for reconciliation.` : 'Submit the field-verified Revenue geometry to reconciliation.'
    };
  }
  return {
    code: 'CANONICAL_GEOMETRY_SUPPORTED',
    title: 'Field evidence supports the current canonical geometry',
    detail: diff ? `Retain the canonical geometry and reconcile the ${diff.source} boundary discrepancy.` : 'Record field verification against the canonical parcel version.'
  };
}

function buildReport(parcel, surveyState) {
  const comp = comparison(parcel, surveyState);
  const nextConfidence = updatedConfidence(parcel, surveyState, comp);
  return {
    parcelId: parcel.parcelId,
    surveyStatus: surveyState.status,
    fieldVerification: surveyState.verification ? 'VERIFIED' : 'NOT_RECORDED',
    capturedBoundaryPoints: Array.isArray(surveyState.points) ? surveyState.points.length : 0,
    fieldAreaSqm: comp.fieldAreaSqm,
    existingConfidence: parcel.confidence,
    updatedConfidence: nextConfidence,
    findings: findings(parcel, surveyState, comp),
    recommendation: recommendation(parcel, surveyState, comp),
    comparison: comp
  };
}

module.exports = { deriveGnssProfile, comparison, buildReport, updatedConfidence };
