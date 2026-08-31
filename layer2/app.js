(() => {
  'use strict';

  const DATA = window.SIH_LAYER2_DATA;
  if (!DATA) throw new Error('Layer 2 data bundle was not loaded.');

  const canonicalFeatureCount = Array.isArray(DATA.parcelsGeoJSON?.features)
    ? DATA.parcelsGeoJSON.features.length
    : 0;
  const uniquePlanningZones = [...new Set(
    (DATA.planning || []).map(row => String(row.planning_zone || '').trim()).filter(Boolean)
  )];
  const planningZoneLabel = uniquePlanningZones.length
    ? uniquePlanningZones.join(', ')
    : 'Planning records';

  const LAYERS = [
    { id: 'canonical', name: 'Canonical', color: '#334155', meta: `${canonicalFeatureCount} mapped parcels` },
    { id: 'revenue', name: 'Revenue', color: '#e5a700', meta: `${DATA.revenue.length} records · geometry*` },
    { id: 'survey', name: 'Survey', color: '#2563eb', meta: `${DATA.survey.length} measured records` },
    { id: 'ulb', name: 'ULB', color: '#c02670', meta: `${DATA.ulb.length} MCD records · geometry*` },
    { id: 'planning', name: 'Planning Zones', color: '#2f855a', meta: `${planningZoneLabel} · ${DATA.planning.length} records · geometry*` },
    { id: 'satellite', name: 'Satellite', color: '#7c8b6f', meta: 'context layer' },
    { id: 'flood', name: 'Flood Extent', color: '#0284c7', meta: 'scenario overlay' }
  ];

  const SPATIAL_CONFLICTS = new Set([
    'Geometry mismatch', 'Parcel merging', 'Different coordinate systems',
    'Bad data - needs re-evaluation', 'Parcel overlapping',
    'Extra gap between adjacent parcels', 'Legacy digitization errors'
  ]);

  const urlParams = new URLSearchParams(window.location.search);
  const requestedLayerIds = (urlParams.get('layers') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .filter(id => LAYERS.some(layer => layer.id === id));
  const impactModeRequested = urlParams.get('impact') === '1';
  const initialActiveOrder = [...new Set(requestedLayerIds)];
  if (impactModeRequested && !initialActiveOrder.includes('flood')) initialActiveOrder.push('flood');

  const state = {
    activeOrder: initialActiveOrder,
    selectedParcel: null,
    activeTab: 'overview',
    boundaryMode: false,
    floodImpactOpen: initialActiveOrder.includes('flood')
  };

  const $ = (id) => document.getElementById(id);
  const layerListEl = $('layerList');
  const layerStackEl = $('layerStack');
  const activeLayerCountEl = $('activeLayerCount');
  const mapEmptyPrompt = $('mapEmptyPrompt');
  const parcelPanel = $('parcelPanel');
  const panelContent = $('panelContent');
  const panelScrim = $('panelScrim');
  const boundaryModeButton = $('boundaryModeButton');
  const floodImpactPanel = $('floodImpactPanel');
  const floodImpactContent = $('floodImpactContent');
  const closeFloodImpactButton = $('closeFloodImpact');

  const byParcel = (rows, field) => Object.fromEntries(rows.map(row => [row[field], row]));
  const parcelFeatures = Object.fromEntries(DATA.parcelsGeoJSON.features.map(f => [f.properties.parcel_id, f]));
  const revenue = byParcel(DATA.revenue, 'parcel_id');
  const registration = byParcel(DATA.registration, 'parcel_id_ref');
  const survey = byParcel(DATA.survey, 'parcel_id');
  const ulb = byParcel(DATA.ulb, 'parcel_id_ref');
  const planning = byParcel(DATA.planning, 'parcel_id_ref');
  const conflicts = byParcel(DATA.conflicts, 'parcel_id');
  const recommendations = byParcel(DATA.recommendations, 'parcel_id');
  const history = DATA.history.reduce((acc, row) => ((acc[row.parcel_id] ||= []).push(row), acc), {});
  const floodImpact = Array.isArray(DATA.floodImpact) ? DATA.floodImpact : [];
  const floodImpactByParcel = byParcel(floodImpact, 'parcel_id');

  function renderDatasetSummary() {
    const featureList = DATA.parcelsGeoJSON?.features || [];
    const parcelIds = featureList.map(feature => feature.properties?.parcel_id).filter(Boolean);
    const localities = [...new Set(featureList.map(feature =>
      String(feature.properties?.locality || feature.properties?.address || '').split(',')[0].trim()
    ).filter(Boolean))];
    const years = [...new Set(featureList.map(feature => feature.properties?.record_year).filter(Boolean))];
    const recordYearLabel = years.length === 1 ? years[0] : years.join(', ');

    const sourceIdSets = [
      new Set(DATA.revenue.map(row => row.parcel_id).filter(Boolean)),
      new Set(DATA.registration.map(row => row.parcel_id_ref).filter(Boolean)),
      new Set(DATA.survey.map(row => row.parcel_id).filter(Boolean)),
      new Set(DATA.ulb.map(row => row.parcel_id_ref).filter(Boolean)),
      new Set(DATA.planning.map(row => row.parcel_id_ref).filter(Boolean))
    ];
    const fullyCovered = parcelIds.filter(pid => sourceIdSets.every(set => set.has(pid))).length;
    const coveragePct = parcelIds.length ? Math.round((fullyCovered / parcelIds.length) * 100) : 0;
    const sourceFileCount = sourceIdSets.length + (featureList.length ? 1 : 0);

    const studyArea = document.getElementById('studyAreaLabel');
    if (studyArea) {
      const localityLabel = localities.length <= 4
        ? localities.join(' · ')
        : `${localities.length} localities`;
      studyArea.textContent = localityLabel ? `Study area · ${localityLabel}` : 'Study area';
    }

    const datasetFooter = document.getElementById('datasetFooterSummary');
    if (datasetFooter) {
      datasetFooter.textContent = `${parcelIds.length.toLocaleString()} parcel records${recordYearLabel ? ` · record year ${recordYearLabel}` : ''}`;
    }

    const coverageValue = document.getElementById('coverageValue');
    if (coverageValue) coverageValue.textContent = `${coveragePct}%`;

    const coverageText = document.getElementById('coverageText');
    if (coverageText) {
      coverageText.textContent = `${fullyCovered.toLocaleString()} of ${parcelIds.length.toLocaleString()} parcels represented across ${sourceFileCount} supplied source files.`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function n(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const x = Number(value);
    return Number.isFinite(x) ? x : null;
  }

  function fmtArea(value) {
    const x = n(value);
    return x === null ? '—' : `${x.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;
  }

  function isYes(value) {
    return String(value ?? '').trim().toLowerCase() === 'yes';
  }

  function formatPercent(value) {
    const x = n(value);
    if (x === null) return '—';
    return `${Math.round(x * 100)}%`;
  }

  function parseWktPolygon(wkt) {
    if (!wkt) return null;
    const nums = String(wkt).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (nums.length < 6) return null;
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    return pts;
  }

  function bbox(ring) {
    return {
      minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])),
      minY: Math.min(...ring.map(p => p[1])), maxY: Math.max(...ring.map(p => p[1]))
    };
  }

  function centroid(ring) {
    const pts = ring.slice(0, -1);
    return [pts.reduce((s,p) => s+p[0],0)/pts.length, pts.reduce((s,p) => s+p[1],0)/pts.length];
  }

  function scaleRing(ring, scale = 1, dx = 0, dy = 0) {
    const [cx, cy] = centroid(ring);
    return ring.map(([x,y]) => [cx + (x-cx)*scale + dx, cy + (y-cy)*scale + dy]);
  }

  function rectRing(bb) {
    return [[bb.minX,bb.minY],[bb.maxX,bb.minY],[bb.maxX,bb.maxY],[bb.minX,bb.maxY],[bb.minX,bb.minY]];
  }

  function canonicalRing(pid) { return parcelFeatures[pid].geometry.coordinates[0]; }
  function surveyRing(pid) { return parseWktPolygon(survey[pid]?.display_geometry_wkt_epsg4326) || canonicalRing(pid); }

  function revenueRing(pid) {
    const base = canonicalRing(pid);
    const cArea = n(parcelFeatures[pid]?.properties?.area_sqm);
    const rArea = n(revenue[pid]?.recorded_area_sqm);
    const scale = cArea && rArea && rArea > 0
      ? Math.max(.76, Math.min(1.24, Math.sqrt(rArea / cArea)))
      : 1;
    return scaleRing(base, scale);
  }

  function ulbRing(pid) {
    const base = canonicalRing(pid);
    const cArea = n(parcelFeatures[pid]?.properties?.area_sqm);
    const uArea = n(ulb[pid]?.plot_area_sqm);
    const scale = cArea && uArea && uArea > 0
      ? Math.max(.88, Math.min(1.12, Math.sqrt(uArea / cArea)))
      : 1;
    return scaleRing(base, scale);
  }

  function planningRing(pid) {
    return canonicalRing(pid);
  }

  // Public read-only bridge for the WebGL renderer. The existing app remains the
  // single source of truth for layer state, parcel selection and GIS logic.
  window.SIH_LAYER2_BRIDGE = {
    data: DATA,
    layers: LAYERS,
    state,
    geometry: { canonicalRing, surveyRing, revenueRing, ulbRing, planningRing },
    conflictRelevant,
    selectParcel
  };

  function notifyWebGLState() {
    window.dispatchEvent(new CustomEvent('sih-layer2-state', {
      detail: {
        activeOrder: [...state.activeOrder],
        selectedParcel: state.selectedParcel,
        boundaryMode: state.boundaryMode
      }
    }));
  }

  function getFloodImpactSummary() {
    const affected = floodImpact.filter(row => isYes(row.flood_affected));
    const categories = affected.reduce((result, row) => {
      const category = String(row.asset_category || 'Unclassified').trim() || 'Unclassified';
      result[category] = (result[category] || 0) + 1;
      return result;
    }, {});

    return {
      affected,
      affectedParcels: affected.length,
      affectedBuildings: affected.filter(row => isYes(row.building_affected)).length,
      highConfidenceBeneficiaries: affected.filter(row => (n(row.beneficiary_confidence) || 0) >= 0.90).length,
      ownershipConflicts: affected.filter(row => isYes(row.ownership_conflict)).length,
      boundaryConflicts: affected.filter(row => isYes(row.boundary_conflict)).length,
      requiresFieldVerification: affected.filter(row => isYes(row.requires_field_verification)).length,
      categories
    };
  }

  function impactMetric(label, value) {
    return `<div class="impact-row"><span>${escapeHtml(label)}</span><strong>${Number(value || 0).toLocaleString()}</strong></div>`;
  }

  function readinessSortValue(value) {
    return ({ BLOCKED: 0, REVIEW: 1, READY: 2 })[String(value || '').toUpperCase()] ?? 3;
  }

  function renderCompensationReadiness(affectedRows) {
    const container = $('compensationParcelList');
    if (!container) return;

    const rows = affectedRows.slice().sort((a, b) => {
      const readiness = readinessSortValue(a.compensation_readiness) - readinessSortValue(b.compensation_readiness);
      if (readiness) return readiness;
      return String(a.parcel_id).localeCompare(String(b.parcel_id), undefined, { numeric: true });
    });

    container.innerHTML = rows.map(row => {
      const parcel = parcelFeatures[row.parcel_id]?.properties || {};
      const readiness = String(row.compensation_readiness || 'REVIEW').toUpperCase();
      const claimantCount = n(row.active_claimant_records);
      const alerts = [];
      if (isYes(row.ownership_conflict)) {
        alerts.push(claimantCount && claimantCount > 1
          ? `Ownership conflict detected · ${claimantCount.toLocaleString()} active claimant records.`
          : 'Ownership conflict detected.');
      }
      if (isYes(row.boundary_conflict)) alerts.push('Boundary conflict detected.');
      if (isYes(row.requires_field_verification)) alerts.push('Field verification required.');

      return `
        <article class="compensation-card" data-readiness="${escapeHtml(readiness)}">
          <div class="compensation-card-header">
            <div>
              <strong>${escapeHtml(parcel.canonical_id || row.canonical_id || row.parcel_id)}</strong>
              <span>${escapeHtml(parcel.locality || '')}</span>
            </div>
            <span class="readiness-badge">${escapeHtml(readiness)}</span>
          </div>
          <div class="compensation-detail"><span>Flood Damage</span><strong>${escapeHtml(row.flood_damage || '—')}</strong></div>
          <div class="compensation-detail"><span>Ownership Confidence</span><strong>${formatPercent(row.ownership_confidence)}</strong></div>
          <div class="compensation-detail"><span>Boundary Confidence</span><strong>${formatPercent(row.boundary_confidence)}</strong></div>
          ${alerts.length ? `<div class="compensation-alerts">${alerts.map(text => `<p>${escapeHtml(text)}</p>`).join('')}</div>` : ''}
        </article>`;
    }).join('');
  }

  function renderFloodImpactPanel() {
    if (!floodImpactContent) return;
    const summary = getFloodImpactSummary();
    const preferredCategoryOrder = ['Residential', 'Commercial', 'Government', 'Vacant'];
    const categoryEntries = Object.entries(summary.categories).sort((a, b) => {
      const ai = preferredCategoryOrder.indexOf(a[0]);
      const bi = preferredCategoryOrder.indexOf(b[0]);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a[0].localeCompare(b[0]);
    });

    floodImpactContent.innerHTML = `
      <section class="impact-layer">
        <span>Layer</span>
        <strong>Flood Extent</strong>
      </section>

      <section class="impact-section">
        <h3>Impact statistics</h3>
        ${impactMetric('Affected Parcels', summary.affectedParcels)}
        ${impactMetric('Affected Buildings', summary.affectedBuildings)}
        ${impactMetric('High-confidence beneficiaries', summary.highConfidenceBeneficiaries)}
        ${impactMetric('Ownership conflicts', summary.ownershipConflicts)}
        ${impactMetric('Boundary conflicts', summary.boundaryConflicts)}
        ${impactMetric('Requires field verification', summary.requiresFieldVerification)}
      </section>

      <section class="impact-section">
        <h3>Affected categories</h3>
        ${categoryEntries.map(([category, count]) => impactMetric(category, count)).join('')}
      </section>

      <div class="impact-warning">
        This shows disaster authorities where compensation cannot safely be automated.
      </div>

      <section class="impact-section impact-section--readiness">
        <div class="impact-section-heading">
          <div>
            <h3>Compensation Readiness</h3>
            <p>Parcel-level readiness combines flood exposure with ownership, boundary and field-verification evidence.</p>
          </div>
          <span class="count-badge">${summary.affected.length}</span>
        </div>
        <div id="compensationParcelList" class="compensation-list"></div>
      </section>`;

    renderCompensationReadiness(summary.affected);
  }

  function openFloodImpactPanel() {
    if (!floodImpactPanel) return;
    state.floodImpactOpen = true;
    renderFloodImpactPanel();
    floodImpactPanel.classList.add('is-open');
    floodImpactPanel.setAttribute('aria-hidden', 'false');
  }

  function closeFloodImpactPanel() {
    if (!floodImpactPanel) return;
    state.floodImpactOpen = false;
    floodImpactPanel.classList.remove('is-open');
    floodImpactPanel.setAttribute('aria-hidden', 'true');
  }

  function syncFloodImpactPanel() {
    if (!floodImpactPanel) return;
    if (!state.activeOrder.includes('flood')) {
      closeFloodImpactPanel();
      return;
    }
    if (state.floodImpactOpen) openFloodImpactPanel();
  }

  function renderLayerControls() {
    layerListEl.innerHTML = '';
    LAYERS.forEach(layer => {
      const item = document.createElement('label');
      const active = state.activeOrder.includes(layer.id);
      const top = state.activeOrder.at(-1) === layer.id;
      item.className = `layer-item${active ? ' is-active' : ''}${top ? ' is-top' : ''}`;
      item.innerHTML = `
        <input class="layer-checkbox" type="checkbox" data-layer="${layer.id}" ${active ? 'checked' : ''} />
        <span class="layer-swatch" style="background:${layer.color}"></span>
        <span><span class="layer-name">${escapeHtml(layer.name)}</span><span class="layer-meta">${escapeHtml(layer.meta)}</span></span>
        <span class="layer-top-badge">TOP</span>`;
      layerListEl.appendChild(item);
    });

    layerListEl.querySelectorAll('input[data-layer]').forEach(input => {
      input.addEventListener('change', e => toggleLayer(e.target.dataset.layer, e.target.checked));
    });
  }

  function renderLayerStack() {
    activeLayerCountEl.textContent = state.activeOrder.length;
    $('railLayerCount').textContent = state.activeOrder.length;
    if (!state.activeOrder.length) {
      layerStackEl.className = 'layer-stack empty-state-small';
      layerStackEl.textContent = 'No layers selected';
      return;
    }
    layerStackEl.className = 'layer-stack';
    layerStackEl.innerHTML = state.activeOrder.map((id, index) => {
      const l = LAYERS.find(x => x.id === id);
      return `<div class="stack-row"><span class="stack-index">${index + 1}</span><span>${escapeHtml(l.name)}</span>${index === state.activeOrder.length - 1 ? '<strong>Top</strong>' : ''}</div>`;
    }).join('');
  }

  function toggleLayer(id, checked) {
    state.activeOrder = state.activeOrder.filter(x => x !== id);
    if (checked) state.activeOrder.push(id);
    if (!checked && state.boundaryMode && ['canonical','survey','revenue'].includes(id)) state.boundaryMode = false;
    if (id === 'flood') state.floodImpactOpen = checked;
    renderAll();
  }

  function conflictRelevant(conflict) {
    const a = new Set(state.activeOrder);
    if (a.size < 2) return false;
    const type = conflict.conflict_type;
    if (type === 'Parcel name mismatch') return a.has('revenue') && a.has('survey');
    if (type === 'Geometry mismatch') return a.has('survey') && a.has('canonical');
    if (type === 'Parcel merging') return (a.has('revenue') || a.has('survey')) && a.has('ulb');
    if (type === 'Different addressing / field semantics') return a.has('revenue') && (a.has('survey') || a.has('ulb'));
    if (type === 'Different coordinate systems') return a.has('survey') && a.has('canonical');
    if (type === 'Bad data - needs re-evaluation') return (a.has('revenue') || a.has('survey')) && (a.has('ulb') || a.has('canonical'));
    if (type === 'Digitized but never field verified') return a.has('survey') && (a.has('canonical') || a.has('ulb'));
    if (type === 'Parcel overlapping') return a.has('survey') && (a.has('canonical') || a.has('ulb'));
    if (type === 'Extra gap between adjacent parcels') return a.has('survey') && a.has('canonical');
    if (type === 'Legacy digitization errors') return a.has('revenue') && (a.has('survey') || a.has('canonical'));
    return false;
  }

  function renderMapState() {
    const hasLayers = state.activeOrder.length > 0;
    mapEmptyPrompt.classList.toggle('is-hidden', hasLayers);

    const visibleConflicts = hasLayers
      ? DATA.conflicts.filter(conflictRelevant).length
      : 0;

    $('conflictCounter').textContent = `${visibleConflicts} visible conflict${visibleConflicts === 1 ? '' : 's'}`;
    $('conflictCounter').classList.toggle('has-conflicts', visibleConflicts > 0);
    $('railConflictCount').textContent = visibleConflicts;

    if (!hasLayers) {
      $('mapStatusText').textContent = 'Ready · no layer active';
    } else {
      const topName = LAYERS.find(layer => layer.id === state.activeOrder.at(-1))?.name || 'Layer';
      $('mapStatusText').textContent =
        `${state.activeOrder.length} layer${state.activeOrder.length === 1 ? '' : 's'} active · ${topName} on top · ${visibleConflicts} conflicts exposed`;
    }

    notifyWebGLState();
  }

  function selectParcel(pid, open = false) {
    state.selectedParcel = pid;
    const props = parcelFeatures[pid].properties;
    $('railSelectedParcel').textContent = props.canonical_id;
    $('railSelectedConflict').textContent = props.primary_conflict_type;
    $('openSelectedButton').disabled = false;
    boundaryModeButton.disabled = false;
    if (open) openPanel();
    renderMapState();
  }

  function openPanel() {
    if (!state.selectedParcel) return;
    parcelPanel.classList.add('is-open');
    parcelPanel.setAttribute('aria-hidden','false');
    panelScrim.classList.add('is-open');
    panelScrim.setAttribute('aria-hidden','false');
    renderPanel();
  }

  function closePanel() {
    parcelPanel.classList.remove('is-open');
    parcelPanel.setAttribute('aria-hidden','true');
    panelScrim.classList.remove('is-open');
    panelScrim.setAttribute('aria-hidden','true');
  }

  function statusClass(severity) { return String(severity || 'low').toLowerCase(); }
  function statusLabel(severity) {
    const s = String(severity || '').toLowerCase();
    if (s === 'critical') return 'REVIEW REQUIRED';
    if (s === 'high') return 'MAJOR CONFLICT';
    if (s === 'medium') return 'MINOR CONFLICT';
    return 'MINOR CONFLICT';
  }

  function sourceStatus(value, bad = false) {
    if (bad) return '<span class="source-bad">⚠</span>';
    return String(value).toLowerCase() === 'yes' || String(value).toLowerCase() === 'mapped'
      ? '<span class="source-ok">✓</span>' : '<span class="source-warn">⚠</span>';
  }

  function renderOverview(pid) {
    const p = parcelFeatures[pid].properties;
    const c = conflicts[pid];
    const confidence = Math.round(Number(p.confidence) * 100);
    const identifiers = [
      ['Canonical ID', p.canonical_id],
      ['Survey Number', p.survey_no],
      ['ULB Property ID', p.mcd_property_id],
      ['ULPIN', 'Not present in dataset']
    ];
    return `
      <section class="panel-section">
        <div class="summary-grid">
          <div class="summary-card"><span>Confidence</span><strong>${confidence}%</strong><div class="confidence-bar"><span style="width:${confidence}%"></span></div></div>
          <div class="summary-card"><span>Status</span><strong><span class="status-badge status-badge--${statusClass(p.severity)}">${statusLabel(p.severity)}</span></strong></div>
          <div class="summary-card"><span>Area</span><strong>${fmtArea(p.area_sqm)}</strong></div>
          <div class="summary-card"><span>Current owner</span><strong>${escapeHtml(p.current_owner)}</strong></div>
          <div class="summary-card"><span>Land use</span><strong>${escapeHtml(ulb[pid]?.property_use || planning[pid]?.land_use_zone || '—')}</strong></div>
          <div class="summary-card"><span>Conflict</span><strong>${escapeHtml(c?.conflict_type || 'None')}</strong></div>
        </div>
      </section>
      <section class="panel-section">
        <h3>Identifiers</h3>
        <div class="kv-list">${identifiers.map(([k,v]) => `<div class="kv-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>
      </section>
      <section class="panel-section">
        <h3>Sources</h3>
        <div class="source-status-list">
          <div class="source-status-row"><span>Revenue</span>${sourceStatus(revenue[pid]?.field_verified, revenue[pid]?.data_quality === 'Poor')}</div>
          <div class="source-status-row"><span>Survey</span>${sourceStatus(survey[pid]?.field_verified, survey[pid]?.topology_status === 'INVALID_SOURCE_DATA')}</div>
          <div class="source-status-row"><span>Registration</span>${sourceStatus(registration[pid]?.document_verified)}</div>
          <div class="source-status-row"><span>ULB</span>${sourceStatus(ulb[pid]?.field_verified)}</div>
          <div class="source-status-row"><span>Planning</span>${sourceStatus(planning[pid]?.approval_status)}</div>
          <div class="source-status-row"><span>Remote Sense / GeoJSON</span><span class="source-ok">✓</span></div>
        </div>
      </section>
      <section class="panel-section">
        <h3>Location</h3>
        <div class="kv-list">
          <div class="kv-row"><span>Address</span><strong>${escapeHtml(p.address)}</strong></div>
          <div class="kv-row"><span>Planning zone</span><strong>${escapeHtml(p.dda_zone)}</strong></div>
          <div class="kv-row"><span>Record year</span><strong>${escapeHtml(p.record_year)}</strong></div>
        </div>
      </section>`;
  }

  function renderSources(pid) {
    const p = parcelFeatures[pid].properties;
    const latestReg = registration[pid]?.registration_date || '';
    const revDate = revenue[pid]?.mutation_date || '';
    const revStale = latestReg && revDate && latestReg > revDate;
    const rows = [
      ['Revenue', revenue[pid]?.land_owner, revenue[pid]?.recorded_area_sqm, revenue[pid]?.mutation_date, revStale ? 'Potentially outdated' : ''],
      ['Survey', survey[pid]?.recorded_person, survey[pid]?.measured_area_sqm, survey[pid]?.survey_date, survey[pid]?.field_verified === 'No' ? 'Not field verified' : ''],
      ['Registration', registration[pid]?.buyer_name, registration[pid]?.transaction_area_sqm, registration[pid]?.registration_date, ''],
      ['ULB', ulb[pid]?.primary_holder, ulb[pid]?.plot_area_sqm, ulb[pid]?.assessment_year, ulb[pid]?.field_verified === 'No' ? 'Not field verified' : ''],
      ['Planning', '—', null, planning[pid]?.plan_year, planning[pid]?.land_use_zone || ''],
      ['GeoJSON', p.current_owner, p.area_sqm, p.record_year, 'Canonical map layer']
    ];
    return `
      <section class="panel-section">
        <div class="panel-section-heading"><h3>Source observations</h3><span class="count-badge">${rows.length}</span></div>
        <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Source</th><th>Owner / holder</th><th>Area</th><th>Date</th></tr></thead><tbody>
          ${rows.map(([source,owner,area,date,note]) => `<tr><td><strong>${escapeHtml(source)}</strong>${note ? `<span class="table-warning">${escapeHtml(note)}</span>` : ''}</td><td>${escapeHtml(owner || '—')}</td><td>${fmtArea(area)}</td><td>${escapeHtml(String(date || '—'))}</td></tr>`).join('')}
        </tbody></table></div>
      </section>
      <section class="panel-section">
        <div class="recommendation"><strong>How to read this table</strong>Dates are intentionally shown beside competing observations. A Revenue mutation older than a later registered transaction is a strong clue that the Revenue record may be stale, but it is not automatically overwritten.</div>
      </section>
      <p class="provenance-note">Geometry note: Survey and Canonical have explicit geometry in the dataset. Revenue, ULB and Planning display polygons are derived in this frontend for source comparison and are marked with *.</p>`;
  }

  function polygonIoU(a, b) {
    const A = bbox(a), B = bbox(b);
    const ix = Math.max(0, Math.min(A.maxX,B.maxX)-Math.max(A.minX,B.minX));
    const iy = Math.max(0, Math.min(A.maxY,B.maxY)-Math.max(A.minY,B.minY));
    const inter = ix*iy;
    const areaA = (A.maxX-A.minX)*(A.maxY-A.minY), areaB = (B.maxX-B.minX)*(B.maxY-B.minY);
    const union = areaA+areaB-inter;
    return union ? inter/union : 0;
  }

  function distanceMeters(a,b) {
    const lat = (a[1]+b[1])/2 * Math.PI/180;
    const dx = (a[0]-b[0])*111320*Math.cos(lat);
    const dy = (a[1]-b[1])*110540;
    return Math.sqrt(dx*dx+dy*dy);
  }

  function referencedPeer(pid) {
    const conflict = conflicts[pid];
    if (!conflict) return null;
    const text = [conflict.observed_a, conflict.observed_b, conflict.issue_summary]
      .filter(Boolean)
      .join(' ');
    const ids = text.match(/\bP\d+\b/g) || [];
    return ids.find(id => id !== pid && parcelFeatures[id]) || null;
  }

  function mergePeer(pid) {
    const group = parcelFeatures[pid]?.properties?.merge_group;
    if (group) {
      const peer = Object.keys(parcelFeatures).find(otherPid =>
        otherPid !== pid && parcelFeatures[otherPid]?.properties?.merge_group === group
      );
      if (peer) return peer;
    }
    return referencedPeer(pid);
  }

  function overlapPeer(pid) {
    const candidates = DATA.conflicts
      .filter(row => row.parcel_id !== pid && row.conflict_type === conflicts[pid]?.conflict_type)
      .map(row => row.parcel_id)
      .filter(otherPid => parcelFeatures[otherPid]);
    if (!candidates.length) return referencedPeer(pid);

    return candidates
      .map(otherPid => ({ otherPid, score: polygonIoU(surveyRing(pid), surveyRing(otherPid)) }))
      .sort((a, b) => b.score - a.score)[0]?.otherPid || null;
  }

  function adjacentGapMeters(pid) {
    const other = referencedPeer(pid);
    if (!other) return null;
    const a = bbox(surveyRing(pid));
    const b = bbox(surveyRing(other));
    const gapLon = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
    const lat = (centroid(surveyRing(pid))[1] + centroid(surveyRing(other))[1]) / 2;
    return gapLon * 111320 * Math.cos(lat * Math.PI / 180);
  }

  function boundaryMetrics(pid) {
    const can = canonicalRing(pid), sur = surveyRing(pid), rev = revenueRing(pid);
    const canArea = n(parcelFeatures[pid].properties.area_sqm) || 0;
    const surArea = n(survey[pid]?.measured_area_sqm);
    const areaDiff = canArea && surArea !== null ? Math.abs(surArea-canArea)/canArea*100 : null;
    const displacement = distanceMeters(centroid(can), centroid(sur));
    let overlap = polygonIoU(can, sur)*100;
    const type = conflicts[pid]?.conflict_type;
    let extraLabel = null, extraValue = null;
    if (type === 'Parcel overlapping') {
      const other = overlapPeer(pid);
      if (other) {
        overlap = polygonIoU(sur, surveyRing(other)) * 100;
        extraLabel = 'Adjacent overlap';
        extraValue = `${overlap.toFixed(1)}%`;
      }
    } else if (type === 'Extra gap between adjacent parcels') {
      const gap = adjacentGapMeters(pid);
      extraLabel = 'Adjacent gap'; extraValue = gap === null ? '—' : `${gap.toFixed(1)} m`;
    } else if (type === 'Parcel merging') {
      const other = mergePeer(pid);
      if (other) {
        const mergeBb = bbox([...ulbRing(pid).slice(0,-1), ...ulbRing(other).slice(0,-1)]);
        overlap = polygonIoU(can, rectRing(mergeBb)) * 100;
        extraLabel = 'Merged holding view'; extraValue = `${overlap.toFixed(1)}% parcel share`;
      }
    }
    return {
      overlap: overlap.toFixed(1) + '%',
      areaDiff: areaDiff === null ? '—' : areaDiff.toFixed(1) + '%',
      displacement: displacement.toFixed(1) + ' m',
      extraLabel, extraValue,
      revenueOverlap: (polygonIoU(can,rev)*100).toFixed(1)+'%'
    };
  }

  function renderConflicts(pid) {
    const c = conflicts[pid];
    const r = recommendations[pid];
    const m = boundaryMetrics(pid);
    const spatial = SPATIAL_CONFLICTS.has(c?.conflict_type);
    return `
      <section class="panel-section">
        <div class="conflict-card">
          <div class="conflict-card__top"><div><p class="eyebrow">Conflict detected</p><h3>${escapeHtml(c?.conflict_type || 'No conflict')}</h3></div><span class="status-badge status-badge--${statusClass(c?.severity)}">${escapeHtml(c?.severity || 'Low')}</span></div>
          <div class="observed-grid">
            <div class="observed-card"><span>${escapeHtml(c?.source_a || 'Source A')}</span><strong>${escapeHtml(c?.observed_a || '—')}</strong></div>
            <div class="observed-card"><span>${escapeHtml(c?.source_b || 'Source B')}</span><strong>${escapeHtml(c?.observed_b || '—')}</strong></div>
          </div>
          <p>${escapeHtml(c?.issue_summary || '')}</p>
        </div>
      </section>
      <section class="panel-section">
        <div class="recommendation"><strong>Suggested interpretation</strong>${escapeHtml(r?.explanation || 'No recommendation available.')}</div>
      </section>
      <section class="panel-section">
        <div class="panel-section-heading"><h3>Boundary conflict visualization</h3><span class="count-badge">${spatial ? 'Spatial' : 'Context'}</span></div>
        <div class="boundary-legend"><span><i class="boundary-line boundary-line--survey"></i>Survey</span><span><i class="boundary-line boundary-line--revenue"></i>Revenue *</span><span><i class="boundary-line boundary-line--canonical"></i>Canonical</span></div>
        <button class="boundary-action" type="button" data-action="boundary">${state.boundaryMode ? 'Exit boundary comparison' : 'Show boundaries on map'}</button>
        <div class="metrics-grid">
          <div class="metric-box"><span>Geometry overlap</span><strong>${escapeHtml(m.overlap)}</strong></div>
          <div class="metric-box"><span>Area difference</span><strong>${escapeHtml(m.areaDiff)}</strong></div>
          <div class="metric-box"><span>Centroid displacement</span><strong>${escapeHtml(m.displacement)}</strong></div>
        </div>
        ${m.extraLabel ? `<div class="kv-list" style="margin-top:8px"><div class="kv-row"><span>${escapeHtml(m.extraLabel)}</span><strong>${escapeHtml(m.extraValue)}</strong></div></div>` : ''}
        <p class="provenance-note">Overlap is an MVP rectangle-based geometry metric. Revenue geometry is a deterministic display derivation, not a source polygon from the CSV.</p>
      </section>`;
  }

  function renderHistory(pid) {
    const rows = (history[pid] || []).slice().sort((a,b) => Number(a.year)-Number(b.year));
    if (!rows.length) {
      const timelineParcelCount = new Set(DATA.history.map(row => row.parcel_id).filter(Boolean)).size;
      const years = [...new Set(DATA.history.map(row => n(row.year)).filter(value => value !== null))].sort((a, b) => a - b);
      const yearSummary = years.length ? years.join(', ') : 'no dated snapshots';
      return `<div class="empty-panel-state"><strong>No timeline snapshots for this parcel.</strong><br/>The supplied timeline dataset contains ${timelineParcelCount.toLocaleString()} parcel histories across ${escapeHtml(yearSummary)}.</div>`;
    }
    return `<section class="panel-section"><div class="panel-section-heading"><h3>Parcel history</h3><span class="count-badge">${rows.length}</span></div><div class="timeline">
      ${rows.map(row => `<div class="timeline-item"><div class="timeline-year">${escapeHtml(row.year)}</div><div class="timeline-title">${escapeHtml(row.event_type)}</div><div class="timeline-meta">${escapeHtml(row.owner_or_recorded_person)} · ${fmtArea(row.area_sqm)} · ${escapeHtml(row.verification_state)}</div><div class="timeline-note">${escapeHtml(row.event_note)}</div></div>`).join('')}
    </div></section>`;
  }

  function renderDocuments(pid) {
    const docs = [
      ['Revenue', revenue[pid]?.source_document || revenue[pid]?.revenue_record_id, revenue[pid]?.field_verified === 'Yes' ? 'Verified' : 'Review'],
      ['Registration', registration[pid]?.deed_no || registration[pid]?.registration_id, registration[pid]?.document_verified === 'Yes' ? 'Verified' : 'Review'],
      ['Survey', survey[pid]?.survey_record_id, survey[pid]?.field_verified === 'Yes' ? 'Field verified' : 'Unverified'],
      ['ULB', ulb[pid]?.mcd_property_id, ulb[pid]?.geo_tagged === 'Yes' ? 'Geo-tagged' : 'Review'],
      ['Planning', planning[pid]?.source_plan || planning[pid]?.dda_planning_id, planning[pid]?.approval_status || 'Mapped']
    ];
    return `<section class="panel-section"><div class="panel-section-heading"><h3>Document references</h3><span class="count-badge">${docs.length}</span></div><div class="document-list">
      ${docs.map(([source,ref,status]) => `<div class="document-card"><div class="document-icon">▤</div><div><strong>${escapeHtml(source)}</strong><span>${escapeHtml(ref || 'Reference unavailable')}</span></div><span class="doc-tag">${escapeHtml(status)}</span></div>`).join('')}
      </div><p class="provenance-note">The uploaded MVP pack contains document references and verification flags, not the underlying document files. These cards therefore do not fake an “open document” action.</p></section>`;
  }

  function renderPanel() {
    const pid = state.selectedParcel;
    if (!pid) return;
    const p = parcelFeatures[pid].properties;
    $('panelParcelId').textContent = `${p.canonical_id}`;
    $('panelParcelName').textContent = `${p.parcel_name} · ${pid}`;
    document.querySelectorAll('.panel-tab').forEach(tab => tab.classList.toggle('is-active', tab.dataset.tab === state.activeTab));
    const renderers = {overview:renderOverview,sources:renderSources,conflicts:renderConflicts,history:renderHistory,documents:renderDocuments};
    panelContent.innerHTML = renderers[state.activeTab](pid);
    panelContent.querySelector('[data-action="boundary"]')?.addEventListener('click', toggleBoundaryMode);
  }

  function toggleBoundaryMode() {
    if (!state.selectedParcel) return;
    state.boundaryMode = !state.boundaryMode;
    if (state.boundaryMode) {
      ['canonical','revenue','survey'].forEach(id => {
        state.activeOrder = state.activeOrder.filter(x => x !== id);
        state.activeOrder.push(id);
      });
    }
    boundaryModeButton.classList.toggle('is-active', state.boundaryMode);
    boundaryModeButton.textContent = state.boundaryMode ? 'Exit compare' : 'Boundary compare';
    renderAll();
    if (parcelPanel.classList.contains('is-open')) renderPanel();
  }

  function renderAll() {
    renderLayerControls();
    renderLayerStack();
    renderMapState();
    boundaryModeButton.disabled = !state.selectedParcel;
    boundaryModeButton.classList.toggle('is-active', state.boundaryMode);
    boundaryModeButton.textContent = state.boundaryMode ? 'Exit compare' : 'Boundary compare';
    syncFloodImpactPanel();
  }

  document.querySelectorAll('.panel-tab').forEach(tab => tab.addEventListener('click', () => {
    state.activeTab = tab.dataset.tab;
    renderPanel();
  }));
  $('closePanelButton').addEventListener('click', closePanel);
  panelScrim.addEventListener('click', closePanel);
  $('openSelectedButton').addEventListener('click', openPanel);
  $('clearLayersButton').addEventListener('click', () => {
    state.activeOrder = [];
    state.boundaryMode = false;
    state.floodImpactOpen = false;
    renderAll();
  });
  $('fitButton').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('sih-layer2-fit'));
  });
  boundaryModeButton.addEventListener('click', toggleBoundaryMode);
  closeFloodImpactButton?.addEventListener('click', event => {
    event.stopPropagation();
    closeFloodImpactPanel();
  });
  document.addEventListener('pointerdown', event => {
    if (!state.floodImpactOpen || !floodImpactPanel) return;
    if (floodImpactPanel.contains(event.target)) return;
    const floodControl = event.target.closest?.('input[data-layer="flood"], .layer-item');
    if (floodControl && floodControl.querySelector?.('input[data-layer="flood"]')) return;
    closeFloodImpactPanel();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closePanel();
    closeFloodImpactPanel();
  });

  renderDatasetSummary();
  renderAll();
})();
