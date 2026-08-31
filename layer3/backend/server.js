import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_DIR = path.resolve(__dirname, '../../dataset');

app.use(cors());
app.use(express.json());

function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0];
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

function readCsv(filename) {
  const filePath = path.join(DATASET_DIR, filename);
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATASET_DIR, filename), 'utf8'));
}


function unwrapOuterParentheses(value) {
  const text = String(value || '').trim();
  if (!text.startsWith('(') || !text.endsWith(')')) return text;

  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;

    if (depth === 0 && index < text.length - 1) {
      return text;
    }
  }

  return text.slice(1, -1).trim();
}

function splitTopLevelGroups(value) {
  const text = String(value || '');
  const groups = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;

    if (char === ',' && depth === 0) {
      groups.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  groups.push(text.slice(start).trim());
  return groups.filter(Boolean);
}

function parseCoordinateSequence(value) {
  return String(value || '')
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter(
      (coordinate) =>
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    )
    .map(([x, y]) => [x, y]);
}

function parseWktGeometry(value) {
  const source = String(value || '')
    .trim()
    .replace(/^SRID=\d+;/i, '');

  if (!source || /\bEMPTY\s*$/i.test(source)) return null;

  const match = source.match(/^(POLYGON|MULTIPOLYGON)\s*(.*)$/i);
  if (!match) return null;

  const geometryType = match[1].toUpperCase();
  const body = match[2].trim();

  if (geometryType === 'POLYGON') {
    const polygonBody = unwrapOuterParentheses(body);
    const rings = splitTopLevelGroups(polygonBody)
      .map((ring) => parseCoordinateSequence(unwrapOuterParentheses(ring)))
      .filter((ring) => ring.length >= 3);

    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }

  const multiPolygonBody = unwrapOuterParentheses(body);
  const polygons = splitTopLevelGroups(multiPolygonBody)
    .map((polygon) => {
      const polygonBody = unwrapOuterParentheses(polygon);
      return splitTopLevelGroups(polygonBody)
        .map((ring) => parseCoordinateSequence(unwrapOuterParentheses(ring)))
        .filter((ring) => ring.length >= 3);
    })
    .filter((polygon) => polygon.length);

  return polygons.length ? { type: 'MultiPolygon', coordinates: polygons } : null;
}

function asNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asPercent(value) {
  const number = asNumber(value);
  if (number === null) return null;
  return Math.round(number <= 1 ? number * 100 : number);
}

function yesNo(value) {
  if (!value) return 'Not stated';
  return value;
}

const DATA = {
  revenue: readCsv('01_revenue_land_records_2025.csv'),
  registration: readCsv('02_registration_stamps_2025.csv'),
  survey: readCsv('03_survey_data_2025.csv'),
  ulb: readCsv('04_mcd_ulb_2025.csv'),
  planning: readCsv('05_dda_planning_2025.csv'),
  parcelsGeoJSON: readJson('06_parcels_2025.geojson'),
  conflicts: readCsv('07_conflicts_2025.csv'),
  recommendations: readCsv('08_reconciliation_recommendations_2025.csv'),
  history: readCsv('09_timeline_history_2012_2025.csv'),
  sourceQuality: readCsv('11_source_quality.csv'),
};

const auditsByParcel = new Map();
const stateByParcel = new Map();

function findBy(rows, field, value) {
  return rows.find((row) => row[field] === value) || null;
}

function findFeature(identifier) {
  return (
    DATA.parcelsGeoJSON.features.find((feature) => {
      const props = feature.properties || {};
      return props.parcel_id === identifier || props.canonical_id === identifier;
    }) || null
  );
}

function sourceCoverage(sourceName) {
  const row = DATA.sourceQuality.find((item) => item.source === sourceName);
  if (!row) return null;

  const records = asNumber(row.records);
  const verified = asNumber(row.field_verified_or_doc_verified);

  return {
    records,
    verified,
    coveragePct: asNumber(row.coverage_pct),
    verifiedPct:
      records && verified !== null ? Math.round((verified / records) * 100) : null,
  };
}

const ASSIGNMENT_STAGES = new Set([
  'Unassigned',
  'Desk Review',
  'Reconciliation',
  'Field Review',
  'Senior Review',
  'Completed',
]);

function defaultAssigneeForStage(stage) {
  const defaults = {
    'Desk Review': 'Desk Review Team',
    Reconciliation: 'Reconciliation Officer',
    'Field Review': 'Field Review Team',
    'Senior Review': 'Senior Review Team',
    Completed: 'Authorised Reviewer',
  };
  return defaults[stage] || null;
}

function getCaseState(parcelId, conflict, recommendation) {
  if (!stateByParcel.has(parcelId)) {
    const requiresFieldReview = String(conflict?.severity || '').toLowerCase() === 'critical';
    const datasetAssignee = conflict?.assignee || conflict?.reviewer || null;
    const assignmentStage = requiresFieldReview
      ? 'Field Review'
      : datasetAssignee
      ? 'Desk Review'
      : 'Unassigned';

    stateByParcel.set(parcelId, {
      status: requiresFieldReview ? 'Escalated' : (conflict?.review_status || null),
      resolutionAction: recommendation?.suggested_canonical_value_or_action || '',
      assignmentStage,
      assignee:
        datasetAssignee ||
        (requiresFieldReview ? defaultAssigneeForStage('Field Review') : null),
      lastDecision: null,
      decisionSummary: null,
      decisionAt: null,
    });
  }
  return stateByParcel.get(parcelId);
}

function buildEvidence({ revenue, registration, survey, ulb, planning }) {
  return [
    {
      source: 'Revenue / Land Record',
      recordId: revenue?.revenue_record_id || null,
      date: revenue?.mutation_date || revenue?.record_year || null,
      verified: yesNo(revenue?.field_verified),
      detail: revenue
        ? `${revenue.land_owner || 'Owner not recorded'} · ${revenue.recorded_area_sqm || '—'} m² · ${revenue.plot_name || revenue.survey_no || 'No parcel label'}`
        : 'No matching Revenue record.',
    },
    {
      source: 'Registration & Stamps',
      recordId: registration?.registration_id || null,
      date: registration?.registration_date || registration?.record_year || null,
      verified: yesNo(registration?.document_verified),
      detail: registration
        ? `${registration.buyer_name || 'Buyer not recorded'} · ${registration.deed_type || 'Document'} · ${registration.transaction_area_sqm || '—'} m²`
        : 'No matching Registration record.',
    },
    {
      source: 'Survey',
      recordId: survey?.survey_record_id || null,
      date: survey?.survey_date || null,
      verified: yesNo(survey?.field_verified),
      detail: survey
        ? `${survey.recorded_person || 'Person not recorded'}${survey.person_role ? ` (${survey.person_role})` : ''} · ${survey.measured_area_sqm || '—'} m² · ${survey.coordinate_system || 'CRS not stated'}`
        : 'No matching Survey record.',
    },
    {
      source: 'Urban Local Body — MCD',
      recordId: ulb?.mcd_property_id || null,
      date: ulb?.assessment_year || null,
      verified: yesNo(ulb?.field_verified),
      detail: ulb
        ? `${ulb.primary_holder || 'Holder not recorded'}${ulb.holder_role ? ` (${ulb.holder_role})` : ''} · ${ulb.plot_area_sqm || '—'} m² · mutation ${ulb.mutation_status || 'not stated'}`
        : 'No matching MCD record.',
    },
    {
      source: 'Urban Planning — DDA',
      recordId: planning?.dda_planning_id || null,
      date: planning?.plan_year || null,
      verified: planning?.approval_status || 'Not stated',
      detail: planning
        ? `${planning.land_use_zone || 'Land use not stated'} · ${planning.planning_zone || 'Zone not stated'} · ${planning.approval_status || 'Approval not stated'}`
        : 'No matching DDA record.',
    },
  ];
}

function buildWorkspace(identifier) {
  const feature = findFeature(identifier);
  if (!feature) return null;

  const props = feature.properties || {};
  const parcelId = props.parcel_id;

  const revenue = findBy(DATA.revenue, 'parcel_id', parcelId);
  const registration = findBy(DATA.registration, 'parcel_id_ref', parcelId);
  const survey = findBy(DATA.survey, 'parcel_id', parcelId);
  const ulb = findBy(DATA.ulb, 'parcel_id_ref', parcelId);
  const planning = findBy(DATA.planning, 'parcel_id_ref', parcelId);
  const conflict = findBy(DATA.conflicts, 'parcel_id', parcelId);
  const recommendation = findBy(DATA.recommendations, 'parcel_id', parcelId);
  const state = getCaseState(parcelId, conflict, recommendation);
  const sourceSet = [
    ['Revenue / Land Record', revenue],
    ['Registration & Stamps', registration],
    ['Survey', survey],
    ['Urban Local Body — MCD', ulb],
    ['Urban Planning — DDA', planning],
  ]
    .filter(([, record]) => Boolean(record))
    .map(([source]) => source);

  const revenueCoverage = sourceCoverage('Revenue / Land Record');
  const registrationCoverage = sourceCoverage('Registration & Stamps');
  const surveyCoverage = sourceCoverage('Survey');
  const ulbCoverage = sourceCoverage('Urban Local Body — MCD');
  const planningCoverage = sourceCoverage('Urban Planning — DDA');

  const timeline = DATA.history
    .filter((row) => row.parcel_id === parcelId)
    .sort((a, b) => Number(b.year) - Number(a.year))
    .map((row) => ({
      year: asNumber(row.year),
      type: row.event_type,
      parcelName: row.parcel_name,
      person: row.owner_or_recorded_person,
      area: asNumber(row.area_sqm),
      verification: row.verification_state,
      coordinateSystem: row.coordinate_system,
      description: row.event_note,
    }));

  return {
    id: parcelId,
    canonicalId: props.canonical_id,
    locality: props.address,
    recordYear: props.record_year,
    reviewer: state.assignee || conflict?.reviewer || null,
    assignmentStage: state.assignmentStage || (state.assignee ? 'Desk Review' : 'Unassigned'),
    status: state.status,
    severity: conflict?.severity || props.severity || null,
    conflictType: conflict?.conflict_type || props.primary_conflict_type || null,
    sourcesChecked: sourceSet.length,
    sourceSet,
    conflict: conflict
      ? {
          id: parcelId,
          sourceConflictId: conflict.conflict_id || null,
          type: conflict.conflict_type,
          confidence: asPercent(conflict.confidence),
          sourceA: conflict.source_a,
          observedA: conflict.observed_a,
          sourceB: conflict.source_b,
          observedB: conflict.observed_b,
          summary: conflict.issue_summary,
          timelineAvailable: conflict.timeline_available === 'Yes',
          reviewStatus: conflict.review_status,
        }
      : null,
    canonical: {
      parcelName: props.parcel_name,
      owner: props.current_owner,
      area: asNumber(props.area_sqm),
      address: props.address,
      geometry: feature.geometry || null,
      confidence: asPercent(props.confidence),
      harmonizationStatus: props.harmonization_status,
      reviewAction: props.review_action,
    },
    revenue: {
      recordId: revenue?.revenue_record_id || null,
      owner: revenue?.land_owner || null,
      area: asNumber(revenue?.recorded_area_sqm),
      parcelName: revenue?.plot_name || null,
      surveyNo: revenue?.survey_no || null,
      updatedAt: revenue?.mutation_date || null,
      fieldVerified: revenue?.field_verified || null,
      dataQuality: revenue?.data_quality || null,
      coverage: revenueCoverage,
    },
    registration: {
      recordId: registration?.registration_id || null,
      seller: registration?.seller_name || null,
      buyer: registration?.buyer_name || null,
      area: asNumber(registration?.transaction_area_sqm),
      parcelReference: registration?.parcel_reference || null,
      address: registration?.registered_address || null,
      date: registration?.registration_date || null,
      deedType: registration?.deed_type || null,
      deedNo: registration?.deed_no || null,
      verified: registration?.document_verified || null,
      coverage: registrationCoverage,
    },
    survey: {
      recordId: survey?.survey_record_id || null,
      recordedPerson: survey?.recorded_person || null,
      personRole: survey?.person_role || null,
      area: asNumber(survey?.measured_area_sqm),
      parcelName: survey?.parcel_label || null,
      surveyNo: survey?.survey_no || null,
      date: survey?.survey_date || null,
      method: survey?.survey_method || null,
      coordinateSystem: survey?.coordinate_system || null,
      fieldVerified: survey?.field_verified || null,
      dataQuality: survey?.data_quality || null,
      topologyStatus: survey?.topology_status || null,
      geometry: parseWktGeometry(survey?.display_geometry_wkt_epsg4326),
      coverage: surveyCoverage,
    },
    ulb: {
      recordId: ulb?.mcd_property_id || null,
      holder: ulb?.primary_holder || null,
      role: ulb?.holder_role || null,
      area: asNumber(ulb?.plot_area_sqm),
      address: ulb?.property_address || null,
      mutationStatus: ulb?.mutation_status || null,
      assessmentYear: ulb?.assessment_year || null,
      fieldVerified: ulb?.field_verified || null,
      coverage: ulbCoverage,
    },
    planning: {
      recordId: planning?.dda_planning_id || null,
      zone: planning?.planning_zone || null,
      address: planning?.planning_address || null,
      landUse: planning?.land_use_zone || null,
      approvalStatus: planning?.approval_status || null,
      planYear: planning?.plan_year || null,
      coverage: planningCoverage,
    },
    recommendation: {
      id: recommendation?.recommendation_id || null,
      action: state.resolutionAction || recommendation?.suggested_canonical_value_or_action || null,
      originalAction: recommendation?.suggested_canonical_value_or_action || null,
      confidence: asPercent(recommendation?.recommendation_confidence ?? conflict?.confidence),
      authorityBasis: recommendation?.authority_basis || '',
      automationLevel: recommendation?.automation_level || '',
      humanAction: recommendation?.human_action_required || '',
      decisionStatus: recommendation?.decision_status || null,
      explanation: recommendation?.explanation || conflict?.issue_summary || '',
      evidence: buildEvidence({ revenue, registration, survey, ulb, planning }),
    },
    timeline,
  };
}

function resolveParcel(identifier) {
  const feature = findFeature(identifier);
  return feature?.properties?.parcel_id || null;
}


function normalizeConflictCategory(value) {
  const text = String(value || '').toLowerCase();

  if (
    text.includes('topology') ||
    text.includes('overlap') ||
    text.includes('gap') ||
    text.includes('sliver')
  ) {
    return 'Topology';
  }

  if (
    text.includes('owner') ||
    text.includes('person') ||
    text.includes('holder')
  ) {
    return 'Owner';
  }

  if (text.includes('area')) {
    return 'Area';
  }

  // Geometry, CRS, parcel split/merge and parcel-label mismatches are
  // routed to the spatial/boundary review queue in this screen.
  return 'Boundary';
}

function normalizeQueueStatus(value) {
  const text = String(value || '').toLowerCase();

  if (text.includes('escalat')) return 'Escalated';
  if (
    text.includes('resolv') ||
    text.includes('reconcil') ||
    text.includes('accept') ||
    text.includes('closed')
  ) {
    return 'Resolved';
  }
  if (text.includes('suggest')) return 'Suggested';
  if (text.includes('progress') || text.includes('assigned')) return 'In Progress';
  return 'Review';
}

function buildConflictQueueItem(conflict) {
  const parcelId = conflict.parcel_id;
  const feature = findFeature(parcelId);
  const props = feature?.properties || {};
  const survey = findBy(DATA.survey, 'parcel_id', parcelId);
  const recommendation = findBy(DATA.recommendations, 'parcel_id', parcelId);
  const state = getCaseState(parcelId, conflict, recommendation);

  return {
    // Deliberately use the parcel ID as the case/conflict ID so Layer 4 and
    // Layer 3 always navigate with exactly the same identifier.
    id: parcelId,
    parcelId,
    sourceConflictId: conflict.conflict_id || null,
    conflict: normalizeConflictCategory(conflict.conflict_type),
    rawConflictType: conflict.conflict_type || null,
    severity: conflict.severity || props.severity || null,
    confidence: asPercent(conflict.confidence ?? props.confidence),
    status: normalizeQueueStatus(state.status),
    ageHours: asNumber(conflict.queue_age_hours),
    locality: props.address || null,
    ward: props.ward || props.ward_no || props.planning_zone || null,
    assignee: state.assignee,
    assignmentStage: state.assignmentStage || (state.assignee ? 'Desk Review' : 'Unassigned'),
    sources: [conflict.source_a, conflict.source_b].filter(Boolean),
    reason: conflict.issue_summary || null,
    currentValue: conflict.observed_a || null,
    competingValue: conflict.observed_b || null,
    recommendation: state.resolutionAction || recommendation?.suggested_canonical_value_or_action || null,
    updatedAt: state.decisionAt || conflict.updated_at || recommendation?.updated_at || null,
    lastDecision: state.lastDecision,
    decisionSummary: state.decisionSummary,
    geometry: {
      canonical: feature?.geometry || null,
      survey: parseWktGeometry(survey?.display_geometry_wkt_epsg4326),
    },
  };
}

app.get('/api/conflicts', (_req, res) => {
  const items = DATA.conflicts
    .map(buildConflictQueueItem)
    .filter((item) => item.id);

  res.json({
    items,
    total: items.length,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'reconciliation-workspace-api',
    datasetDirectory: DATASET_DIR,
    parcels: DATA.parcelsGeoJSON.features.length,
  });
});

app.get('/api/parcels/:parcelId/reconciliation', (req, res) => {
  const workspace = buildWorkspace(req.params.parcelId);
  if (!workspace) return res.status(404).json({ error: 'Parcel not found' });
  return res.json(workspace);
});

app.get('/api/parcels/:parcelId/audit', (req, res) => {
  const parcelId = resolveParcel(req.params.parcelId);
  if (!parcelId) return res.status(404).json({ error: 'Parcel not found' });
  return res.json({ items: auditsByParcel.get(parcelId) || [] });
});

app.patch('/api/parcels/:parcelId/assignment', (req, res) => {
  const parcelId = resolveParcel(req.params.parcelId);
  if (!parcelId) return res.status(404).json({ error: 'Parcel not found' });

  const conflict = findBy(DATA.conflicts, 'parcel_id', parcelId);
  const recommendation = findBy(DATA.recommendations, 'parcel_id', parcelId);
  const state = getCaseState(parcelId, conflict, recommendation);
  const requestedStage = String(req.body?.assignmentStage || state.assignmentStage || 'Unassigned').trim();

  if (!ASSIGNMENT_STAGES.has(requestedStage)) {
    return res.status(400).json({ error: 'Unsupported assignment stage' });
  }

  const requestedAssignee = String(req.body?.assignee || '').trim();
  state.assignmentStage = requestedStage;
  state.assignee =
    requestedStage === 'Unassigned'
      ? null
      : requestedAssignee || defaultAssigneeForStage(requestedStage);

  return res.json({
    message:
      requestedStage === 'Unassigned'
        ? `Returned ${parcelId} to the unassigned queue.`
        : `Routed ${parcelId} to ${requestedStage}${state.assignee ? ` (${state.assignee})` : ''}.`,
    item: buildConflictQueueItem(conflict),
  });
});

app.post('/api/parcels/:parcelId/decisions', (req, res) => {
  const parcelId = resolveParcel(req.params.parcelId);
  if (!parcelId) return res.status(404).json({ error: 'Parcel not found' });

  const feature = findFeature(parcelId);
  const conflict = findBy(DATA.conflicts, 'parcel_id', parcelId);
  const recommendation = findBy(DATA.recommendations, 'parcel_id', parcelId);
  const state = getCaseState(parcelId, conflict, recommendation);

  const {
    decision,
    reviewer,
    note = '',
    resolutionAction = '',
  } = req.body || {};

  const allowed = new Set(['ACCEPT', 'MODIFY', 'REJECT', 'ESCALATE']);
  if (!allowed.has(decision)) {
    return res.status(400).json({ error: 'Unsupported decision' });
  }

  const trimmedNote = String(note).trim();
  const trimmedAction = String(resolutionAction).trim();
  const reviewerName = reviewer ? String(reviewer).trim() : null;

  if ((decision === 'REJECT' || decision === 'ESCALATE') && !trimmedNote) {
    return res.status(400).json({ error: 'A reviewer note is required for this decision' });
  }

  if (decision === 'MODIFY' && !trimmedAction) {
    return res.status(400).json({ error: 'A modified resolution action is required' });
  }

  let summary;
  let message;

  if (decision === 'ACCEPT') {
    state.status = 'Reconciled';
    state.assignmentStage = 'Completed';
    state.assignee = reviewerName || state.assignee || defaultAssigneeForStage('Completed');
    state.resolutionAction = recommendation?.suggested_canonical_value_or_action || state.resolutionAction;
    summary = `Accepted recommendation: ${state.resolutionAction}`;
    message = 'Recommendation accepted and audit event recorded.';
  } else if (decision === 'MODIFY') {
    state.status = 'Reconciled';
    state.assignmentStage = 'Completed';
    state.assignee = reviewerName || state.assignee || defaultAssigneeForStage('Completed');
    state.resolutionAction = trimmedAction;
    summary = `Modified reviewer resolution: ${trimmedAction}${trimmedNote ? ` Reason: ${trimmedNote}` : ''}`;
    message = 'Modified reconciliation recorded.';
  } else if (decision === 'REJECT') {
    state.status = 'Rejected';
    state.assignmentStage = 'Desk Review';
    state.assignee = reviewerName || defaultAssigneeForStage('Desk Review');
    summary = `Recommendation rejected. Reason: ${trimmedNote}`;
    message = 'Recommendation rejected and rationale recorded.';
  } else {
    state.status = 'Escalated';
    state.assignmentStage = 'Senior Review';
    state.assignee = defaultAssigneeForStage('Senior Review');
    summary = `Case escalated for additional authorised review. Next step: ${trimmedNote}`;
    message = 'Case escalated for further verification.';
  }

  state.lastDecision = decision;
  state.decisionSummary = summary;
  state.decisionAt = new Date().toISOString();

  const auditItem = {
    id: crypto.randomUUID(),
    action: decision,
    summary,
    reviewer: reviewerName,
    timestamp: state.decisionAt,
    conflictId: parcelId,
    sourceConflictId: conflict?.conflict_id || null,
    canonicalId: feature?.properties?.canonical_id || null,
  };

  const audit = [auditItem, ...(auditsByParcel.get(parcelId) || [])];
  auditsByParcel.set(parcelId, audit);

  return res.status(201).json({
    message,
    workspace: buildWorkspace(parcelId),
    audit,
  });
});

app.listen(PORT, () => {
  console.log(`Reconciliation API listening on http://localhost:${PORT}`);
  console.log(`Dataset: ${DATASET_DIR}`);
});
