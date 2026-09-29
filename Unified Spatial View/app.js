(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const LAYERS = [
    {id:'canonical', name:'Canonical Parcels', color:'#334155'},
    {id:'buildings', name:'Building Footprints', color:'#52697d'}
  ];
  const requested = (new URLSearchParams(location.search).get('layers') || '').split(',').filter(Boolean);
  const state = {activeOrder:[...new Set(requested.filter(id => LAYERS.some(l => l.id === id)))], selectedParcel:null, activeTab:'overview', boundaryMode:false};
  let DATA = window.PRAMAN_DATA_ADAPTER.normalize();
  let parcels = new Map();
  let dataConnected = false;
  let rendererStatus = {state:'loading',message:'Starting spatial workspace…'};
  const parcelPanel = $('parcelPanel'), panelContent = $('panelContent'), panelScrim = $('panelScrim');
  const boundaryModeButton = $('boundaryModeButton');


  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function n(value) { if (value === null || value === undefined || String(value).trim() === '') return null; const x = Number(value); return Number.isFinite(x) ? x : null; }
  function fmtArea(value) { const x = n(value); return x === null ? '—' : `${x.toLocaleString(undefined,{maximumFractionDigits:1})} m²`; }
  function rowsFor(key, pid) { return DATA[key].filter(row => row.parcel_id === pid); }
  function empty(message) { return `<div class="empty-panel-state">${escapeHtml(message)}</div>`; }
  function kv(rows) { return `<div class="kv-list">${rows.map(([k,v]) => `<div class="kv-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v ?? '—')}</strong></div>`).join('')}</div>`; }
  function section(title, body) { return `<section class="panel-section"><h3>${escapeHtml(title)}</h3>${body}</section>`; }

  function loadDataset(input) {
    // Validate before replacing current state, so a rejected load is atomic.
    const next = window.PRAMAN_DATA_ADAPTER.normalize(input);
    DATA = next;
    parcels = new Map([...DATA.parcels,...DATA.historicalParcels].map(p => [p.id,p]));
    dataConnected = true;
    state.selectedParcel = null;
    state.boundaryMode = false;
    closePanel();
    $('railSelectedParcel').textContent = 'None';
    $('railSelectedConflict').textContent = 'No parcel selected';
    $('openSelectedButton').disabled = true;
    renderDatasetSummary(); renderAll();
  }
  function renderDatasetSummary() {
    const active = DATA.parcels.filter(p => p.is_active).length;
    $('studyAreaLabel').textContent = DATA.metadata.study_area || 'Study area';
    $('datasetFooterSummary').textContent = dataConnected ? `${active.toLocaleString()} active · ${(DATA.parcels.length-active+DATA.historicalParcels.length).toLocaleString()} historical / inactive records` : 'No dataset connected';
    const required = DATA.metadata.coverage_source_ids;
    const activeIds = DATA.parcels.filter(p => p.is_active).map(p => p.id);
    if (Array.isArray(required) && required.length && activeIds.length) {
      const covered = activeIds.filter(id => required.every(source => rowsFor('sources',id).some(r => r.source_id === source))).length;
      $('coverageValue').textContent = `${Math.round(covered / activeIds.length * 100)}%`;
      $('coverageText').textContent = `${covered} of ${activeIds.length} active parcels across ${required.length} declared required sources.`;
    } else {
      $('coverageValue').textContent = '—';
      $('coverageText').textContent = dataConnected ? 'Coverage requirements not supplied or no active parcels' : 'No dataset connected';
    }
  }
  function renderLayerControls() {
    $('layerList').innerHTML = LAYERS.map(layer => {
      const active = state.activeOrder.includes(layer.id);
      const count = layer.id === 'canonical' ? (window.PRAMAN_MAP?.city?.stats?.planned?.activeParcels ?? DATA.parcels.filter(p=>p.is_active&&p.geometry).length) : layer.id === 'buildings' ? DATA.buildingFootprints.filter(b=>b.geometry).length : 0;
      const evidence=window.PRAMAN_MAP?.evidence;const family=evidence?.model.families.find(f=>f.id===layer.id);
      const meta = family?`${family.count} observations · ${family.geometryCount} geometries · independent source layer`:(dataConnected ? layer.id==='canonical'?`${count} current authoritative parcel polygons`:layer.id==='buildings'?`${count} source-observed footprint polygons`:`${count} spatial records` : 'Awaiting dataset · map pending');
      return `<label class="layer-item${active?' is-active':''}${state.activeOrder.at(-1)===layer.id?' is-top':''}"><input class="layer-checkbox" type="checkbox" data-layer="${layer.id}" ${active?'checked':''}/><span class="layer-swatch" style="background:${layer.color}"></span><span><span class="layer-name">${layer.name}</span><span class="layer-meta">${escapeHtml(meta)}</span></span><span class="layer-top-badge">TOP</span></label>`;
    }).join('');
    $('layerList').querySelectorAll('input').forEach(input => input.addEventListener('change', () => toggleLayer(input.dataset.layer,input.checked)));
  }
  function renderLayerStack() {
    $('activeLayerCount').textContent = $('railLayerCount').textContent = state.activeOrder.length;
    $('layerStack').className = `layer-stack${state.activeOrder.length?'':' empty-state-small'}`;
    $('layerStack').innerHTML = state.activeOrder.length ? state.activeOrder.map((id,index) => `<div class="stack-row"><span class="stack-index">${index+1}</span><span>${LAYERS.find(l=>l.id===id).name}</span></div>`).join('') : 'No layers selected';
  }
  function toggleLayer(id, checked) {
    if (!LAYERS.some(l=>l.id===id)) return false;
    state.activeOrder = state.activeOrder.filter(x=>x!==id);
    if (checked) state.activeOrder.push(id);
    renderAll(); return true;
  }
  function conflictRelevant(conflict) {
    return Array.isArray(conflict.layer_ids) && conflict.layer_ids.length > 0 && conflict.layer_ids.every(id=>state.activeOrder.includes(id));
  }
  function notifyMapState() {
    window.dispatchEvent(new CustomEvent('praman-spatial-state',{detail:{...state,activeOrder:[...state.activeOrder],rendererReady:rendererStatus.state==='ready'}}));
  }
  function renderMapState() {
    const ready = rendererStatus.state === 'ready';
    $('mapEmptyPrompt').classList.toggle('is-hidden', ready);
    $('mapEmptyPrompt').querySelector('strong').textContent = rendererStatus.state === 'error' ? 'Map unavailable' : 'Loading spatial view';
    $('mapEmptyDescription').textContent = rendererStatus.message;
    $('mapStatusText').textContent = rendererStatus.message;
    $('conflictCounter').textContent = ready ? (dataConnected ? 'Current locality' : 'Spatial workspace') : 'Map unavailable';
    $('railConflictCount').textContent = DATA.conflicts.filter(conflictRelevant).length;
    notifyMapState();
  }
  window.addEventListener('praman-renderer-status', event => {rendererStatus = event.detail; renderMapState();});
  function selectParcel(pid, open = false) {
    const parcel = parcels.get(pid);
    if (!parcel) return false;
    state.selectedParcel = pid;
    $('railSelectedParcel').textContent = pid;
    const count = rowsFor('conflicts',pid).length;
    $('railSelectedConflict').textContent = `${count} recorded conflicts`;
    $('openSelectedButton').disabled = false;
    boundaryModeButton.disabled=!window.PRAMAN_MAP?.evidence;
    if (open) openPanel(); else if (parcelPanel.classList.contains('is-open')) renderPanel();
    renderMapState(); return true;
  }
  function openPanel() {
    if (!parcels.has(state.selectedParcel)) return;
    parcelPanel.classList.add('is-open'); parcelPanel.setAttribute('aria-hidden','false'); parcelPanel.inert = false;
    panelScrim.classList.add('is-open'); panelScrim.setAttribute('aria-hidden','false'); renderPanel();
  }
  function closePanel() {
    parcelPanel.classList.remove('is-open'); parcelPanel.setAttribute('aria-hidden','true'); parcelPanel.inert = true;
    panelScrim.classList.remove('is-open'); panelScrim.setAttribute('aria-hidden','true');
  }
  function renderOverview(pid) {
    const p = parcels.get(pid);
    const temporalModel=window.PRAMAN_MAP?.temporal?.model,temporalState=temporalModel?.selected(pid),geometry=temporalModel?.geometries?.get(p.geometryId),reconciliation=DATA.reconciliation.find(r=>r.parcelId===pid);
    const authority=temporalState?.category || (p.is_active ? (p.authority_status || 'UNKNOWN') : 'HISTORICAL / SUPERSEDED');
    const owner=p.is_active?p.current_owner:(p.formerOwner||p.current_owner);
    return section('Parcel overview',kv([
      ['Parcel ID',p.id],
      ['Lifecycle',p.is_active?'Active record':'Historical / retired record'],
      ['Current authority state',authority],
      ['Record status',p.recordStatus],
      ['Current geometry ID',p.geometryId],
      ['Geometry status',geometry?.status],
      ['Geometry acceptance',geometry?.acceptedStatus],
      ['Reconciliation / review',temporalState?.review || reconciliation?.matchStatus],
      ['Human review required',reconciliation?.requiresHumanReview],
      ['Area',fmtArea(p.area_sqm)],
      [p.is_active?'Current recorded owner':'Former recorded owner',owner],
      ['Land use',p.land_use],
      ['Address',p.address]
    ]))+'<p class="authority-note">Authority is shown from PRAMAN record status plus the linked geometry-version acceptance state; source confidence or observation recency does not replace it.</p><details class="overview-evidence"><summary>Evidence and decision support</summary>'+(window.PRAMAN_MAP?.evidence?.renderDecisionSupport(pid)||'')+'</details>';
  }
  function renderSources(pid) {
    if(window.PRAMAN_MAP?.evidence)return window.PRAMAN_MAP.evidence.renderSources(pid);
    const rows = rowsFor('sources',pid);
    if (!rows.length) return empty('No source observations supplied for this parcel.');
    return section('Source observations',rows.map(r=>section(r.source_name || r.source_id || 'Source',kv([['Observation ID',r.id],['Owner / holder',r.holder],['Area',fmtArea(r.area_sqm)],['Observation date',r.date],['Verification',r.verification_status],['Geometry',r.geometry?'Supplied — not rendered':'Not supplied'],['CRS',r.crs],['Provenance',r.provenance]]))).join(''));
  }
  function boundaryMetrics(pid) { return rowsFor('comparisons',pid); }
  function renderConflicts(pid) {
    if(window.PRAMAN_MAP?.evidence)return window.PRAMAN_MAP.evidence.renderConflicts(pid);
    const rows = rowsFor('conflicts',pid);
    const recommendations = rowsFor('recommendations',pid);
    return (rows.length ? rows.map(r=>section(r.type || 'Recorded conflict',kv([['Conflict ID',r.id],['Severity',r.severity],['Source A',r.source_a],['Observed A',r.observed_a],['Source B',r.source_b],['Observed B',r.observed_b],['Evidence',r.description],['Review status',r.review_status]]))).join('') : empty('No conflict records supplied.')) +
      recommendations.map(r=>section('Proposed interpretation',kv([['Conflict ID',r.conflict_id],['Proposal',r.explanation],['Decision status',r.decision_status]]))).join('') +
      section('Boundary comparison',boundaryMetrics(pid).map(r=>kv([['Metric',r.label],['Value',r.value],['Unit',r.unit],['Method',r.method],['Provenance',r.provenance]])).join('') || empty('No validated comparison metrics supplied.')) + '<button class="boundary-action" type="button" disabled>Boundary display available with the replacement map</button>';
  }
  function renderHistory(pid) {
    const temporal=window.PRAMAN_MAP?.temporal;
    if(temporal){const details=temporal.model.selected(pid);return section('Shared history / GeoGit records',`<a href="${escapeHtml(temporal.model.historyURL(pid,temporal.getState().eventId))}">View Parcel History</a>`+(details.events.length?details.events.map(e=>'<details><summary>'+escapeHtml(e.type+' · '+e.date)+'</summary>'+kv([['Record',e.id],['Table',e.table],['Date',e.date],['Previous version',e.previousVersion],['Resulting version',e.resultingVersion],['Source',e.source],['Authority / review',e.authority],['Reason',e.reason]])+'</details>').join(''):empty('No history records supplied for this parcel.')));}

    const rows = rowsFor('history',pid).map((row,index)=>({row,index,time:Date.parse(String(row.date || row.year || ''))})).sort((a,b)=>(Number.isFinite(a.time)?a.time:Infinity)-(Number.isFinite(b.time)?b.time:Infinity)||a.index-b.index).map(item=>item.row);
    if (!rows.length) return empty('No history records supplied for this parcel.');
    return section('Parcel history',`<div class="timeline">${rows.map(r=>`<div class="timeline-item"><div class="timeline-year">${escapeHtml(r.date || r.year || 'Undated')}</div><div class="timeline-title">${escapeHtml(r.event_type)}</div><div class="timeline-meta">${escapeHtml(r.owner_or_recorded_person || '—')} · ${fmtArea(r.area_sqm)} · ${escapeHtml(r.verification_state || '—')}</div><div class="timeline-note">${escapeHtml(r.event_note)}</div></div>`).join('')}</div>`);
  }
  function renderDocuments(pid) {
    const rows = rowsFor('documents',pid);
    if (!rows.length) return empty('No document references supplied for this parcel.');
    return section('Document references',rows.map(r=>kv([['Source',r.source_name],['Reference',r.reference],['Verification',r.verification_status]])).join(''));
  }
  function renderPanel() {
    const pid = state.selectedParcel, parcel = parcels.get(pid);
    if (!parcel) return;
    $('panelParcelId').textContent = pid; $('panelParcelName').textContent = parcel.name || '';
    document.querySelectorAll('.panel-tab').forEach(tab=>tab.classList.toggle('is-active',tab.dataset.tab===state.activeTab));
    const lifecycle=document.querySelector('.temporal-panel');if(lifecycle)document.querySelector('.layer-sidebar').append(lifecycle);
    const renderers = {overview:renderOverview,sources:renderSources,conflicts:renderConflicts,evidence:id=>window.PRAMAN_MAP?.evidence?.renderDecisionSupport(id)||empty('No evidence supplied.'),lineage:()=>'<div id="lifecycleMount"></div>',history:renderHistory,documents:renderDocuments};
    panelContent.innerHTML = '<p id="temporalPanelContext" class="temporal-panel-context"></p>'+renderers[state.activeTab](pid);
    if(state.activeTab==='lineage'&&lifecycle)$('lifecycleMount').append(lifecycle);
    updateTemporalPanelContext();
  }
  function updateTemporalPanelContext(){const n=$('temporalPanelContext');if(!n)return;const t=window.PRAMAN_MAP?.temporal?.getState();n.textContent=t&&(t.point!=='current'||t.playback)?'Historical/event map context. Attributes below are the stored dataset record, not a reconstructed historical owner or building snapshot.':'';n.hidden=!n.textContent;}
  window.addEventListener('praman-temporal-state',updateTemporalPanelContext);
  function renderAll() { renderLayerControls(); renderLayerStack(); renderMapState(); boundaryModeButton.disabled = !window.PRAMAN_MAP?.evidence||!state.selectedParcel; }

  document.querySelectorAll('.panel-tab').forEach(tab=>tab.addEventListener('click',()=>{state.activeTab=tab.dataset.tab;renderPanel();}));
  $('closePanelButton').addEventListener('click',closePanel);
  panelScrim.addEventListener('click',closePanel);
  $('openSelectedButton').addEventListener('click',openPanel);
  $('clearLayersButton').addEventListener('click',()=>{state.activeOrder=[];state.boundaryMode=false;renderAll();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel();});
  // Stable, renderer-independent API. Records and state are returned as copies.
  window.PRAMAN_SPATIAL_VIEW = {
    loadDataset, selectParcel, toggleLayer,
    openTab:tab=>{if(!['overview','sources','conflicts','evidence','history','lineage','documents'].includes(tab))return;state.activeTab=tab;openPanel();},
    refreshPanel:()=>{if(parcelPanel.classList.contains('is-open'))renderPanel();},
    configureEvidenceLayers:families=>{const canonical=LAYERS.find(l=>l.id==='canonical'),buildings=LAYERS.find(l=>l.id==='buildings');LAYERS.splice(0,LAYERS.length,canonical,buildings,...families);state.activeOrder=state.activeOrder.filter(id=>LAYERS.some(l=>l.id===id));for(const id of requested)if(LAYERS.some(l=>l.id===id)&&!state.activeOrder.includes(id))state.activeOrder.push(id);renderAll();},
    clearSelection:()=>{state.selectedParcel=null;$('railSelectedParcel').textContent='None';$('railSelectedConflict').textContent='No parcel selected';$('openSelectedButton').disabled=true;closePanel();renderAll();},
    getState:()=>({...state,activeOrder:[...state.activeOrder],rendererReady:rendererStatus.state==='ready'}),
    getData:()=>structuredClone(DATA),
    getVisibleParcelIds:()=>{const map=window.PRAMAN_MAP;if(map?.temporal)return map.temporal.getVisibleParcelIds();return map?.fabric&&state.activeOrder.includes('canonical')?[...map.fabric.parcelObjects].filter(([,p])=>!map.city||map.fabric.cellGroups.get(p.cellId)?.visible).map(([id])=>id):[];},
    getGeometry:(pid,sourceId)=>structuredClone(sourceId ? rowsFor('sources',pid).filter(r=>r.source_id===sourceId && r.geometry).map(r=>({geometry:r.geometry,crs:r.crs,provenance:r.provenance})) : parcels.get(pid)?.geometry || null)
  };
  closePanel(); renderDatasetSummary(); renderAll();
})();
