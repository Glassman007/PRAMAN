const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { DatasetRepository } = require('./lib/dataset');
const { SurveyStore } = require('./lib/survey-store');
const { deriveGnssProfile, comparison, buildReport } = require('./lib/survey-engine');

const app = express();
const PORT = Number(process.env.PORT || 3606);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATASET_DIR = path.resolve(process.env.DATASET_DIR || path.join(PROJECT_ROOT, 'dataset'));
const SURVEY_DATA_DIR = path.resolve(process.env.SURVEY_DATA_DIR || path.join(PROJECT_ROOT, 'SurveyData'));

const dataset = new DatasetRepository(DATASET_DIR);
const store = new SurveyStore(SURVEY_DATA_DIR);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const allowedStates = new Set([
  'NOT_REQUESTED', 'REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REQUIRES_RESURVEY', 'ESCALATED'
]);

function assertParcel(req, res, next) {
  try {
    const parcel = dataset.get(req.params.parcelId);
    if (!parcel) return res.status(404).json({ error: 'Parcel not found in shared dataset.' });
    req.parcel = parcel;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message, code: error.code || 'DATASET_ERROR' });
  }
}

function stateFor(parcel) {
  const saved = store.get(parcel.parcelId);
  return saved || {
    parcelId: parcel.parcelId,
    status: allowedStates.has(String(parcel.datasetStatus || '').toUpperCase()) ? String(parcel.datasetStatus).toUpperCase() : 'NOT_REQUESTED',
    assignee: parcel.datasetAssignee || null,
    points: [],
    evidence: []
  };
}

function derivePriorities(parcels) {
  const scores = parcels.map((p) => {
    const conflictSignal = p.conflictType ? 1 : 0;
    const confidenceSignal = typeof p.confidence === 'number' ? 1 - p.confidence : 0;
    return { id: p.parcelId, score: conflictSignal + confidenceSignal };
  }).sort((a, b) => a.score - b.score);

  const result = new Map();
  if (!scores.length) return result;
  for (let i = 0; i < scores.length; i += 1) {
    const bucket = Math.min(2, Math.floor((i * 3) / scores.length));
    result.set(scores[i].id, ['Standard', 'Medium', 'High'][bucket]);
  }
  return result;
}

function queueEntry(parcel, priorityMap) {
  const survey = stateFor(parcel);
  return {
    parcelId: parcel.parcelId,
    conflictType: parcel.conflictType,
    confidence: parcel.confidence,
    lastVerifiedDate: parcel.lastVerifiedDate,
    priority: parcel.datasetPriority || priorityMap.get(parcel.parcelId) || null,
    assignee: survey.assignee || null,
    status: survey.status,
    sources: parcel.sources
  };
}

function matchesFilter(entry, filter) {
  switch (filter) {
    case 'never-verified': return !entry.lastVerifiedDate;
    case 'boundary': return entry.conflictType === 'Boundary Conflict';
    case 'ownership': return entry.conflictType === 'Ownership Conflict';
    case 'high-priority': return String(entry.priority || '').toLowerCase() === 'high';
    default: return true;
  }
}

app.get('/api/health', (req, res) => {
  try {
    const parcels = dataset.all();
    res.json({ ok: true, datasetDir: DATASET_DIR, parcelCount: parcels.length, surveyDataDir: SURVEY_DATA_DIR });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, datasetDir: DATASET_DIR });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    layer1Url: process.env.LAYER1_URL || null,
    layer4Url: process.env.LAYER4_URL || null,
    layer3Url: process.env.LAYER3_URL || null
  });
});

app.get('/api/surveys', (req, res) => {
  try {
    const parcels = dataset.all();
    const priorityMap = derivePriorities(parcels);
    const filter = String(req.query.filter || 'all');
    const queue = parcels
      .filter((p) => p.conflictType || !p.lastVerifiedDate || stateFor(p).status !== 'NOT_REQUESTED')
      .map((p) => queueEntry(p, priorityMap))
      .filter((entry) => matchesFilter(entry, filter));
    res.json({ queue, filter });
  } catch (error) {
    res.status(500).json({ error: error.message, code: error.code || 'DATASET_ERROR' });
  }
});

app.get('/api/surveys/:parcelId', assertParcel, (req, res) => {
  const survey = stateFor(req.parcel);
  const comp = comparison(req.parcel, survey);
  res.json({
    parcel: req.parcel,
    survey,
    gnss: deriveGnssProfile(req.parcel),
    comparison: comp,
    report: buildReport(req.parcel, survey)
  });
});

app.post('/api/surveys/:parcelId/request', assertParcel, (req, res) => {
  const current = stateFor(req.parcel);
  const next = store.upsert(req.parcel.parcelId, {
    ...current,
    status: current.assignee ? 'ASSIGNED' : 'REQUESTED',
    requestedAt: new Date().toISOString(),
    requestContext: req.body?.context || null
  });
  store.addEvent({ type: 'FIELD_VERIFICATION_REQUESTED', parcelId: req.parcel.parcelId, at: next.requestedAt });
  res.json(next);
});

app.post('/api/surveys/:parcelId/assign', assertParcel, (req, res) => {
  const assignee = String(req.body?.assignee || '').trim();
  if (!assignee) return res.status(400).json({ error: 'Assignee is required.' });
  const next = store.update(req.parcel.parcelId, (current) => ({
    ...current,
    assignee,
    status: current.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED',
    assignedAt: new Date().toISOString()
  }));
  res.json(next);
});

app.post('/api/surveys/:parcelId/start', assertParcel, (req, res) => {
  const next = store.update(req.parcel.parcelId, (current) => ({
    ...current,
    status: 'IN_PROGRESS',
    startedAt: current.startedAt || new Date().toISOString(),
    points: Array.isArray(current.points) ? current.points : [],
    evidence: Array.isArray(current.evidence) ? current.evidence : []
  }));
  res.json(next);
});

app.post('/api/surveys/:parcelId/position', assertParcel, (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Valid lat and lng are required.' });
  const next = store.update(req.parcel.parcelId, (current) => ({
    ...current,
    currentPosition: { lat, lng, capturedAt: new Date().toISOString(), source: req.body?.source || 'MAP' }
  }));
  res.json(next);
});

app.post('/api/surveys/:parcelId/points', assertParcel, (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Valid lat and lng are required.' });
  const gnss = deriveGnssProfile(req.parcel);
  const next = store.update(req.parcel.parcelId, (current) => {
    const points = Array.isArray(current.points) ? [...current.points] : [];
    points.push({
      lat,
      lng,
      accuracyMeters: Number.isFinite(Number(req.body?.accuracyMeters)) ? Number(req.body.accuracyMeters) : gnss.accuracyMeters,
      method: req.body?.method || gnss.method,
      timestamp: new Date().toISOString()
    });
    return { ...current, status: 'IN_PROGRESS', points, boundaryClosed: false };
  });
  res.json({ survey: next, comparison: comparison(req.parcel, next) });
});

app.post('/api/surveys/:parcelId/points/undo', assertParcel, (req, res) => {
  const next = store.update(req.parcel.parcelId, (current) => ({
    ...current,
    points: Array.isArray(current.points) ? current.points.slice(0, -1) : [],
    boundaryClosed: false
  }));
  res.json({ survey: next, comparison: comparison(req.parcel, next) });
});

app.post('/api/surveys/:parcelId/close', assertParcel, (req, res) => {
  const current = stateFor(req.parcel);
  if (!Array.isArray(current.points) || current.points.length < 3) return res.status(400).json({ error: 'At least three captured points are required to close the boundary.' });
  const next = store.upsert(req.parcel.parcelId, { ...current, boundaryClosed: true, boundaryClosedAt: new Date().toISOString() });
  res.json({ survey: next, comparison: comparison(req.parcel, next) });
});

app.post('/api/surveys/:parcelId/reset', assertParcel, (req, res) => {
  const next = store.update(req.parcel.parcelId, (current) => ({
    ...current,
    points: [],
    boundaryClosed: false,
    currentPosition: null,
    verification: null,
    report: null
  }));
  res.json({ survey: next, comparison: comparison(req.parcel, next) });
});

app.post('/api/surveys/:parcelId/verification', assertParcel, (req, res) => {
  const verification = {
    ownerPresent: req.body?.ownerPresent ?? null,
    ownerName: req.body?.ownerName || null,
    neighbourPresent: req.body?.neighbourPresent ?? null,
    boundaryAcknowledgement: req.body?.boundaryAcknowledgement || null,
    physicalMarkerFound: req.body?.physicalMarkerFound ?? null,
    buildingMatchesMap: req.body?.buildingMatchesMap ?? null,
    fieldNotes: req.body?.fieldNotes || null,
    recordedAt: new Date().toISOString()
  };
  const next = store.update(req.parcel.parcelId, (current) => ({ ...current, verification }));
  res.json({ survey: next, comparison: comparison(req.parcel, next), report: buildReport(req.parcel, next) });
});

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      try { cb(null, store.parcelEvidenceDir(req.params.parcelId)); } catch (error) { cb(error); }
    },
    filename(req, file, cb) {
      const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    }
  })
});

app.post('/api/surveys/:parcelId/evidence', assertParcel, upload.array('evidence'), (req, res) => {
  const files = (req.files || []).map((file) => ({
    name: file.originalname,
    storedName: file.filename,
    size: file.size,
    mimetype: file.mimetype,
    relativePath: path.relative(PROJECT_ROOT, file.path),
    uploadedAt: new Date().toISOString()
  }));
  const next = store.update(req.parcel.parcelId, (current) => ({ ...current, evidence: [...(current.evidence || []), ...files] }));
  res.json({ survey: next, uploaded: files });
});

app.post('/api/surveys/:parcelId/complete', assertParcel, (req, res) => {
  const current = stateFor(req.parcel);
  if (!current.boundaryClosed) return res.status(400).json({ error: 'Close the captured boundary before completing the survey.' });
  if (!current.verification) return res.status(400).json({ error: 'Record field verification before completing the survey.' });
  const completed = { ...current, status: 'COMPLETED', completedAt: new Date().toISOString() };
  const report = buildReport(req.parcel, completed);
  const next = store.upsert(req.parcel.parcelId, { ...completed, report });
  store.addEvent({
    type: 'FIELD_SURVEY_COMPLETED',
    parcelId: req.parcel.parcelId,
    at: next.completedAt,
    recommendation: report.recommendation,
    updatedConfidence: report.updatedConfidence
  });
  res.json({ survey: next, report });
});

app.post('/api/surveys/:parcelId/resurvey', assertParcel, (req, res) => {
  const next = store.update(req.parcel.parcelId, (current) => ({ ...current, status: 'REQUIRES_RESURVEY', outcomeAt: new Date().toISOString() }));
  store.addEvent({ type: 'FIELD_RESURVEY_REQUESTED', parcelId: req.parcel.parcelId, at: next.outcomeAt });
  res.json(next);
});

app.post('/api/surveys/:parcelId/escalate', assertParcel, (req, res) => {
  const next = store.update(req.parcel.parcelId, (current) => ({ ...current, status: 'ESCALATED', outcomeAt: new Date().toISOString() }));
  store.addEvent({ type: 'FIELD_SURVEY_ESCALATED', parcelId: req.parcel.parcelId, at: next.outcomeAt });
  res.json(next);
});

app.post('/api/integration/request-field-verification', (req, res) => {
  const parcelId = String(req.body?.parcelId || '').trim();
  if (!parcelId) return res.status(400).json({ error: 'parcelId is required.' });
  req.params.parcelId = parcelId;
  return assertParcel(req, res, () => {
    const current = stateFor(req.parcel);
    const next = store.upsert(parcelId, {
      ...current,
      status: current.assignee ? 'ASSIGNED' : 'REQUESTED',
      requestedAt: new Date().toISOString(),
      requestContext: req.body?.context || null
    });
    store.addEvent({ type: 'FIELD_VERIFICATION_REQUESTED', parcelId, at: next.requestedAt, context: next.requestContext });
    res.json({ survey: next, layer6Path: `/?parcelId=${encodeURIComponent(parcelId)}` });
  });
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Layer 6 Field Survey Console: http://localhost:${PORT}`);
  console.log(`Shared dataset: ${DATASET_DIR}`);
  console.log(`Field evidence store: ${SURVEY_DATA_DIR}`);
});
