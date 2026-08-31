const state = {
  queue: [],
  filter: 'all',
  selectedId: null,
  selected: null,
  config: {},
  map: null,
  layers: {},
  captureMode: false,
  moveMode: false,
  positionMarker: null,
  fieldLayer: null,
  pointMarkers: []
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function fmtPct(v) { return typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'Not available'; }
function fmtArea(v) { return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} m²` : 'Not available'; }
function fmtDelta(v) { return typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : 'Not comparable'; }
function fmtDistance(v) { return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} m` : 'Not available'; }
function fmtDate(v) { if (!v) return 'Never verified'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(); }
function fmtTime(v) { if (!v) return 'Not available'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleTimeString(); }
function valueOrNA(v) { return v === null || v === undefined || v === '' ? 'Not available' : String(v); }

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2800);
}

function showScreen(name) {
  const map = { queue: 'queueScreen', workspace: 'workspaceScreen', verification: 'verificationScreen', report: 'reportScreen' };
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  $(map[name]).classList.add('active');
  $('screenLabel').textContent = ({ queue: 'Survey Queue', workspace: 'Field Survey', verification: 'Evidence & Verification', report: 'Completion Report' })[name];
  if (name === 'workspace' && state.map) setTimeout(() => state.map.invalidateSize(), 50);
}

async function loadHealth() {
  try {
    const health = await api('/api/health');
    $('datasetStatus').textContent = `${health.parcelCount} dataset parcels`;
  } catch (error) {
    $('datasetStatus').textContent = 'Dataset unavailable';
    toast(error.message);
  }
}

async function loadConfig() {
  state.config = await api('/api/config').catch(() => ({}));
}

async function loadQueue() {
  const data = await api(`/api/surveys?filter=${encodeURIComponent(state.filter)}`);
  state.queue = data.queue || [];
  renderQueue();
  renderMiniQueue();
}

function renderQueue() {
  const body = $('queueBody');
  body.innerHTML = state.queue.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.parcelId)}</strong></td>
      <td>${escapeHtml(valueOrNA(row.conflictType))}</td>
      <td class="confidence">${fmtPct(row.confidence)}</td>
      <td>${escapeHtml(fmtDate(row.lastVerifiedDate))}</td>
      <td class="${String(row.priority).toLowerCase() === 'high' ? 'priority-high' : ''}">${escapeHtml(valueOrNA(row.priority))}</td>
      <td>${escapeHtml(row.assignee || 'Unassigned')}</td>
      <td><span class="status-tag">${escapeHtml(row.status)}</span></td>
      <td><button class="mini-button start-row" data-id="${escapeHtml(row.parcelId)}">Start Survey</button></td>
    </tr>`).join('');
  $('queueEmpty').classList.toggle('hidden', state.queue.length > 0);
  $('queueEmpty').textContent = state.queue.length ? '' : 'No parcels match this filter in the shared dataset.';
  document.querySelectorAll('.start-row').forEach((button) => button.addEventListener('click', () => openParcel(button.dataset.id, true)));
}

function renderMiniQueue() {
  $('miniQueue').innerHTML = state.queue.map((row) => `
    <div class="mini-item ${row.parcelId === state.selectedId ? 'active' : ''}" data-id="${escapeHtml(row.parcelId)}">
      <div class="row"><strong>${escapeHtml(row.parcelId)}</strong><span>${fmtPct(row.confidence)}</span></div>
      <small>${escapeHtml(valueOrNA(row.conflictType))} · ${escapeHtml(row.status)}</small>
    </div>`).join('');
  document.querySelectorAll('.mini-item').forEach((el) => el.addEventListener('click', () => openParcel(el.dataset.id, false)));
}

async function openParcel(parcelId, start) {
  state.selectedId = parcelId;
  if (start) await api(`/api/surveys/${encodeURIComponent(parcelId)}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  state.selected = await api(`/api/surveys/${encodeURIComponent(parcelId)}`);
  showScreen('workspace');
  renderWorkspace();
  history.replaceState({}, '', `/?parcelId=${encodeURIComponent(parcelId)}`);
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueOrNA(value))}</strong></div>`;
}

function renderWorkspace() {
  if (!state.selected) return;
  const { parcel, survey, gnss } = state.selected;
  $('workspaceParcel').textContent = parcel.parcelId;
  $('parcelInfo').innerHTML = [
    detailRow('Parcel ID', parcel.parcelId),
    detailRow('Existing owner', parcel.owner),
    detailRow('Address', parcel.address),
    detailRow('Area', fmtArea(parcel.areaSqm)),
    detailRow('Current confidence', fmtPct(parcel.confidence)),
    detailRow('Reason', parcel.conflictType || parcel.conflicts?.join(', ') || 'Field verification required'),
    detailRow('Status', survey.status)
  ].join('');
  const accuracyText = typeof gnss.accuracyMeters === 'number' ? `±${(gnss.accuracyMeters * 100).toFixed(1)} cm` : 'Derived accuracy unavailable';
  $('gnssInfo').innerHTML = `
    <div class="gnss-title">${escapeHtml(gnss.method)}</div>
    ${detailRow('Accuracy', accuracyText)}
    ${detailRow('Signal profile', gnss.signalCount)}
    ${detailRow('Evidence sources', gnss.correctionSource)}
    ${detailRow('Field position', survey.currentPosition ? `${Number(survey.currentPosition.lat).toFixed(6)}, ${Number(survey.currentPosition.lng).toFixed(6)}` : 'Not set')}`;
  $('assigneeInput').value = survey.assignee || '';
  $('capturePosition').classList.toggle('hidden', !survey.currentPosition);
  renderPoints();
  initMap();
  renderMap();
  renderMiniQueue();
}

function pointAccuracy(point) {
  return typeof point.accuracyMeters === 'number' ? `±${(point.accuracyMeters * 100).toFixed(1)} cm` : 'Accuracy unavailable';
}

function renderPoints() {
  const points = state.selected?.survey?.points || [];
  $('pointList').innerHTML = points.length ? points.map((p, i) => `
    <div class="point-card"><strong>Boundary Point ${String(i + 1).padStart(2, '0')}</strong>
      <div>Lat: ${Number(p.lat).toFixed(6)}</div><div>Lng: ${Number(p.lng).toFixed(6)}</div>
      <div>Accuracy: ${escapeHtml(pointAccuracy(p))}</div><div>Method: ${escapeHtml(valueOrNA(p.method))}</div><div>Timestamp: ${escapeHtml(fmtTime(p.timestamp))}</div>
    </div>`).join('') : '<div class="muted">No field boundary points captured.</div>';
}

function initMap() {
  if (state.map) return;
  state.map = L.map('map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.map);
  state.map.on('click', async (event) => {
    if (!state.selectedId) return;
    if (state.moveMode) {
      await setPosition(event.latlng.lat, event.latlng.lng, 'MAP');
      state.moveMode = false;
      $('moveSurveyor').textContent = 'Move Surveyor';
      return;
    }
    if (state.captureMode) await capturePoint(event.latlng.lat, event.latlng.lng);
  });
}

function addGeoJson(feature, options) {
  if (!feature) return null;
  try { return L.geoJSON(feature, { style: options }).addTo(state.map); } catch { return null; }
}

function clearMapLayers() {
  Object.values(state.layers).forEach((layer) => { if (layer) state.map.removeLayer(layer); });
  state.layers = {};
  state.pointMarkers.forEach((m) => state.map.removeLayer(m));
  state.pointMarkers = [];
  if (state.positionMarker) state.map.removeLayer(state.positionMarker);
  state.positionMarker = null;
}

function renderMap() {
  if (!state.map || !state.selected) return;
  clearMapLayers();
  const g = state.selected.parcel.geometries || {};
  state.layers.canonical = addGeoJson(g.canonical, { color: '#f5c542', weight: 3, fillOpacity: .05 });
  state.layers.revenue = addGeoJson(g.revenue, { color: '#ec8b2c', weight: 3, dashArray: '7 5', fillOpacity: .04 });
  state.layers.survey = addGeoJson(g.survey, { color: '#8a7df0', weight: 3, dashArray: '3 5', fillOpacity: .04 });

  const points = state.selected.survey.points || [];
  if (points.length) {
    const latlngs = points.map((p) => [p.lat, p.lng]);
    state.layers.field = L.polyline(latlngs, { color: '#76c893', weight: 4 }).addTo(state.map);
    if (state.selected.survey.boundaryClosed && points.length >= 3) {
      state.map.removeLayer(state.layers.field);
      state.layers.field = L.polygon(latlngs, { color: '#76c893', weight: 4, fillOpacity: .12 }).addTo(state.map);
    }
    state.pointMarkers = points.map((p, i) => L.circleMarker([p.lat, p.lng], { radius: 5, color: '#76c893', fillOpacity: 1 }).bindTooltip(String(i + 1), { permanent: true, direction: 'top' }).addTo(state.map));
  }
  const position = state.selected.survey.currentPosition;
  if (position) state.positionMarker = L.circleMarker([position.lat, position.lng], { radius: 7, color: '#f5f2e9', fillColor: '#08090a', fillOpacity: 1, weight: 3 }).bindTooltip('Surveyor').addTo(state.map);

  const bounds = [];
  Object.values(state.layers).forEach((layer) => { if (layer?.getBounds) { const b = layer.getBounds(); if (b.isValid()) bounds.push(b); } });
  if (state.positionMarker) bounds.push(L.latLngBounds([state.positionMarker.getLatLng()]));
  if (bounds.length) {
    const merged = bounds.reduce((acc, b) => acc.extend(b), bounds[0]);
    state.map.fitBounds(merged.pad(.18));
  } else state.map.fitWorld();
}

async function refreshSelected() {
  state.selected = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}`);
  renderWorkspace();
}

async function capturePoint(lat, lng, accuracyMeters) {
  const payload = { lat, lng };
  if (typeof accuracyMeters === 'number') payload.accuracyMeters = accuracyMeters;
  await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  await refreshSelected();
}

async function setPosition(lat, lng, source, accuracyMeters) {
  await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/position`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lng, source }) });
  state.selected = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}`);
  if (typeof accuracyMeters === 'number') state.selected.survey.currentPosition.accuracyMeters = accuracyMeters;
  renderWorkspace();
}

function fillVerificationForm() {
  const v = state.selected?.survey?.verification || {};
  const form = $('verificationForm');
  for (const [name, value] of Object.entries(v)) {
    if (form.elements[name] && value !== null && value !== undefined) form.elements[name].value = String(value);
  }
  if (!v.ownerName && state.selected?.parcel?.owner) form.elements.ownerName.value = state.selected.parcel.owner;
}

function comparisonMetric(label, value, delta) {
  return `<div class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><em>${escapeHtml(delta || '')}</em></div>`;
}

function renderComparison() {
  const comp = state.selected?.comparison || {};
  let html = '';
  html += comparisonMetric('Field Area', fmtArea(comp.fieldAreaSqm), 'Captured');
  html += comparisonMetric('Survey Record', fmtArea(comp.surveyAreaSqm), fmtDelta(comp.surveyAreaDeltaPct));
  html += comparisonMetric('Revenue Record', fmtArea(comp.revenueAreaSqm), fmtDelta(comp.revenueAreaDeltaPct));
  html += comparisonMetric('Survey ↔ Field', fmtPct(comp.surveySimilarity), 'Geometry similarity');
  html += comparisonMetric('Revenue ↔ Field', fmtPct(comp.revenueSimilarity), 'Geometry similarity');
  if (comp.largestBoundaryDifference) {
    html += `<div class="alert-card">⚠ ${escapeHtml(valueOrNA(comp.largestBoundaryDifference.direction))} boundary differs from ${escapeHtml(comp.largestBoundaryDifference.source)} by ${escapeHtml(fmtDistance(comp.largestBoundaryDifference.meters))}.</div>`;
  }
  $('comparisonContent').innerHTML = html;
}

function renderEvidence() {
  const evidence = state.selected?.survey?.evidence || [];
  $('evidenceList').innerHTML = evidence.length ? evidence.map((e) => `<div class="evidence-item">${escapeHtml(e.name)} · ${escapeHtml(valueOrNA(e.mimetype))}</div>`).join('') : '<div class="muted">No evidence uploaded.</div>';
}

function renderReport() {
  const report = state.selected?.report || {};
  $('reportParcel').textContent = report.parcelId || state.selectedId || '—';
  $('reportStatus').textContent = report.surveyStatus || state.selected?.survey?.status || '—';
  const metrics = [
    ['Parcel', report.parcelId], ['Survey Status', report.surveyStatus], ['Field Verification', report.fieldVerification],
    ['Captured Boundary', `${report.capturedBoundaryPoints ?? 0} points`], ['Field Area', fmtArea(report.fieldAreaSqm)],
    ['Existing Confidence', fmtPct(report.existingConfidence)], ['Updated Confidence', fmtPct(report.updatedConfidence)]
  ];
  $('reportMetrics').innerHTML = metrics.map(([label, value]) => `<div class="report-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueOrNA(value))}</strong></div>`).join('');
  $('reportFindings').innerHTML = (report.findings || []).map((f) => {
    if (f.type === 'geometry') return `<div class="finding">${escapeHtml(f.source)} ↔ field geometry similarity: <strong>${fmtPct(f.similarity)}</strong></div>`;
    if (f.type === 'owner_presence') return `<div class="finding">Owner present: <strong>${f.value === 1 ? 'Yes' : 'No'}</strong></div>`;
    if (f.type === 'marker') return `<div class="finding">Physical boundary marker found: <strong>${f.value === 1 ? 'Yes' : 'No'}</strong></div>`;
    if (f.type === 'boundary_acknowledgement') return `<div class="finding">Boundary acknowledgement: <strong>${escapeHtml(valueOrNA(f.value))}</strong></div>`;
    return '';
  }).join('') || '<div class="finding muted">No findings recorded yet.</div>';
  $('recommendationTitle').textContent = report.recommendation?.title || 'Complete field comparison to generate a recommendation.';
  $('recommendationDetail').textContent = report.recommendation?.detail || '';
}

async function goVerification() {
  state.selected = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}`);
  showScreen('verification');
  fillVerificationForm();
  renderEvidence();
  renderComparison();
}

async function goReport() {
  state.selected = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}`);
  showScreen('report');
  renderReport();
}

function navigationUrl(base, parcelId) {
  if (!base) return null;
  try {
    const url = new URL(base, window.location.origin);
    url.searchParams.set('parcelId', parcelId);
    return url.toString();
  } catch { return null; }
}

function layer1ReturnUrl() {
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  if (returnTo) {
    try {
      const url = new URL(returnTo, window.location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch { /* fall through to configured URL */ }
  }
  return state.config.layer1Url || null;
}

function wireEvents() {
  $('refreshQueue').addEventListener('click', loadQueue);
  $('queueFilters').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-filter]'); if (!button) return;
    state.filter = button.dataset.filter;
    document.querySelectorAll('.filter').forEach((el) => el.classList.toggle('active', el === button));
    await loadQueue();
  });
  $('queueBack').addEventListener('click', () => showScreen('queue'));
  $('startCapture').addEventListener('click', () => {
    state.captureMode = !state.captureMode;
    $('startCapture').textContent = state.captureMode ? 'Boundary Capture Active' : 'Start Boundary Capture';
    toast(state.captureMode ? 'Click the map to capture boundary points.' : 'Boundary capture paused.');
  });
  $('moveSurveyor').addEventListener('click', () => {
    state.moveMode = !state.moveMode;
    $('moveSurveyor').textContent = state.moveMode ? 'Click Map Position' : 'Move Surveyor';
  });
  $('browserPosition').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Browser geolocation is unavailable.');
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition(pos.coords.latitude, pos.coords.longitude, 'BROWSER', pos.coords.accuracy).then(() => toast('Browser field position recorded.')),
      (error) => toast(error.message),
      { enableHighAccuracy: true }
    );
  });
  $('capturePosition').addEventListener('click', async () => {
    const p = state.selected?.survey?.currentPosition;
    if (!p) return toast('Set the surveyor position first.');
    await capturePoint(p.lat, p.lng, p.accuracyMeters);
  });
  $('undoPoint').addEventListener('click', async () => {
    await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/points/undo`, { method: 'POST' }); await refreshSelected();
  });
  $('closePolygon').addEventListener('click', async () => {
    await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/close`, { method: 'POST' }); await refreshSelected(); toast('Field boundary closed.');
  });
  $('resetSurvey').addEventListener('click', async () => {
    await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/reset`, { method: 'POST' }); await refreshSelected();
  });
  $('continueVerification').addEventListener('click', goVerification);
  $('backToWorkspace').addEventListener('click', () => showScreen('workspace'));
  $('assignButton').addEventListener('click', async () => {
    const assignee = $('assigneeInput').value.trim();
    if (!assignee) return toast('Enter a survey team or official.');
    await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignee }) });
    await refreshSelected(); toast('Assignment saved as survey workflow evidence.');
  });
  $('verificationForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = {};
    for (const [k, v] of fd.entries()) body[k] = v === '' ? null : (v === 'true' ? true : (v === 'false' ? false : v));
    const data = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    state.selected.survey = data.survey; state.selected.comparison = data.comparison; state.selected.report = data.report;
    renderComparison(); toast('Field verification saved and compared.');
  });
  $('uploadEvidence').addEventListener('click', async () => {
    const files = $('evidenceInput').files;
    if (!files.length) return toast('Select one or more evidence files.');
    const fd = new FormData(); Array.from(files).forEach((file) => fd.append('evidence', file));
    const data = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/evidence`, { method: 'POST', body: fd });
    state.selected.survey = data.survey; renderEvidence(); $('evidenceInput').value = ''; toast('Evidence stored locally.');
  });
  $('openReport').addEventListener('click', goReport);
  $('completeSurvey').addEventListener('click', async () => {
    const data = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/complete`, { method: 'POST' });
    state.selected.survey = data.survey; state.selected.report = data.report; renderReport(); await loadQueue(); toast('Survey completed and field evidence submitted.');
  });
  $('requestResurvey').addEventListener('click', async () => {
    await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/resurvey`, { method: 'POST' }); state.selected = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}`); renderReport(); toast('Survey marked for re-survey.');
  });
  $('escalateSurvey').addEventListener('click', async () => {
    await api(`/api/surveys/${encodeURIComponent(state.selectedId)}/escalate`, { method: 'POST' }); state.selected = await api(`/api/surveys/${encodeURIComponent(state.selectedId)}`); renderReport(); toast('Survey escalated.');
  });
  $('sendConflict').addEventListener('click', () => {
    const url = navigationUrl(state.config.layer4Url, state.selectedId);
    if (url) window.location.href = url; else toast('Set LAYER4_URL when starting Layer 6 to enable direct Conflict Explorer navigation.');
  });
  $('backButton').addEventListener('click', () => {
    const url = layer1ReturnUrl();
    if (url) {
      window.location.href = url;
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    showScreen('queue');
  });
}

async function boot() {
  wireEvents();
  await Promise.all([loadHealth(), loadConfig()]);
  await loadQueue();
  const parcelId = new URLSearchParams(location.search).get('parcelId');
  if (parcelId) {
    try { await openParcel(parcelId, false); } catch (error) { toast(error.message); }
  }
}

boot().catch((error) => toast(error.message));
