import { loadEvidenceGraphDataLayer } from '../data/loaders/browser.mjs';
import { createEvidenceReplayController, REPLAY_STAGES, buildAdapterProcessingModels, buildNormalizationObservationModel, buildMatchingObservationModel, buildConflictInspectionModel, buildAuthorityInspectionModel, buildAuthoritativeCanonicalStateModel, buildCanonicalParcelTraceModel, buildParcelSearchIndex, buildParcelHistoryLineageModel, buildExplorationFilterCatalog, normalizeExplorationFilters, hasActiveExplorationFilters, HISTORY_ARCHITECTURE_PRINCIPLE, AUTHORITY_PRINCIPLE, CANONICAL_TRACE_PRINCIPLE } from '../replay/index.mjs';
import { EvidenceGraphRenderer } from './EvidenceGraphRenderer.mjs';
import { buildContextualDashboardActions, buildEvidenceGraphState, mergeDashboardPaths, readEvidenceGraphStateFromUrl, resolveEvidenceNodeContext, writeEvidenceGraphStateToUrl } from '../integration/dashboardLinks.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = new Intl.NumberFormat('en-IN');

function injectStylesheet(href) {
  if (!href || document.querySelector(`link[data-praman-evidence-style="${CSS.escape(href)}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href; link.dataset.pramanEvidenceStyle = href; document.head.append(link);
}

function template() {
  return `
    <section class="praman-evidence-graph" aria-labelledby="evidence-graph-title">
      <div class="eg-loading" data-role="loading" aria-live="polite">
        <div class="eg-loading-panel"><span class="eg-loading-mark" aria-hidden="true"></span><strong>Loading PRAMAN evidence</strong><span>Linking source, reconciliation and history records…</span></div>
      </div>
      <header class="eg-header">
        <div class="eg-heading-group">
          <span class="eg-kicker">PRAMAN · TRACEABILITY</span>
          <h1 class="eg-title" id="evidence-graph-title">Evidence Graph</h1>
          <p class="eg-subtitle">Trace how heterogeneous source evidence became reconciled canonical parcels.</p>
        </div>
        <div class="eg-health" data-role="health" data-state="loading" aria-live="polite">
          <span class="eg-health-dot" aria-hidden="true"></span><span data-role="health-text">Loading dataset</span>
        </div>
      </header>

      <div class="eg-control-zone" aria-label="Evidence Graph controls">
        <div class="eg-actions">
          <button class="eg-button eg-button--primary" type="button" data-role="replay" hidden disabled>REPLAY RECONCILIATION</button>
          <button class="eg-button eg-button--secondary" type="button" data-role="search-toggle" disabled>SEARCH PARCEL</button>
          <button class="eg-button eg-button--parcel" type="button" data-role="replay-parcel" hidden disabled>REPLAY THIS PARCEL</button>
          <button class="eg-button eg-button--secondary" type="button" data-role="filter-toggle" disabled>FILTERS</button>
          <span class="eg-filter-indicator" data-role="filter-indicator" hidden></span>
          <form class="eg-search-wrap" data-role="search-form" data-open="false" autocomplete="off">
            <input class="eg-search-input" data-role="search-input" aria-label="Canonical or source parcel ID" placeholder="Canonical or source parcel ID" list="praman-evidence-parcel-options" />
            <datalist id="praman-evidence-parcel-options" data-role="parcel-options"></datalist>
            <button class="eg-button" type="submit">TRACE</button>
            <span class="eg-search-message" data-role="search-message" aria-live="polite"></span>
          </form>
        </div>
        <div class="eg-run-summary" data-role="summary" aria-label="Dataset-derived reconciliation run summary"></div>
      </div>
      <div class="eg-filter-panel" data-role="filter-panel" data-open="false" aria-hidden="true"></div>

      <div class="eg-replay-bar" data-role="replay-controls" data-open="false" aria-hidden="true">
        <div class="eg-transport" role="group" aria-label="Lifecycle playback controls">
          <button type="button" class="eg-icon-button eg-icon-button--accent" data-role="play" title="Resume lifecycle">▶ <span>Resume</span></button>
          <button type="button" class="eg-icon-button" data-role="pause" title="Pause lifecycle">Ⅱ <span>Pause</span></button>
        </div>
        <div class="eg-lifecycle-readout">
          <span class="eg-playback-state" data-role="playback-state">IDLE</span>
          <strong data-role="operation-name">Sources</strong>
          <span class="eg-operation-description" data-role="operation-description"></span>
        </div>
        <label class="eg-speed">Speed
          <select data-role="speed" aria-label="Playback speed">
            <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option>
          </select>
        </label>
      </div>

      <div class="eg-workspace">
        <div class="eg-canvas" data-role="canvas" aria-label="Evidence visualization canvas">
          <div class="eg-graph-root" data-role="graph-root" hidden></div>
          <div class="eg-empty-state" data-role="empty-state">
            <button class="eg-lifecycle-play" type="button" data-role="lifecycle-play" disabled>
              <span class="eg-lifecycle-play-icon" aria-hidden="true">▶</span>
              <span>PLAY FULL RECONCILIATION LIFECYCLE</span>
            </button>
            <div class="eg-empty-title" data-role="empty-title">Watch PRAMAN turn source evidence into authoritative canonical parcels</div>
            <div class="eg-empty-copy" data-role="empty-copy">Start the dataset-backed lifecycle, or search for a parcel to inspect its evidence trace.</div>
            <div class="eg-selection" data-role="selection"></div>
          </div>
        </div>
        <aside class="eg-drawer" data-role="drawer" data-open="false" aria-hidden="true"></aside>
      </div>
    </section>`;
}

function summaryMarkup(summary) {
  const stats = [
    ['source datasets', summary.sources], ['source observations', summary.sourceObservations],
    ['active canonical parcels', summary.canonicalParcels], ['detected conflicts', summary.conflicts?.total ?? 0]
  ];
  return stats.map(([label, value]) => `<div class="eg-stat"><span class="eg-stat-value">${fmt.format(Number(value) || 0)}</span><span class="eg-stat-label">${esc(label)}</span></div>`).join('');
}


function selectOptions(options, selected) {
  return (options || []).map((option) => `<option value="${esc(option.value)}"${String(option.value) === String(selected || '') ? ' selected' : ''}>${esc(option.label)}${Number.isFinite(Number(option.count)) ? ` (${fmt.format(Number(option.count))})` : ''}</option>`).join('');
}

function filterPanelMarkup(catalog, filters = {}) {
  const f = normalizeExplorationFilters(filters);
  const field = (label, role, options, value) => `<label class="eg-filter-field"><span>${esc(label)}</span><select data-filter-key="${esc(role)}"><option value="">All</option>${selectOptions(options, value)}</select></label>`;
  return `<div class="eg-filter-panel-inner">
    <div class="eg-filter-panel-head"><div><strong>Explore a dataset-backed subset</strong><span>Filters reduce displayed evidence while retaining connector nodes required to understand the remaining trace.</span></div><button type="button" class="eg-button eg-button--secondary" data-role="clear-filters">Clear Filters</button></div>
    <div class="eg-filter-grid">
      ${field('Source dataset', 'sourceId', catalog.sources, f.sourceId)}
      ${field('Cell / spatial region', 'cellId', catalog.cells, f.cellId)}
      ${field('Match status', 'matchStatus', catalog.matchStatuses, f.matchStatus)}
      ${field('Conflict type', 'conflictType', catalog.conflictTypes, f.conflictType)}
      ${field('Conflict state', 'conflictStatus', catalog.conflictStatuses, f.conflictStatus)}
      ${field('Authority state', 'authorityStatus', catalog.authorityStatuses, f.authorityStatus)}
      ${field('Human-review flag', 'reviewStatus', catalog.reviewStatuses, f.reviewStatus)}
      ${field('Current / historical', 'recordStatus', catalog.recordStatuses, f.recordStatus)}
      ${field('Lineage relationship', 'lineageType', catalog.lineageTypes, f.lineageType)}
      <label class="eg-filter-check"><input type="checkbox" data-filter-key="unresolvedOnly"${f.unresolvedOnly ? ' checked' : ''}/><span>Unresolved cases only <small>${fmt.format(Number(catalog.unresolvedCount) || 0)} parcels</small></span></label>
    </div>
  </div>`;
}

function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function contextualActionsMarkup(actions = []) {
  if (!actions.length) return '';
  return `<nav class="eg-context-actions" aria-label="Related PRAMAN dashboards">
    <span class="eg-context-actions-label">Continue in PRAMAN</span>
    <div class="eg-context-actions-list">${actions.map((action) => `<a class="eg-context-action" href="${esc(action.href)}" data-role="context-action" data-action-id="${esc(action.id)}">${esc(action.label)}</a>`).join('')}</div>
  </nav>`;
}

function sourceInspectorMarkup(node, layer) {
  const details = node.data?.details ?? {};
  const source = layer.tables.sourceMetadata.find((row) => row.source_id === node.sourceId || row.source_id === node.datasetRecordId) ?? null;
  const sourceType = source?.source_type ?? details.sourceType ?? null;
  const schema = layer.tables.sourceSchema.find((row) => row.source_type === sourceType) ?? null;
  const allSourceObservations = layer.tables.sourceObservations.filter((row) => row.source_type === sourceType);
  const contributingIds = new Set(node.data?.contributingObservationIds ?? []);
  const filteredIds = new Set(node.data?.filteredMemberCount != null ? (node.memberRecordIds ?? []) : []);
  const observations = node.data?.parcelMode && contributingIds.size
    ? allSourceObservations.filter((row) => contributingIds.has(row.observation_id))
    : filteredIds.size ? allSourceObservations.filter((row) => filteredIds.has(row.observation_id)) : allSourceObservations;
  const recordScopeLabel = node.data?.parcelMode ? 'contributing source observations for this parcel' : filteredIds.size ? 'source observations in the filtered subset' : 'source observations';
  const dates = observations.map((row) => row.observation_date).filter(Boolean).sort();
  const dateRange = dates.length ? (dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} → ${dates.at(-1)}`) : '—';
  const requiredKeys = String(schema?.required_keys ?? '').split(';').map((v) => v.trim()).filter(Boolean);
  const sourceKeys = String(schema?.source_specific_keys ?? '').split(';').map((v) => v.trim()).filter(Boolean);
  const lifecycleFields = String(schema?.lifecycle_metadata_fields ?? '').split(';').map((v) => v.trim()).filter(Boolean);
  const spatialNature = details.spatialNature ?? '—';
  const spatialCoverage = details.spatialCoveragePercent == null ? '—' : `${details.spatialObservationCount ?? 0} / ${observations.length} observations (${details.spatialCoveragePercent}%)`;
  const reliability = source?.reliability ? `${source.reliability} / 1.00` : '—';
  const adapterRoutes = buildAdapterProcessingModels(layer).filter((model) => model.active && model.sourceTypes.includes(sourceType));
  const adapterNames = adapterRoutes.map((model) => model.adapterName);
  const adapterText = adapterNames.length
    ? `Project-architecture routing sends this source through ${adapterNames.join(', ')}. No execution identity recorded in the supplied dataset; this is architecture routing rather than an execution log.`
    : 'No active adapter route is defined for this source in the current run.';
  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">SOURCE DATASET</span><h2>${esc(source?.source_name || node.label || node.datasetRecordId)}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">${esc(sourceType || '')}</p>
    <section class="eg-inspector-section">
      <h3>Original dataset</h3>
      <dl class="eg-inspector-list">
        <div><dt>Source ID</dt><dd>${esc(source?.source_id || node.sourceId || '—')}</dd></div>
        <div><dt>Dataset</dt><dd>${esc(source?.source_name || node.label || '—')}</dd></div>
        <div><dt>Raw source file</dt><dd>Not supplied</dd></div>
        <div><dt>Authority</dt><dd>${esc(source?.authority || '—')}</dd></div>
        <div><dt>Records</dt><dd><strong>${fmt.format(observations.length)}</strong> ${esc(recordScopeLabel)}</dd></div>
        <div><dt>Nature</dt><dd>${esc(spatialNature)}</dd></div>
        <div><dt>Spatial coverage</dt><dd>${esc(spatialCoverage)}</dd></div>
      </dl>
    </section>
    <section class="eg-inspector-section">
      <h3>Schema</h3>
      <p class="eg-inspector-copy">${esc(schema?.purpose || 'No source-specific schema profile is present.')}</p>
      <dl class="eg-inspector-list">
        <div><dt>Required fields</dt><dd>${requiredKeys.length ? requiredKeys.map(esc).join(', ') : '—'}</dd></div>
        <div><dt>Source fields</dt><dd>${sourceKeys.length ? sourceKeys.map(esc).join(', ') : '—'}</dd></div>
        <div><dt>Lifecycle metadata</dt><dd>${lifecycleFields.length ? lifecycleFields.map(esc).join(', ') : '—'}</dd></div>
      </dl>
    </section>
    <section class="eg-inspector-section">
      <h3>Quality & reference</h3>
      <dl class="eg-inspector-list">
        <div><dt>Reliability</dt><dd>${esc(reliability)}</dd></div>
        <div><dt>Nominal accuracy</dt><dd>${esc(valueOrDash(source?.nominal_accuracy))}</dd></div>
        <div><dt>CRS</dt><dd>${esc(valueOrDash(source?.CRS))}</dd></div>
      </dl>
    </section>
    <section class="eg-inspector-section">
      <h3>Adapter / processing</h3>
      <p class="eg-inspector-copy">${esc(adapterText)}</p>
      <dl class="eg-inspector-list"><div><dt>Adapter(s)</dt><dd>${adapterNames.length ? adapterNames.map(esc).join(', ') : 'No active route'}</dd></div><div><dt>Execution identity</dt><dd>Not recorded in supplied dataset</dd></div>${schema ? `<div><dt>Processing profile</dt><dd>${esc(schema.source_type)} schema profile</dd></div>` : ''}</dl>
    </section>
    <section class="eg-inspector-section">
      <h3>Time & version metadata</h3>
      <dl class="eg-inspector-list">
        <div><dt>Acquisition</dt><dd>${esc(valueOrDash(source?.acquisition_date))}</dd></div>
        <div><dt>Observation dates</dt><dd>${esc(dateRange)}</dd></div>
        <div><dt>Temporal currency</dt><dd>${esc(valueOrDash(source?.temporal_currency))}</dd></div>
        <div><dt>Update frequency</dt><dd>${esc(valueOrDash(source?.update_frequency))}</dd></div>
        <div><dt>Dataset version</dt><dd>Not supplied</dd></div>
      </dl>
    </section>`;
}

function formatCountMap(value) {
  const entries = Object.entries(value ?? {}).filter(([, count]) => Number(count) > 0);
  return entries.length ? entries.map(([key, count]) => `${key.replaceAll('_', ' ')}: ${fmt.format(Number(count))}`).join(' · ') : 'None recorded';
}

function adapterInspectorMarkup(node) {
  const details = node.data?.details ?? {};
  const sources = Array.isArray(details.sources) ? details.sources : [];
  const transformations = Array.isArray(details.transformations) ? details.transformations : [];
  const outputCoverage = details.outputCoveragePercent == null ? '—' : `${details.outputCoveragePercent}%`;
  const warningText = formatCountMap(details.qualityWarningFlags);
  const statusText = formatCountMap(details.observationStatusCounts);
  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">ADAPTER PROCESSING</span><h2>${esc(details.adapterName || node.label || node.datasetRecordId)}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">Conceptual PRAMAN adapter · active in the current dataset route</p>
    <section class="eg-inspector-section">
      <h3>Current run</h3>
      <dl class="eg-inspector-list">
        <div><dt>Sources using it</dt><dd>${fmt.format(Number(details.sourceCount) || 0)}</dd></div>
        <div><dt>Records processed</dt><dd><strong>${fmt.format(Number(details.recordsProcessed) || 0)}</strong> routed source observations</dd></div>
        <div><dt>Successful outputs</dt><dd><strong>${fmt.format(Number(details.successfulOutputs) || 0)}</strong> normalized/pre-match rows available</dd></div>
        <div><dt>Output coverage</dt><dd>${esc(outputCoverage)}</dd></div>
        <div><dt>Execution log</dt><dd>Not recorded in supplied dataset</dd></div>
      </dl>
      <p class="eg-inspector-copy">${esc(details.caveat || '')}</p>
    </section>
    <section class="eg-inspector-section">
      <h3>INPUT</h3>
      <p class="eg-inspector-copy">${esc(details.input || '')}</p>
      <div class="eg-adapter-source-list">
        ${sources.map((source) => `<div class="eg-adapter-source-row"><div><strong>${esc(source.sourceName)}</strong><span>${esc(source.sourceType)}</span></div><div><strong>${fmt.format(Number(source.observationCount) || 0)}</strong><span>source observations</span></div><div><strong>${fmt.format(Number(source.normalizedOutputCount) || 0)}</strong><span>normalized outputs</span></div></div>`).join('') || '<p class="eg-inspector-copy">No current source dataset is routed through this adapter.</p>'}
      </div>
    </section>
    <section class="eg-inspector-section">
      <h3>PROCESSING</h3>
      <p class="eg-inspector-copy">${esc(details.processing || '')}</p>
      <ul class="eg-transform-list">${transformations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    </section>
    <section class="eg-inspector-section">
      <h3>OUTPUT</h3>
      <p class="eg-inspector-copy">${esc(details.output || '')}</p>
      <dl class="eg-inspector-list">
        <div><dt>Available output</dt><dd>MATCHING_INPUT_VIEW normalized/pre-match observations</dd></div>
        <div><dt>Successful outputs</dt><dd>${fmt.format(Number(details.successfulOutputs) || 0)}</dd></div>
        <div><dt>Success semantics</dt><dd>Corresponding normalized row exists for the routed source observation; this is not a logged adapter-run result.</dd></div>
      </dl>
    </section>
    <section class="eg-inspector-section">
      <h3>Quality / warnings</h3>
      <dl class="eg-inspector-list">
        <div><dt>Geometry QC flags</dt><dd>${fmt.format(Number(details.qualityWarningCount) || 0)} warning-flagged source geometries</dd></div>
        <div><dt>Warning flags</dt><dd>${esc(warningText)}</dd></div>
        <div><dt>Record statuses</dt><dd>${esc(statusText)}</dd></div>
        <div><dt>Quarantine</dt><dd>${esc(details.quarantineNote || 'No adapter-level quarantine information is available.')}</dd></div>
      </dl>
    </section>`;
}

function compactValue(value, max = 520) {
  if (value === null || value === undefined || value === '') return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizationObservationMarkup(model) {
  if (!model?.found) return '<p class="eg-inspector-copy eg-inspector-error">Observation not found in MATCHING_INPUT_VIEW.</p>';
  const before = model.before ?? {};
  const normalized = model.normalized ?? {};
  const record = normalized.record ?? {};
  const geometry = normalized.geometry ?? {};
  return `
    <section class="eg-inspector-section eg-normalization-observation" data-role="normalization-observation-detail">
      <h3>Observation ${esc(model.observationId)}</h3>
      <div class="eg-normalization-flow">
        <div class="eg-normalization-panel">
          <span class="eg-normalization-step">BEFORE · AVAILABLE SOURCE STATE</span>
          <dl class="eg-inspector-list">
            <div><dt>Source record</dt><dd>${esc(valueOrDash(before.sourceRecordId))}</dd></div>
            <div><dt>Source parcel</dt><dd>${esc(valueOrDash(before.sourceParcelId))}</dd></div>
            <div><dt>Observation date</dt><dd>${esc(valueOrDash(before.observationDate))}</dd></div>
            <div><dt>Original CRS</dt><dd>${esc(valueOrDash(before.geometry?.crs))}</dd></div>
            <div><dt>Original geometry</dt><dd class="eg-code-value">${esc(compactValue(before.geometry?.wkt, 300))}</dd></div>
            <div><dt>Source-specific fields</dt><dd class="eg-code-value">${esc(compactValue(before.sourceSpecificDetails, 360))}</dd></div>
          </dl>
          <p class="eg-inspector-copy">${esc(before.availability || '')}</p>
        </div>
        <div class="eg-normalization-arrow" aria-hidden="true">↓</div>
        <div class="eg-normalization-panel">
          <span class="eg-normalization-step">APPLIED / REPRESENTED TRANSFORMATIONS</span>
          <div class="eg-normalization-transformations">
            ${(model.transformations ?? []).map((item) => `
              <article class="eg-normalization-transform">
                <strong>${esc(item.label)}</strong>
                <span>${item.changed === true ? 'Value changed' : item.changed === false ? 'Representation already compatible' : 'Transformation metadata / preservation rule'}</span>
                <p>${esc(item.method || '')}</p>
                <small>${esc(item.evidence || '')}</small>
              </article>`).join('')}
          </div>
        </div>
        <div class="eg-normalization-arrow" aria-hidden="true">↓</div>
        <div class="eg-normalization-panel">
          <span class="eg-normalization-step">NORMALIZED REPRESENTATION</span>
          <dl class="eg-inspector-list">
            <div><dt>Observation ID</dt><dd>${esc(model.observationId)}</dd></div>
            <div><dt>Source namespace</dt><dd>${esc(valueOrDash(normalized.namespace?.displayKey))}</dd></div>
            <div><dt>Owner</dt><dd>${esc(valueOrDash(record.owner_name))}</dd></div>
            <div><dt>Address</dt><dd>${esc(valueOrDash(record.address))}</dd></div>
            <div><dt>Land use</dt><dd>${esc(valueOrDash(record.land_use))}</dd></div>
            <div><dt>Observed area</dt><dd>${esc(valueOrDash(record.observedArea ?? record.observed_area))} sqm</dd></div>
            <div><dt>Normalized CRS</dt><dd>${esc(valueOrDash(geometry.crs))}</dd></div>
            <div><dt>Normalized geometry</dt><dd class="eg-code-value">${esc(compactValue(geometry.wkt, 300))}</dd></div>
            <div><dt>Positional accuracy</dt><dd>${esc(valueOrDash(record.positionalAccuracyM ?? record.positional_accuracy_m))} m</dd></div>
            <div><dt>Geometry quality</dt><dd>${esc(valueOrDash(geometry.qualityFlag))}</dd></div>
          </dl>
          <p class="eg-preservation-note"><strong>Source state preserved.</strong> The normalized row retains the source record ID, source type, geometry provenance and the same observation ID; it does not replace the original evidence.</p>
        </div>
      </div>
    </section>`;
}

function normalizationInspectorMarkup(node, layer, requestedObservationId = null) {
  const details = node.data?.details ?? {};
  const ids = node.memberRecordIds ?? details.normalizedObservationIds ?? [];
  const isAggregate = Boolean(node.data?.normalizationSpace || node.aggregate);
  if (!isAggregate && node.datasetRecordId) {
    const model = buildNormalizationObservationModel(layer, node.datasetRecordId);
    return `
      <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">GLOBAL NORMALIZATION</span><h2>${esc(node.datasetRecordId)}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
      <p class="eg-drawer-subtitle">Before → applied transformations → normalized representation</p>
      ${normalizationObservationMarkup(model)}`;
  }

  const selectedId = requestedObservationId && ids.includes(requestedObservationId) ? requestedObservationId : null;
  const selectedModel = selectedId ? buildNormalizationObservationModel(layer, selectedId) : null;
  const sources = Array.isArray(details.sources) ? details.sources : [];
  const dimensions = Array.isArray(details.dimensions) ? details.dimensions : [];
  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">GLOBAL NORMALIZATION</span><h2>${esc(details.label || node.label || 'PRAMAN Normalized Evidence Space')}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">Comparable evidence space · original source provenance remains available</p>
    <section class="eg-inspector-section">
      <h3>Normalized evidence space</h3>
      <dl class="eg-inspector-list">
        <div><dt>Normalized observations</dt><dd><strong>${fmt.format(Number(details.normalizedObservationCount) || 0)}</strong></dd></div>
        <div><dt>Source-ID coverage</dt><dd>${fmt.format(Number(details.sourceObservationCoverageCount) || 0)} / ${fmt.format(Number(details.normalizedObservationCount) || 0)} observation IDs preserved</dd></div>
        <div><dt>Source datasets</dt><dd>${fmt.format(Number(details.sourceDatasetCount) || 0)}</dd></div>
        <div><dt>CRS changed</dt><dd>${fmt.format(Number(details.crsChangedObservationCount) || 0)} observations</dd></div>
        <div><dt>Geometry representation changed</dt><dd>${fmt.format(Number(details.geometryChangedObservationCount) || 0)} observations</dd></div>
        <div><dt>Normalized CRS distribution</dt><dd>${esc(formatCountMap(details.normalizedCrsDistribution))}</dd></div>
        <div><dt>Geometry QC</dt><dd>${esc(formatCountMap(details.geometryQualityFlags))}</dd></div>
      </dl>
      <p class="eg-preservation-note"><strong>Source state is not deleted.</strong> ${esc(details.preservation?.identityRule || '')}</p>
    </section>
    <section class="eg-inspector-section">
      <h3>What becomes comparable</h3>
      <div class="eg-normalization-dimensions">
        ${dimensions.map((item) => `<div><strong>${esc(item.label)}</strong><span>${esc(item.evidence)}</span></div>`).join('')}
      </div>
      <p class="eg-inspector-copy">${esc(details.preservation?.rawSourceRecordNote || '')}</p>
    </section>
    <section class="eg-inspector-section">
      <h3>Source coverage</h3>
      <div class="eg-normalization-source-list">
        ${sources.map((source) => `<div><span>${esc(source.sourceName)}</span><strong>${fmt.format(Number(source.normalizedObservationCount) || 0)}</strong><small>${esc(source.sourceType)}</small></div>`).join('')}
      </div>
    </section>
    <section class="eg-inspector-section">
      <h3>Inspect one observation</h3>
      <form class="eg-normalization-search" data-role="normalization-observation-form">
        <input type="text" data-role="normalization-observation-input" placeholder="${esc(ids[0] || 'Observation ID')}" value="${esc(selectedId || '')}" aria-label="Normalized observation ID" />
        <button type="submit">INSPECT</button>
      </form>
      <p class="eg-inspector-copy" data-role="normalization-observation-message">Choose one of the ${fmt.format(ids.length)} real normalized observation IDs represented by this node.</p>
      ${selectedModel ? normalizationObservationMarkup(selectedModel) : '<div data-role="normalization-observation-detail"></div>'}
    </section>`;
}


function matchingEvidenceRows(model) {
  const evidence = model?.evidence ?? {};
  const primary = evidence.area?.primaryCandidateComparison;
  const areaText = primary
    ? `${valueOrDash(primary.observedAreaSqm)} m² observed → ${valueOrDash(primary.candidateAreaSqm)} m² candidate${primary.areaDeltaPercent == null ? '' : ` · ${primary.areaDeltaPercent.toFixed(2)}% delta (derived inspection value)`}`
    : 'No candidate-area comparison available.';
  const distortion = evidence.distortion ?? {};
  const recordedNarrative = [distortion.observationNotes, distortion.parcelCriticalityReason].filter(Boolean);
  return `
    <div class="eg-matching-evidence-grid">
      <div><strong>Geometry relationship</strong><span>geometry confidence ${valueOrDash(evidence.geometry?.geometryConfidence)} · QC ${esc(valueOrDash(evidence.geometry?.geometryQualityFlag))} · positional accuracy ${valueOrDash(evidence.geometry?.positionalAccuracyM)} m</span><small>No pair-specific geometry relation class is stored.</small></div>
      <div><strong>Area comparison</strong><span>${esc(areaText)}</span><small>This is not a recorded classifier similarity score.</small></div>
      <div><strong>Identifier evidence</strong><span>identifier confidence ${valueOrDash(evidence.identifier?.identifierConfidence)} · source parcel ${esc(valueOrDash(evidence.identifier?.sourceParcelId))}</span></div>
      <div><strong>Temporal compatibility</strong><span>freshness ${valueOrDash(evidence.temporal?.temporalFreshness)} · observation ${esc(valueOrDash(evidence.temporal?.observationDate))}</span><small>No pairwise temporal score is stored.</small></div>
      <div><strong>Source quality</strong><span>reliability ${valueOrDash(evidence.sourceQuality?.sourceReliability)} · authority ${esc(valueOrDash(evidence.sourceQuality?.authority))} · nominal accuracy ${esc(valueOrDash(evidence.sourceQuality?.nominalAccuracy))}</span></div>
      <div><strong>Uncertainty</strong><span>positional accuracy ${valueOrDash(evidence.uncertainty?.positionalAccuracyM)} m · geometry confidence ${valueOrDash(evidence.uncertainty?.geometryConfidence)}</span><small>No covariance matrix is stored.</small></div>
      <div><strong>Neighbourhood / adjacency</strong><span>${esc(evidence.neighbourhoodAdjacency?.reason || 'Unavailable')}</span></div>
      <div><strong>Topology</strong><span>${esc(evidence.topology?.reason || 'Unavailable')}</span></div>
      <div class="eg-matching-distortion-detail"><strong>Recorded notes / criticality context</strong><span>${recordedNarrative.length ? recordedNarrative.map(esc).join(' · ') : 'No observation note or parcel criticality reason is recorded.'}</span><small>No structured distortion-model output is stored; narrative text is shown verbatim as context and is not reclassified.</small></div>
    </div>`;
}

function matchingObservationMarkup(model) {
  if (!model?.found) return '<p class="eg-inspector-copy eg-inspector-error">Observation not found in SOURCE_OBSERVATIONS.</p>';
  const candidateRows = model.candidates ?? [];
  return `
    <section class="eg-inspector-section eg-matching-observation" data-role="matching-observation-detail">
      <h3>Observation ${esc(model.observationId)}</h3>
      <dl class="eg-inspector-list">
        <div><dt>Source dataset</dt><dd>${esc(valueOrDash(model.source?.sourceName))}</dd></div>
        <div><dt>Source type</dt><dd>${esc(valueOrDash(model.source?.sourceType))}</dd></div>
        <div><dt>Source record</dt><dd>${esc(valueOrDash(model.source?.sourceRecordId))}</dd></div>
        <div><dt>Primary candidate</dt><dd>${esc(valueOrDash(candidateRows.find((row) => row.role === 'PRIMARY')?.parcelId))}</dd></div>
        <div><dt>Alternate candidates</dt><dd>${candidateRows.filter((row) => row.role === 'ALTERNATE').length}</dd></div>
      </dl>
      <div class="eg-matching-candidate-list">
        ${candidateRows.map((candidate) => `
          <div class="eg-matching-candidate-row" data-role="${esc(candidate.role)}">
            <span class="eg-matching-candidate-role">${esc(candidate.role)}</span>
            <strong>${esc(candidate.parcelId)}</strong>
            <span>${esc(valueOrDash(candidate.matchStatus))}${candidate.outcomeGroup ? ` · ${esc(candidate.outcomeGroup)}` : ''}</span>
            <small>Pair score: unavailable · pair-edge decision: unavailable${candidate.areaDeltaPercent == null ? '' : ` · area delta ${candidate.areaDeltaPercent.toFixed(2)}% (derived)`}</small>
          </div>`).join('')}
      </div>
      <h3 class="eg-subsection-heading">Recorded evidence dimensions</h3>
      ${matchingEvidenceRows(model)}
    </section>`;
}

function formatStatusCounts(counts) {
  const entries = Object.entries(counts ?? {});
  return entries.length ? entries.map(([key, value]) => `${key.replaceAll('_', ' ')}: ${fmt.format(Number(value) || 0)}`).join(' · ') : '—';
}

function matchingInspectorMarkup(node, layer, requestedObservationId = null) {
  const details = node.data?.details ?? {};
  const role = node.data?.matchingRole ?? '';
  let observationIds = [];
  if (role === 'candidate-generation') observationIds = [...new Set(node.memberRecordIds ?? [])];
  else if (role === 'candidate') observationIds = node.data?.observationId ? [node.data.observationId] : [];
  else if (role === 'recorded-evidence') observationIds = node.memberRecordIds ?? [];

  const selectedId = requestedObservationId && observationIds.includes(requestedObservationId) ? requestedObservationId : null;
  const selectedModel = selectedId ? buildMatchingObservationModel(layer, selectedId) : null;
  const phaseLabel = {
    'candidate-generation': 'CANDIDATE GENERATION',
    'candidate': 'MATCH CANDIDATE',
    'recorded-evidence': 'RECORDED MATCHING EVIDENCE',
    'recorded-outcomes': 'RECORDED PARCEL MATCH OUTCOMES',
    'outcome-group': 'MATCH OUTCOME'
  }[role] || 'DISTORTION-AWARE MATCHING';

  let phaseBody = '';
  if (role === 'candidate') {
    phaseBody = `
      <dl class="eg-inspector-list">
        <div><dt>Observation</dt><dd>${esc(node.data?.observationId || '—')}</dd></div>
        <div><dt>Candidate parcel</dt><dd>${esc(node.data?.candidateParcelId || node.canonicalParcelId || '—')}</dd></div>
        <div><dt>Candidate role</dt><dd>${esc(node.data?.role || '—')}</dd></div>
        <div><dt>Per-candidate score</dt><dd>Not stored</dd></div>
        <div><dt>Pair-edge decision</dt><dd>Not stored</dd></div>
      </dl>`;
  } else if (role === 'candidate-generation') {
    phaseBody = `
      <dl class="eg-inspector-list">
        <div><dt>Primary associations</dt><dd>${fmt.format(Number(details.primaryCandidates) || 0)}</dd></div>
        <div><dt>Alternate associations</dt><dd>${fmt.format(Number(details.alternateCandidates) || 0)}</dd></div>
        <div><dt>Observations with alternates</dt><dd>${fmt.format(Number(details.observationsWithAlternates) || 0)}</dd></div>
        <div><dt>Per-candidate score</dt><dd>Not stored</dd></div>
        <div><dt>Pair-edge decision</dt><dd>Not stored</dd></div>
      </dl>`;
  } else if (role === 'recorded-evidence') {
    const dimensions = details.evidenceDimensions ?? [];
    phaseBody = `<div class="eg-matching-dimensions">${dimensions.map((dimension) => `<div data-available="${dimension.available ? 'true' : 'false'}"><strong>${esc(dimension.label)}</strong><span>${esc(dimension.available ? dimension.evidence : dimension.limitation)}</span>${dimension.available && dimension.limitation ? `<small>${esc(dimension.limitation)}</small>` : ''}</div>`).join('')}</div>`;
  } else if (role === 'recorded-outcomes') {
    phaseBody = `
      <dl class="eg-inspector-list">
        <div><dt>Recorded parcel outcomes</dt><dd>${fmt.format(Number(node.metric?.value) || Number(node.count) || 0)}</dd></div>
        <div><dt>match_status distribution</dt><dd>${esc(formatStatusCounts(details.matchStatusCounts))}</dd></div>
        <div><dt>Solver cost/objective</dt><dd>Not stored</dd></div>
        <div><dt>Veto flags</dt><dd>Not stored</dd></div>
        <div><dt>Pairwise chosen-edge log</dt><dd>Not stored</dd></div>
      </dl>`;
  } else if (role === 'outcome-group') {
    phaseBody = `
      <dl class="eg-inspector-list">
        <div><dt>Outcome group</dt><dd>${esc(details.outcomeGroup || node.status || '—')}</dd></div>
        <div><dt>Parcel outcomes</dt><dd>${fmt.format(Number(node.metric?.value) || Number(node.count) || 0)}</dd></div>
        <div><dt>Underlying match_status</dt><dd>${esc(formatStatusCounts(details.statusCounts))}</dd></div>
        <div><dt>Semantics</dt><dd>Grouping is derived from recorded parcel-level match_status; it is not a newly calculated matcher result.</dd></div>
      </dl>`;
  }

  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">${esc(phaseLabel)}</span><h2>${esc(node.label || 'Parcel matching')}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">${esc(node.subtitle || '')}</p>
    <section class="eg-inspector-section">
      <h3>Matching evidence</h3>
      ${phaseBody}
    </section>
    ${observationIds.length ? `
      <section class="eg-inspector-section">
        <h3>Inspect one observation</h3>
        <form class="eg-normalization-search" data-role="matching-observation-form">
          <input type="text" data-role="matching-observation-input" placeholder="${esc(observationIds[0] || 'Observation ID')}" value="${esc(selectedId || '')}" aria-label="Matching observation ID" />
          <button type="submit">INSPECT</button>
        </form>
        <p class="eg-inspector-copy" data-role="matching-observation-message">Choose one of the ${fmt.format(observationIds.length)} real observations represented by this matching node.</p>
        ${selectedModel ? matchingObservationMarkup(selectedModel) : '<div data-role="matching-observation-detail"></div>'}
      </section>` : ''}
    <section class="eg-inspector-section">
      <h3>Recorded limitations</h3>
      <p class="eg-inspector-copy">The supplied data does not contain pairwise classifier probabilities, per-alternative match scores, global solver costs, or veto flags. No pair-level adjacency/neighbourhood feature vector is stored, and no pair-level topology feature/vector is stored. Matching therefore shows the recorded candidate associations and parcel-level outcomes without fabricating those internals.</p>
    </section>`;
}


function conflictSourceSideMarkup(title, side, value) {
  const geometry = side?.geometry;
  return `
    <article class="eg-conflict-source-card">
      <span class="eg-conflict-side">${esc(title)}</span>
      <strong>${esc(valueOrDash(side?.sourceName || side?.sourceLabel || side?.sourceType))}</strong>
      <dl class="eg-inspector-list">
        <div><dt>Source type</dt><dd>${esc(valueOrDash(side?.sourceType))}</dd></div>
        <div><dt>Authority</dt><dd>${esc(valueOrDash(side?.authority))}</dd></div>
        <div><dt>Observation</dt><dd>${esc(valueOrDash(side?.observationId))}</dd></div>
        <div><dt>Source record</dt><dd>${esc(valueOrDash(side?.sourceRecordId))}</dd></div>
        <div><dt>Source parcel</dt><dd>${esc(valueOrDash(side?.sourceParcelId))}</dd></div>
        <div><dt>Conflicting value</dt><dd class="eg-code-value">${esc(compactValue(value, 260))}</dd></div>
        <div><dt>Reliability</dt><dd>${esc(valueOrDash(side?.reliability))}</dd></div>
        <div><dt>Attribute confidence</dt><dd>${esc(valueOrDash(side?.attributeConfidence))}</dd></div>
        <div><dt>Geometry confidence</dt><dd>${esc(valueOrDash(side?.geometryConfidence))}</dd></div>
        <div><dt>Temporal freshness</dt><dd>${esc(valueOrDash(side?.temporalFreshness))}</dd></div>
        <div><dt>Identifier confidence</dt><dd>${esc(valueOrDash(side?.identifierConfidence))}</dd></div>
        <div><dt>Positional accuracy</dt><dd>${side?.positionalAccuracyM == null ? '—' : `${esc(side.positionalAccuracyM)} m`}</dd></div>
      </dl>
      ${geometry ? `<div class="eg-conflict-geometry-mini"><span>Geometry ${esc(valueOrDash(geometry.geometryId))}</span><small>${esc(valueOrDash(geometry.normalizedCrs))} · QC ${esc(valueOrDash(geometry.geometryQualityFlag))}</small></div>` : ''}
    </article>`;
}

function conflictDetailMarkup(model) {
  if (!model?.found) return '<p class="eg-inspector-copy eg-inspector-error">Conflict not found in CONFLICTS.</p>';
  const conflict = model.conflict ?? {};
  const rec = model.reconciliation;
  const geometry = model.geometryContext ?? {};
  const evidence = model.evidence ?? [];
  return `
    <section class="eg-inspector-section eg-conflict-detail" data-role="conflict-detail">
      <div class="eg-conflict-case-heading">
        <div><span class="eg-conflict-id">${esc(model.conflictId)}</span><h3>${esc(model.category?.label || conflict.conflictType || 'Recorded conflict')}</h3></div>
        <span class="eg-conflict-status" data-status="${esc(conflict.status || '')}">${esc(valueOrDash(conflict.status))}</span>
      </div>
      <dl class="eg-inspector-list">
        <div><dt>Parcel</dt><dd><strong>${esc(model.parcelId)}</strong></dd></div>
        <div><dt>Recorded conflict type</dt><dd>${esc(valueOrDash(conflict.conflictType))}</dd></div>
        <div><dt>Conflicting field</dt><dd>${esc(valueOrDash(conflict.conflictingField))}</dd></div>
        <div><dt>Severity</dt><dd>${esc(valueOrDash(conflict.severity))}</dd></div>
        <div><dt>Criticality</dt><dd>${esc(valueOrDash(conflict.criticality))}</dd></div>
        <div><dt>Human review required</dt><dd>${conflict.humanReviewRequired ? 'Yes' : 'No'}</dd></div>
      </dl>
      ${conflict.explanation ? `<p class="eg-inspector-copy">${esc(conflict.explanation)}</p>` : ''}
      <div class="eg-conflict-source-grid">
        ${conflictSourceSideMarkup('SOURCE A', model.provenance?.sourceA, conflict.sourceAValue)}
        ${conflictSourceSideMarkup('SOURCE B', model.provenance?.sourceB, conflict.sourceBValue)}
      </div>
    </section>
    ${geometry.relevant ? `
      <section class="eg-inspector-section">
        <h3>Geometry context</h3>
        <p class="eg-inspector-copy">Geometry is relevant to this recorded conflict. The graph shows the supplied geometry provenance and QC only; it does not perform correction here.</p>
        <div class="eg-conflict-geometry-grid">
          ${['sourceA','sourceB'].map((key, index) => {
            const g = geometry[key];
            return g ? `<div><strong>Source ${index ? 'B' : 'A'}</strong><span>${esc(valueOrDash(g.geometryId))}</span><small>${esc(valueOrDash(g.originalCrs))} → ${esc(valueOrDash(g.normalizedCrs))} · ${esc(valueOrDash(g.geometryQualityFlag))}</small></div>` : '';
          }).join('') || '<p class="eg-inspector-copy">No source geometry row is directly attached to this conflict record.</p>'}
        </div>
      </section>` : ''}
    <section class="eg-inspector-section">
      <h3>Conflict evidence / provenance</h3>
      <div class="eg-conflict-evidence-list">
        ${evidence.length ? evidence.map((item) => `<div><strong>${esc(valueOrDash(item.evidenceRole))}</strong><span>${esc(valueOrDash(item.sourceType || item.sourceTable))} · ${esc(valueOrDash(item.attributeName))}</span><small>${esc(valueOrDash(item.evidenceId))}${item.supportsOrContradicts ? ` · ${esc(item.supportsOrContradicts)}` : ''}${item.temporalRole ? ` · ${esc(item.temporalRole)}` : ''}</small></div>`).join('') : '<p class="eg-inspector-copy">No CONFLICT_EVIDENCE rows are attached to this conflict.</p>'}
      </div>
    </section>
    <section class="eg-inspector-section">
      <h3>Reconciliation status</h3>
      ${rec ? `<dl class="eg-inspector-list">
        <div><dt>Parcel match status</dt><dd>${esc(valueOrDash(rec.matchStatus))}</dd></div>
        <div><dt>Conflict unresolved</dt><dd>${rec.conflictIsUnresolved ? 'Yes' : 'No'}</dd></div>
        <div><dt>Requires human review</dt><dd>${rec.requiresHumanReview ? 'Yes' : 'No'}</dd></div>
        <div><dt>Overall match confidence</dt><dd>${esc(valueOrDash(rec.overallMatchConfidence))}</dd></div>
        <div><dt>Reconciliation confidence</dt><dd>${esc(valueOrDash(rec.reconciliationConfidence))}</dd></div>
        <div><dt>Reconciliation timestamp</dt><dd>${esc(valueOrDash(rec.reconciliationTimestamp))}</dd></div>
      </dl>` : '<p class="eg-inspector-copy">No RECONCILED_PARCELS row is available for this parcel.</p>'}
      <button type="button" class="eg-conflict-explorer-link" data-role="open-conflict-explorer" data-conflict-id="${esc(model.conflictId)}" data-parcel-id="${esc(model.parcelId)}">OPEN IN CONFLICT EXPLORER</button>
      <p class="eg-inspector-copy">This Evidence Graph inspection preserves provenance and replay context; case investigation remains the responsibility of the existing Conflict Explorer.</p>
    </section>`;
}

function conflictInspectorMarkup(node, layer, requestedConflictId = null) {
  const directConflictId = node.aggregate ? null : node.datasetRecordId;
  const ids = node.memberRecordIds ?? [];
  const selectedId = directConflictId || (requestedConflictId && ids.includes(requestedConflictId) ? requestedConflictId : null);
  const model = selectedId ? buildConflictInspectionModel(layer, selectedId) : null;
  const details = node.data?.details ?? {};

  if (directConflictId) {
    return `
      <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">CONFLICT CASE</span><h2>${esc(directConflictId)}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
      <p class="eg-drawer-subtitle">Identity is already established; this record describes a disagreement in the matched evidence.</p>
      ${conflictDetailMarkup(model)}`;
  }

  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">CONFLICT CATEGORY</span><h2>${esc(node.label || details.categoryLabel || 'Recorded conflicts')}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">Matched identity → explicit disagreement cases</p>
    <section class="eg-inspector-section">
      <h3>Dataset-derived aggregate</h3>
      <dl class="eg-inspector-list">
        <div><dt>Conflict cases</dt><dd><strong>${fmt.format(ids.length)}</strong></dd></div>
        <div><dt>Affected parcels</dt><dd>${fmt.format(Number(details.parcelCount) || 0)}</dd></div>
        <div><dt>Recorded conflict types</dt><dd>${esc(formatStatusCounts(details.conflictTypeCounts))}</dd></div>
        <div><dt>Status</dt><dd>${esc(formatStatusCounts(details.statusCounts))}</dd></div>
        <div><dt>Severity</dt><dd>${esc(formatStatusCounts(details.severityCounts))}</dd></div>
        <div><dt>Criticality</dt><dd>${esc(formatStatusCounts(details.criticalityCounts))}</dd></div>
        <div><dt>Require human review</dt><dd>${fmt.format(Number(details.humanReviewRequired) || 0)}</dd></div>
      </dl>
      <p class="eg-identity-first"><strong>MATCHING DETERMINES IDENTITY → CONFLICT DETECTION DETERMINES DISAGREEMENT</strong><span>No new identity decision is made during conflict detection.</span></p>
    </section>
    <section class="eg-inspector-section">
      <h3>Inspect a real conflict</h3>
      <form class="eg-normalization-search" data-role="conflict-search-form">
        <input type="text" data-role="conflict-search-input" placeholder="${esc(ids[0] || 'Conflict ID')}" value="${esc(selectedId || '')}" aria-label="Conflict ID" />
        <button type="submit">INSPECT</button>
      </form>
      <p class="eg-inspector-copy" data-role="conflict-search-message">Choose one of the ${fmt.format(ids.length)} explicit CONFLICTS records represented by this category.</p>
      <div class="eg-conflict-id-list">${ids.slice(0, 12).map((id) => `<button type="button" data-role="conflict-id-choice" data-conflict-id="${esc(id)}">${esc(id)}</button>`).join('')}</div>
      ${selectedId ? conflictDetailMarkup(model) : '<div data-role="conflict-detail"></div>'}
    </section>`;
}


function authorityDecisionDetailMarkup(model) {
  if (!model?.found) return '<p class="eg-inspector-copy eg-inspector-error">Governance record not found.</p>';
  const inf = model.systemInference ?? {};
  const conf = inf.confidence ?? {};
  const decision = model.decision;
  const gateEvents = model.policyGate?.explicitEvents ?? [];
  const proposed = model.proposedState ?? {};
  const authoritative = model.authoritativeState ?? {};
  return `
    <section class="eg-inspector-section eg-authority-detail" data-role="authority-detail">
      <div class="eg-authority-case-heading"><div><span class="eg-authority-id">${esc(model.parcelId)}</span><h3>Governance trace</h3></div><span class="eg-authority-status">${esc(valueOrDash(authoritative.state))}</span></div>
      <p class="eg-authority-principle"><strong>${esc(AUTHORITY_PRINCIPLE)}</strong><span>Confidence remains system evidence. Authority is read from explicit governance events and the authoritative-state field.</span></p>
    </section>
    <section class="eg-inspector-section">
      <h3>1 · System inference</h3>
      <dl class="eg-inspector-list">
        <div><dt>Match status</dt><dd>${esc(valueOrDash(inf.matchStatus))}</dd></div>
        <div><dt>Criticality</dt><dd>${esc(valueOrDash(inf.criticalityLevel))}</dd></div>
        <div><dt>Requires human review</dt><dd>${inf.requiresHumanReview ? 'Yes' : 'No'}</dd></div>
        <div><dt>Overall match confidence</dt><dd>${esc(valueOrDash(conf.overallMatch))}</dd></div>
        <div><dt>Reconciliation confidence</dt><dd>${esc(valueOrDash(conf.reconciliation))}</dd></div>
        <div><dt>Geometry / ownership / land use</dt><dd>${esc(valueOrDash(conf.geometry))} / ${esc(valueOrDash(conf.ownership))} / ${esc(valueOrDash(conf.landUse))}</dd></div>
      </dl>
    </section>
    <section class="eg-inspector-section">
      <h3>2 · Proposed state</h3>
      <div class="eg-authority-state-grid">
        ${Object.entries(proposed).map(([k,v]) => `<div><strong>${esc(k.replaceAll('_',' '))}</strong><span>${esc(compactValue(v, 220))}</span></div>`).join('') || '<p class="eg-inspector-copy">No proposed_state payload is present.</p>'}
      </div>
    </section>
    <section class="eg-inspector-section">
      <h3>3 · Policy / review evidence</h3>
      <dl class="eg-inspector-list">
        <div><dt>Source observations</dt><dd>${fmt.format(Number(model.evidence?.sourceCount) || 0)}</dd></div>
        <div><dt>Conflicts</dt><dd>${fmt.format((model.evidence?.conflictIds ?? []).length)} total · ${fmt.format((model.evidence?.openConflictIds ?? []).length)} open</dd></div>
        <div><dt>Conflict-evidence rows</dt><dd>${fmt.format(Number(model.evidence?.conflictEvidenceCount) || 0)}</dd></div>
      </dl>
      <div class="eg-authority-event-list">
        ${gateEvents.length ? gateEvents.map((e) => `<div><strong>${esc(e.eventType)}</strong><span>${esc(valueOrDash(e.actorType))} · ${esc(valueOrDash(e.source))}</span><small>${esc(valueOrDash(e.timestamp))}${e.reason ? ` · ${esc(e.reason)}` : ''}</small></div>`).join('') : '<p class="eg-inspector-copy">No explicit HUMAN_REVIEW / PROPOSAL_ACCEPTED / PROPOSAL_REJECTED GeoGit event is recorded for this parcel.</p>'}
      </div>
    </section>
    <section class="eg-inspector-section">
      <h3>4 · Human / authorized action</h3>
      ${decision ? `<dl class="eg-inspector-list">
        <div><dt>Event</dt><dd>${esc(decision.eventType)}</dd></div>
        <div><dt>Actor type</dt><dd>${esc(valueOrDash(decision.actorType))}</dd></div>
        <div><dt>Workflow source</dt><dd>${esc(valueOrDash(decision.source))}</dd></div>
        <div><dt>Action / reason</dt><dd>${esc(valueOrDash(decision.reason))}</dd></div>
        <div><dt>Timestamp</dt><dd>${esc(valueOrDash(decision.timestamp))}</dd></div>
        <div><dt>Version transition</dt><dd>${esc(valueOrDash(decision.previousVersion))} → ${esc(valueOrDash(decision.resultingVersion))}</dd></div>
      </dl>` : '<p class="eg-inspector-copy">No single decision event was selected. The parcel-level trace above lists all explicit governance events.</p>'}
      ${decision?.eventType === 'PROPOSAL_REJECTED' ? '<p class="eg-inspector-copy"><strong>Proposal rejected:</strong> the authoritative-state payload shown below is the recorded state that remains after rejection; this graph does not reinterpret the rejected proposal as accepted.</p>' : ''}
      <p class="eg-inspector-copy">No officer/person name is present in the supplied governance records; only recorded actor types such as AUTHORITY or HUMAN_REVIEWER are shown.</p>
    </section>
    <section class="eg-inspector-section">
      <h3>5 · Resulting authoritative state</h3>
      <div class="eg-authority-state-grid">
        ${Object.entries(authoritative).map(([k,v]) => `<div><strong>${esc(k.replaceAll('_',' '))}</strong><span>${esc(compactValue(v, 220))}</span></div>`).join('') || '<p class="eg-inspector-copy">No authoritative_state payload is present.</p>'}
      </div>
      <p class="eg-inspector-copy">Reconciliation timestamp: ${esc(valueOrDash(model.reconciliationTimestamp))}</p>
    </section>`;
}

function authorityInspectorMarkup(node, layer, requestedId = null) {
  const details = node.data?.details ?? {};
  const ids = node.memberRecordIds ?? [];
  const selectedId = requestedId && ids.includes(requestedId) ? requestedId : null;
  const selectedModel = selectedId ? buildAuthorityInspectionModel(layer, selectedId) : null;
  const role = details.authorityRole || 'governance';
  const roleTitle = {
    'system-inference': 'SYSTEM INFERENCE', 'proposed-state': 'PROPOSED STATE', 'governance-path': 'GOVERNANCE / REVIEW PATH',
    'human-review': 'HUMAN / AUTHORIZED REVIEW', 'authorized-decision': 'AUTHORIZED DECISION', 'authoritative-state': 'AUTHORITATIVE STATE'
  }[role] || 'AUTHORITY / REVIEW';
  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">${esc(roleTitle)}</span><h2>${esc(node.label || 'Authority / Review')}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">System inference and confidence are deliberately separated from legal/administrative authority.</p>
    <section class="eg-inspector-section">
      <p class="eg-authority-principle"><strong>${esc(AUTHORITY_PRINCIPLE)}</strong><span>${esc(details.note || 'Recorded governance fields determine authority status.')}</span></p>
      <dl class="eg-inspector-list">
        <div><dt>Represented records</dt><dd><strong>${fmt.format(ids.length)}</strong></dd></div>
        <div><dt>Dataset table</dt><dd>${esc(node.metadataRef?.table || node.data?.memberTable || '—')}</dd></div>
        ${details.matchStatusCounts ? `<div><dt>System inference vocabulary</dt><dd>${esc(formatStatusCounts(details.matchStatusCounts))}</dd></div>` : ''}
        ${details.reviewRelevantMatchStatuses ? `<div><dt>Review-related inference states</dt><dd>${esc(formatStatusCounts(details.reviewRelevantMatchStatuses))}</dd></div>` : ''}
        ${details.eventSourceCounts ? `<div><dt>Governance workflow sources</dt><dd>${esc(formatStatusCounts(details.eventSourceCounts))}</dd></div>` : ''}
        ${details.confidenceAuthorityCrosscheck ? `<div><dt>Confidence / authority overlap</dt><dd>${details.confidenceAuthorityCrosscheck.overlapExists ? 'Yes — confidence ranges overlap across pending and authoritative records' : 'No overlap derived'}</dd></div>` : ''}
      </dl>
    </section>
    <section class="eg-inspector-section">
      <h3>Inspect one real governance record</h3>
      <form class="eg-normalization-search" data-role="authority-search-form">
        <input type="text" data-role="authority-search-input" placeholder="${esc(ids[0] || 'Event ID or parcel ID')}" value="${esc(selectedId || '')}" aria-label="Authority/review record ID" />
        <button type="submit">INSPECT</button>
      </form>
      <p class="eg-inspector-copy" data-role="authority-search-message">Use one of the ${fmt.format(ids.length)} real record IDs represented by this node.</p>
      <div class="eg-conflict-id-list">${ids.slice(0, 10).map((id) => `<button type="button" data-role="authority-id-choice" data-authority-id="${esc(id)}">${esc(id)}</button>`).join('')}</div>
      ${selectedModel ? authorityDecisionDetailMarkup(selectedModel) : '<div data-role="authority-detail"></div>'}
    </section>`;
}


function canonicalTraceDetailMarkup(model) {
  if (!model?.found) return '<p class="eg-inspector-copy eg-inspector-error">Canonical parcel trace not found.</p>';
  const canonical = model.canonicalState ?? {};
  const reconciliation = model.reconciliation ?? {};
  const governance = model.authorityReview ?? {};
  const conflict = model.conflictDetection ?? {};
  const matching = model.matching ?? {};
  return `
    <section class="eg-inspector-section eg-canonical-trace-detail">
      <div class="eg-canonical-trace-heading"><div><span class="eg-canonical-id">${esc(model.parcelId)}</span><h3>Evidence-to-canonical trace</h3></div><span class="eg-canonical-trace-status">${model.traceComplete ? 'TRACE COMPLETE' : 'TRACE GAP'}</span></div>
      <p class="eg-canonical-principle"><strong>${esc(CANONICAL_TRACE_PRINCIPLE)}</strong><span>The canonical registry is a governed projection. Source evidence and provenance remain available behind it.</span></p>
      ${model.traceComplete ? '' : '<p class="eg-trace-gap-state"><strong>Missing evidence relationship</strong><span>One or more supported links in this parcel trace are absent from the current dataset. Evidence Graph leaves the gap visible instead of fabricating a relationship.</span></p>'}
    </section>
    <section class="eg-inspector-section">
      <h3>Canonical state</h3>
      <dl class="eg-inspector-list">
        <div><dt>Parcel status</dt><dd>${esc(valueOrDash(canonical.parcel_status || model.historicalState?.record_status))}</dd></div>
        <div><dt>Land use</dt><dd>${esc(valueOrDash(canonical.land_use))}</dd></div>
        <div><dt>Owner / entity</dt><dd>${esc(valueOrDash(canonical.owner_entity))}</dd></div>
        <div><dt>Tenure</dt><dd>${esc(valueOrDash(canonical.tenure_type))}</dd></div>
        <div><dt>Current geometry</dt><dd>${esc(valueOrDash(canonical.current_geometry_id || model.historicalState?.historical_geometry_id))}</dd></div>
        <div><dt>Canonical / geometry version</dt><dd>${esc(valueOrDash(canonical.canonical_state_version))} / ${esc(valueOrDash(canonical.authoritative_geometry_version))}</dd></div>
      </dl>
    </section>
    <section class="eg-inspector-section">
      <h3>Trace backwards through PRAMAN</h3>
      <div class="eg-canonical-trace-chain">
        <div><strong>Authority / review</strong><span>${esc(valueOrDash(governance.resultingState?.state))}</span><small>${fmt.format((governance.events ?? []).length)} governance event${(governance.events ?? []).length === 1 ? '' : 's'}</small></div>
        <div><strong>Reconciliation</strong><span>${esc(valueOrDash(reconciliation.matchStatus))}</span><small>confidence ${esc(valueOrDash(reconciliation.reconciliationConfidence))} · ${esc(valueOrDash(reconciliation.timestamp))}</small></div>
        <div><strong>Conflict detection</strong><span>${esc(valueOrDash(conflict.status))}</span><small>${fmt.format((conflict.conflictIds ?? []).length)} conflicts · ${fmt.format((conflict.openConflictIds ?? []).length)} open</small></div>
        <div><strong>Matching</strong><span>${esc(valueOrDash(matching.outcomeGroup))}</span><small>${esc(valueOrDash(matching.matchStatus))} · confidence ${esc(valueOrDash(matching.overallMatchConfidence))}</small></div>
        <div><strong>Normalized observations</strong><span>${fmt.format((model.normalizedObservationIds ?? []).length)}</span><small>same observation identities retained through MATCHING_INPUT_VIEW</small></div>
        <div><strong>Adapters</strong><span>${fmt.format((model.adapterIds ?? []).length)} conceptual routes</span><small>${esc((model.adapterIds ?? []).join(', ') || '—')}</small></div>
        <div><strong>Original source observations</strong><span>${fmt.format((model.sourceObservationIds ?? []).length)}</span><small>${fmt.format((model.sourceDatasetIds ?? []).length)} source datasets · ${esc((model.sourceDatasetIds ?? []).join(', ') || '—')}</small></div>
      </div>
      ${conflict.status === 'NO_RECORDED_CONFLICT' ? '<p class="eg-inspector-copy"><strong>Conflict checkpoint:</strong> this parcel has no explicit CONFLICTS row. The absence is derived from the dataset and is not a fabricated conflict record.</p>' : ''}
    </section>
    <section class="eg-inspector-section">
      <h3>Source observation provenance</h3>
      <div class="eg-canonical-source-list">
        ${(model.observations ?? []).map((item) => `<div><strong>${esc(item.observationId)}</strong><span>${esc(valueOrDash(item.sourceDataset?.source_name || item.sourceType))}</span><small>${esc(valueOrDash(item.sourceRecordId))} · adapters: ${esc(item.adapterRoutes.map((a) => a.adapterName).join(', ') || '—')}</small></div>`).join('') || '<p class="eg-inspector-copy">No matched source-observation membership is recorded.</p>'}
      </div>
    </section>`;
}

function canonicalInspectorMarkup(node, layer, requestedParcelId = null) {
  const global = buildAuthoritativeCanonicalStateModel(layer);
  const ids = node.memberRecordIds ?? [];
  const directId = node.aggregate ? null : (node.canonicalParcelId || node.datasetRecordId);
  const selectedId = directId || (requestedParcelId && ids.includes(requestedParcelId) ? requestedParcelId : null);
  const trace = selectedId ? buildCanonicalParcelTraceModel(layer, selectedId) : null;
  const s = global.summary;
  const consistency = global.consistency;
  const coverage = global.traceCoverage;
  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">AUTHORITATIVE CANONICAL STATE</span><h2>${esc(node.label || 'Canonical Parcel Registry')}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">Evidence converges into the current registry without erasing the source-to-decision chain.</p>
    <section class="eg-inspector-section">
      <p class="eg-canonical-principle"><strong>${esc(CANONICAL_TRACE_PRINCIPLE)}</strong><span>${fmt.format(coverage.complete)} of ${fmt.format(coverage.totalActiveCanonicalParcels)} active canonical parcels retain complete supported trace coverage.</span></p>
      <div class="eg-canonical-summary-grid">
        <div><span>Active canonical</span><strong>${fmt.format(s.activeCanonicalParcels)}</strong></div>
        <div><span>Historical / retired</span><strong>${fmt.format(s.historicalRetiredParcels)}</strong></div>
        <div><span>Source observations</span><strong>${fmt.format(s.sourceObservations)}</strong></div>
        <div><span>Candidate relationships</span><strong>${fmt.format(s.candidateAssociations)}</strong></div>
        <div><span>Accepted matches</span><strong>${fmt.format(s.acceptedMatches)}</strong></div>
        <div><span>Ambiguous / unmatched</span><strong>${fmt.format(s.ambiguousCases)} / ${fmt.format(s.unmatchedObservationCases)}</strong></div>
        <div><span>Rejected matches</span><strong>${fmt.format(s.rejectedMatches)}</strong></div>
        <div><span>Conflicts</span><strong>${fmt.format(s.conflicts)}</strong></div>
        <div><span>Reconciliation records</span><strong>${fmt.format(s.reconciliationRecords)}</strong></div>
        <div><span>Unresolved cases</span><strong>${fmt.format(s.unresolvedCases)}</strong></div>
        <div><span>Human-review required</span><strong>${fmt.format(s.humanReviewCases)}</strong></div>
        <div><span>Split / merge lineage</span><strong>${fmt.format(s.splitLineageRelationships)} / ${fmt.format(s.mergeLineageRelationships)}</strong></div>
      </div>
      <p class="eg-inspector-copy">Supporting detail: ${fmt.format(s.openConflicts)} open conflicts · ${fmt.format(s.resolvedConflicts)} resolved conflicts · ${fmt.format(s.explicitHumanReviewEvents)} explicit HUMAN_REVIEW events · ${fmt.format(s.reconciledStatusCases)} rows carry MATCH_STATUS=RECONCILED.</p>
      ${consistency.registryVsReconciliationDiscrepancy ? `<p class="eg-inspector-copy eg-inspector-error"><strong>Dataset discrepancy:</strong> ${fmt.format(consistency.activeCanonicalRegistryRows)} active CANONICAL_PARCELS rows vs ${fmt.format(consistency.activeReconciliationRows)} ACTIVE reconciliation rows.</p>` : `<p class="eg-inspector-copy">Active registry consistency check: ${fmt.format(consistency.activeCanonicalRegistryRows)} CANONICAL_PARCELS rows matches ${fmt.format(consistency.activeReconciliationRows)} ACTIVE reconciliation rows.</p>`}
      ${consistency.specificationExpectationAvailable ? (consistency.specificationDiscrepancy ? `<p class="eg-inspector-copy eg-inspector-error"><strong>Specification discrepancy:</strong> expected ${fmt.format(consistency.specificationDiscrepancy.expected)}, actual ${fmt.format(consistency.specificationDiscrepancy.actual)}.</p>` : `<p class="eg-inspector-copy">The provided specification expectation matches the current active registry count.</p>`) : '<p class="eg-inspector-copy">No expected active-parcel total is hardcoded into the Evidence Graph; the production tables determine the displayed count.</p>'}
    </section>
    <section class="eg-inspector-section">
      <h3>Trace an active canonical parcel</h3>
      <form class="eg-normalization-search" data-role="canonical-search-form">
        <input type="text" data-role="canonical-search-input" placeholder="${esc(ids[0] || 'Canonical parcel ID')}" value="${esc(selectedId || '')}" aria-label="Canonical parcel ID" />
        <button type="submit">TRACE</button>
      </form>
      <p class="eg-inspector-copy" data-role="canonical-search-message">Choose one of the ${fmt.format(ids.length)} canonical parcels represented by this node.</p>
      <div class="eg-conflict-id-list">${ids.slice(0, 10).map((id) => `<button type="button" data-role="canonical-id-choice" data-canonical-id="${esc(id)}">${esc(id)}</button>`).join('')}</div>
      ${trace ? canonicalTraceDetailMarkup(trace) : '<div data-role="canonical-trace-detail"></div>'}
    </section>`;
}


function historyLineageInspectorMarkup(node, layer) {
  const selectedParcelId = node.data?.selectedParcelId || node.canonicalParcelId || node.datasetRecordId;
  const model = buildParcelHistoryLineageModel(layer, selectedParcelId);
  const role = node.data?.historyRole || '';
  const details = node.data?.details ?? node.data ?? {};
  const architecture = `<p class="eg-history-principle"><strong>${esc(HISTORY_ARCHITECTURE_PRINCIPLE)}</strong><span>Evidence Graph explains evidence and decisions across PRAMAN. GeoGit contributes supporting parcel/version history; it is not the upstream source of the Evidence Graph.</span></p>`;
  let body = '';
  if (role === 'lineage-transaction') {
    body = `
      <dl class="eg-inspector-list">
        <div><dt>Lineage operation</dt><dd>${esc(details.type || '—')}</dd></div>
        <div><dt>Effective date</dt><dd>${esc(valueOrDash(details.effectiveDate))}</dd></div>
        <div><dt>Parents</dt><dd>${esc((details.parentParcelIds || []).join(' · ') || '—')}</dd></div>
        <div><dt>Children / result</dt><dd>${esc((details.childParcelIds || []).join(' · ') || '—')}</dd></div>
        <div><dt>Reason</dt><dd>${esc(valueOrDash(details.reason))}</dd></div>
        <div><dt>Source</dt><dd>${esc(valueOrDash(details.source))}</dd></div>
        <div><dt>Accepted status</dt><dd>${esc((details.acceptedStatuses || []).join(' · ') || '—')}</dd></div>
        <div><dt>Backing lineage rows</dt><dd>${esc((details.memberLineageEventIds || []).join(' · ') || '—')}</dd></div>
        <div><dt>Supporting GeoGit events</dt><dd>${esc((details.geogitEvents || []).map((e) => e.event_id).join(' · ') || 'None recorded')}</dd></div>
      </dl>
      <p class="eg-inspector-copy">${details.type === 'SPLIT' ? 'Rendered as parent → split transaction → all recorded children.' : 'Rendered as all recorded parents → merge transaction → resulting parcel.'}</p>`;
  } else if (role === 'geometry-version') {
    body = `
      <dl class="eg-inspector-list">
        <div><dt>Geometry ID</dt><dd>${esc(valueOrDash(details.geometry_id || node.datasetRecordId))}</dd></div>
        <div><dt>Version label</dt><dd>${esc(valueOrDash(details.version_label))}</dd></div>
        <div><dt>Geometry status</dt><dd>${esc(valueOrDash(details.geometry_status))}</dd></div>
        <div><dt>Authority status</dt><dd>${esc(valueOrDash(details.accepted_status))}</dd></div>
        <div><dt>Effective date</dt><dd>${esc(valueOrDash(details.effective_date))}</dd></div>
        <div><dt>Change classification</dt><dd>${esc((details.historyKinds || node.data?.historyKinds || []).map((x) => x.replaceAll('_',' ')).join(' · ') || 'GEOMETRY VERSION')}</dd></div>
        <div><dt>Change reason</dt><dd>${esc(valueOrDash(details.change_reason))}</dd></div>
        <div><dt>Supersedes</dt><dd>${esc(valueOrDash(details.supersedes_geometry_id))}</dd></div>
        <div><dt>CRS</dt><dd>${esc(valueOrDash(details.crs))}</dd></div>
        <div><dt>Area</dt><dd>${details.areaSqm == null ? '—' : `${esc(details.areaSqm)} m²`}</dd></div>
      </dl>
      <p class="eg-inspector-copy">GeoGit does not contain a geometry_id foreign key, so no direct GeoGit-event → geometry-version link is invented.</p>`;
  } else if (role === 'geogit-event') {
    body = `
      <dl class="eg-inspector-list">
        <div><dt>GeoGit event</dt><dd>${esc(valueOrDash(details.event_id || node.datasetRecordId))}</dd></div>
        <div><dt>Event type</dt><dd>${esc(valueOrDash(details.event_type))}</dd></div>
        <div><dt>History meaning</dt><dd>${esc(valueOrDash(details.historyKind))}</dd></div>
        <div><dt>Timestamp</dt><dd>${esc(valueOrDash(details.timestamp))}</dd></div>
        <div><dt>Parcel</dt><dd>${esc(valueOrDash(details.parcel_id))}</dd></div>
        <div><dt>Related parcels</dt><dd>${esc((details.relatedParcelIds || []).join(' · ') || '—')}</dd></div>
        <div><dt>Previous version</dt><dd>${esc(valueOrDash(details.previous_version))}</dd></div>
        <div><dt>Resulting version</dt><dd>${esc(valueOrDash(details.resulting_version))}</dd></div>
        <div><dt>Actor type</dt><dd>${esc(valueOrDash(details.actor_type))}</dd></div>
        <div><dt>Source</dt><dd>${esc(valueOrDash(details.source))}</dd></div>
        <div><dt>Reason</dt><dd>${esc(valueOrDash(details.reason))}</dd></div>
      </dl>
      <p class="eg-inspector-copy">This is supporting historical/version evidence. It does not imply GeoGit produced the Evidence Graph or that this event maps to a specific geometry version.</p>`;
  } else if (role === 'related-parcel') {
    body = `
      <dl class="eg-inspector-list">
        <div><dt>Parcel</dt><dd>${esc(valueOrDash(node.datasetRecordId))}</dd></div>
        <div><dt>Registry</dt><dd>${esc(valueOrDash(node.data?.registry))}</dd></div>
        <div><dt>Status</dt><dd>${esc(valueOrDash(node.status))}</dd></div>
        <div><dt>Lineage role</dt><dd>${esc((node.data?.lineageRoles || []).map((x) => x.replaceAll('_',' ')).join(' · ') || '—')}</dd></div>
      </dl>`;
  } else {
    body = `<p class="eg-inspector-copy">History details are available from the selected parcel's geometry versions, lineage transactions, and history-relevant GeoGit events.</p>`;
  }
  const summary = model.found ? `
    <section class="eg-inspector-section">
      <h3>Selected parcel history coverage</h3>
      <dl class="eg-inspector-list">
        <div><dt>Lineage transactions</dt><dd>${fmt.format(model.transactions?.length || 0)}</dd></div>
        <div><dt>Geometry versions</dt><dd>${fmt.format(model.geometryVersions?.length || 0)}</dd></div>
        <div><dt>History-relevant GeoGit events</dt><dd>${fmt.format(model.geogitEvents?.length || 0)}</dd></div>
        <div><dt>Current geometry</dt><dd>${esc(valueOrDash(model.currentGeometryId))}</dd></div>
      </dl>
    </section>` : '';
  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">PARCEL HISTORY / LINEAGE</span><h2>${esc(node.label || node.datasetRecordId || 'History evidence')}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">Current canonical state stays primary; prior parcel/geometry states and GeoGit events remain available as supporting explainability.</p>
    <section class="eg-inspector-section">${architecture}${body}</section>${summary}`;
}

function nodeProvenanceMarkup(node) {
  const metadata = node?.metadataRef ?? {};
  const memberCount = Array.isArray(node?.memberRecordIds) ? node.memberRecordIds.length : Number(node?.count) || 0;
  const provenanceParts = [metadata.table || node?.data?.memberTable || null, metadata.recordId || node?.datasetRecordId || null, metadata.field || null].filter(Boolean);
  const confidenceEntries = Object.entries(node?.confidence ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && ['string', 'number', 'boolean'].includes(typeof value));
  if (!provenanceParts.length && !node?.datasetRecordId && !node?.canonicalParcelId && !node?.sourceId && !node?.status && !confidenceEntries.length) return '';
  const confidenceText = confidenceEntries.map(([key, value]) => `${key}: ${value}`).join(' · ');
  const aggregateRef = !metadata.recordId && !node?.datasetRecordId && (metadata.table || node?.data?.memberTable)
    ? `${metadata.table || node.data.memberTable} · ${fmt.format(memberCount)} represented record${memberCount === 1 ? '' : 's'}`
    : provenanceParts.join(' · ');
  return `<section class="eg-inspector-section eg-inspector-provenance">
    <h3>Record provenance</h3>
    <dl class="eg-inspector-list">
      <div><dt>Entity type</dt><dd>${esc(node.entityType || node.type || '—')}</dd></div>
      ${node.datasetRecordId ? `<div><dt>Record identifier</dt><dd>${esc(node.datasetRecordId)}</dd></div>` : ''}
      ${node.canonicalParcelId ? `<div><dt>Canonical parcel</dt><dd>${esc(node.canonicalParcelId)}</dd></div>` : ''}
      ${node.sourceId ? `<div><dt>Source</dt><dd>${esc(node.sourceId)}</dd></div>` : ''}
      ${node.status ? `<div><dt>Status</dt><dd>${esc(node.status)}</dd></div>` : ''}
      ${aggregateRef ? `<div><dt>Provenance reference</dt><dd>${esc(aggregateRef)}</dd></div>` : ''}
      ${confidenceText ? `<div><dt>Recorded confidence</dt><dd>${esc(confidenceText)}</dd></div>` : ''}
    </dl>
  </section>`;
}

function drawerMarkup(node, layer, normalizationObservationId = null, matchingObservationId = null, conflictId = null, authorityRecordId = null, canonicalParcelId = null) {
  if (!node) return '';
  if (node.entityType === 'SourceDataset' || node.type === 'SourceDataset') return sourceInspectorMarkup(node, layer);
  if (node.entityType === 'AdapterConcept' || node.type === 'AdapterConcept') return adapterInspectorMarkup(node);
  if (node.entityType === 'NormalizedObservation' || node.type === 'NormalizedObservation') return normalizationInspectorMarkup(node, layer, normalizationObservationId);
  if (node.stageId === 'matching') return matchingInspectorMarkup(node, layer, matchingObservationId);
  if (node.stageId === 'conflict-detection' || node.entityType === 'Conflict' || node.type === 'Conflict') return conflictInspectorMarkup(node, layer, conflictId);
  if (node.stageId === 'authority-review') return authorityInspectorMarkup(node, layer, authorityRecordId);
  if (node.stageId === 'canonical-state' || (node.entityType === 'CanonicalParcel' || node.type === 'CanonicalParcel') && node.stageId !== 'history-lineage') return canonicalInspectorMarkup(node, layer, canonicalParcelId);
  if (node.stageId === 'history-lineage' || ['HistoricalParcel','GeometryVersion','LineageTransaction','LineageEvent','GeoGitEvent'].includes(node.entityType || node.type)) return historyLineageInspectorMarkup(node, layer);
  const memberCount = node.memberRecordIds?.length ?? node.count ?? 1;
  const metadata = node.metadataRef ?? {};
  const details = node.data?.details ?? node.data ?? {};
  const safeDetails = Object.entries(details).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 8);
  return `
    <div class="eg-drawer-head"><div><span class="eg-drawer-kicker">${esc(node.entityType || node.type)}</span><h2>${esc(node.label || node.datasetRecordId || node.id)}</h2></div><button type="button" class="eg-drawer-close" data-role="drawer-close" aria-label="Close inspection drawer">×</button></div>
    <p class="eg-drawer-subtitle">${esc(node.subtitle || '')}</p>
    <dl class="eg-inspector-list">
      <div><dt>Lifecycle operation</dt><dd>${esc(REPLAY_STAGES[node.stageIndex]?.label || node.stageId || '')}</dd></div>
      <div><dt>Dataset table</dt><dd>${esc(metadata.table || node.data?.memberTable || '—')}</dd></div>
      <div><dt>Represented records</dt><dd>${fmt.format(Number(memberCount) || 0)}</dd></div>
      ${node.datasetRecordId ? `<div><dt>Record ID</dt><dd>${esc(node.datasetRecordId)}</dd></div>` : ''}
      ${node.canonicalParcelId ? `<div><dt>Canonical parcel</dt><dd>${esc(node.canonicalParcelId)}</dd></div>` : ''}
      ${node.sourceId ? `<div><dt>Source ID</dt><dd>${esc(node.sourceId)}</dd></div>` : ''}
      ${node.status ? `<div><dt>Status</dt><dd>${esc(node.status)}</dd></div>` : ''}
      ${safeDetails.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}
    </dl>`;
}

export async function mountEvidenceGraphDashboard({
  container,
  datasetBaseUrl = '/PRAMAN_DATA',
  stylesheetUrl = '/src/evidence-graph/dashboard/evidenceGraph.css',
  fetchImpl = globalThis.fetch,
  onReplayRequested = null,
  onParcelSelected = null,
  onParcelReplayRequested = null,
  onReplayStateChange = null,
  onOpenConflictExplorer = null,
  onNavigateDashboard = null,
  dashboardPaths = null,
  locationLike = globalThis.location ?? null,
  historyLike = globalThis.history ?? null,
  navigate = null,
} = {}) {
  if (!(container instanceof Element)) throw new Error('mountEvidenceGraphDashboard requires a DOM Element container');
  injectStylesheet(stylesheetUrl);
  container.innerHTML = template();

  const q = (role) => container.querySelector(`[data-role="${role}"]`);
  const els = {
    loading: q('loading'), health: q('health'), healthText: q('health-text'), replay: q('replay'), lifecyclePlay: q('lifecycle-play'), searchToggle: q('search-toggle'), replayParcel: q('replay-parcel'), parcelOptions: q('parcel-options'),
    searchForm: q('search-form'), searchInput: q('search-input'), searchMessage: q('search-message'), summary: q('summary'), filterToggle: q('filter-toggle'), filterPanel: q('filter-panel'), filterIndicator: q('filter-indicator'),
    emptyState: q('empty-state'), emptyTitle: q('empty-title'), emptyCopy: q('empty-copy'), selection: q('selection'),
    replayControls: q('replay-controls'), play: q('play'), pause: q('pause'),
    playbackState: q('playback-state'), operationName: q('operation-name'), operationDescription: q('operation-description'), speed: q('speed'),
    graphRoot: q('graph-root'), drawer: q('drawer')
  };

  let layer, controller = null, renderer = null, unsubscribeReplay = null;
  let parcelSearchIndex = [], parcelSearchLookup = new Map(), selectedParcelId = null;
  let filterCatalog = null, currentFilters = normalizeExplorationFilters({});
  let normalizationObservationId = null, matchingObservationId = null, conflictId = null, authorityRecordId = null, canonicalParcelId = null, drawerNodeId = null;
  let destroyed = false;
  const cleanup = [];
  const setHealth = (state, text) => { els.health.dataset.state = state; els.healthText.textContent = text; };
  const dispatch = (name, detail) => container.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  const resolvedDashboardPaths = mergeDashboardPaths(dashboardPaths || {});
  let latestSnapshot = null;
  let lastUrlSyncAt = 0;
  let restoringNavigationState = true;
  let hasCompletedOverviewLifecycle = false;
  const currentRelativeHref = () => {
    if (!locationLike) return resolvedDashboardPaths.evidenceGraph || '/evidence-graph';
    return `${locationLike.pathname || resolvedDashboardPaths.evidenceGraph || '/evidence-graph'}${locationLike.search || ''}${locationLike.hash || ''}`;
  };
  const buildCurrentState = (snapshot = latestSnapshot) => buildEvidenceGraphState(snapshot, {
    selectedParcelId, search: els.searchInput?.value || '', selectedNodeId: snapshot?.selectedNodeId || drawerNodeId, searchOpen: els.searchForm?.dataset.open === 'true', filters: currentFilters
  });
  const persistNavigationState = (snapshot = latestSnapshot, { force = false } = {}) => {
    if (restoringNavigationState && !force) return currentRelativeHref();
    if (!historyLike?.replaceState || !locationLike) return currentRelativeHref();
    const now = Date.now();
    if (!force && now - lastUrlSyncAt < 250) return currentRelativeHref();
    lastUrlSyncAt = now;
    const nextHref = writeEvidenceGraphStateToUrl(buildCurrentState(snapshot), currentRelativeHref());
    historyLike.replaceState(historyLike.state ?? null, '', nextHref);
    return nextHref;
  };
  const initialNavigationState = readEvidenceGraphStateFromUrl(currentRelativeHref());
  currentFilters = normalizeExplorationFilters(initialNavigationState.filters || {});

  const performDashboardNavigation = (action, context) => {
    const returnTo = persistNavigationState(latestSnapshot, { force: true });
    const refreshed = buildContextualDashboardActions(context, { paths: resolvedDashboardPaths, returnTo });
    const resolved = refreshed.find((item) => item.id === action.id) || action;
    const detail = { target: resolved.target, href: resolved.href, context, returnTo, state: buildCurrentState(latestSnapshot), dataLayer: layer };
    dispatch('praman:evidence-graph:navigate-dashboard', detail);
    if (onNavigateDashboard) { onNavigateDashboard(detail); return; }
    if (navigate) { navigate(resolved.href, detail); return; }
    if (locationLike?.assign) locationLike.assign(resolved.href);
  };

  const setReplayOpen = (open) => {
    container.querySelector('.praman-evidence-graph')?.setAttribute('data-replay-open', String(open));
    els.replayControls.dataset.open = String(open); els.replayControls.setAttribute('aria-hidden', String(!open));
    els.graphRoot.hidden = !open; els.emptyState.hidden = open;
  };

  const closeDrawer = () => {
    els.drawer.dataset.open = 'false'; els.drawer.setAttribute('aria-hidden', 'true'); els.drawer.innerHTML = '';
    normalizationObservationId = null; matchingObservationId = null; conflictId = null; authorityRecordId = null; canonicalParcelId = null; drawerNodeId = null;
    if (controller?.selectedNodeId) controller.selectNode(null);
  };

  const renderDrawer = (node) => {
    if (!node) return;
    els.drawer.innerHTML = drawerMarkup(node, layer, normalizationObservationId, matchingObservationId, conflictId, authorityRecordId, canonicalParcelId);
    const provenance = nodeProvenanceMarkup(node);
    if (provenance) els.drawer.insertAdjacentHTML('beforeend', provenance);
    if (node.status) {
      const subtitle = els.drawer.querySelector('.eg-drawer-subtitle');
      const status = document.createElement('div');
      status.className = 'eg-inspector-statusbar';
      status.dataset.status = String(node.status);
      status.innerHTML = `<span>Status</span><strong>${esc(String(node.status).replaceAll('_', ' '))}</strong>`;
      if (subtitle) subtitle.insertAdjacentElement('afterend', status);
      else els.drawer.querySelector('.eg-drawer-head')?.insertAdjacentElement('afterend', status);
    }
    for (const section of [...els.drawer.querySelectorAll('.eg-inspector-section')]) {
      const heading = section.querySelector(':scope > h3');
      if (!heading || !/^(Time & version metadata|Recorded limitations)$/i.test(heading.textContent.trim())) continue;
      const details = document.createElement('details');
      details.className = 'eg-inspector-advanced';
      const summary = document.createElement('summary');
      summary.textContent = heading.textContent.trim();
      details.append(summary);
      heading.remove();
      while (section.firstChild) details.append(section.firstChild);
      section.replaceWith(details);
    }
    const context = resolveEvidenceNodeContext(node, layer, { parcelId: selectedParcelId, conflictId, authorityRecordId, canonicalParcelId });
    const returnTo = writeEvidenceGraphStateToUrl(buildCurrentState(latestSnapshot), currentRelativeHref());
    const actions = buildContextualDashboardActions(context, { paths: resolvedDashboardPaths, returnTo });
    const actionMarkup = contextualActionsMarkup(actions);
    if (actionMarkup) {
      const subtitle = els.drawer.querySelector('.eg-drawer-subtitle');
      if (subtitle) subtitle.insertAdjacentHTML('afterend', actionMarkup);
      else els.drawer.insertAdjacentHTML('afterbegin', actionMarkup);
    }
    els.drawer.dataset.open = 'true'; els.drawer.setAttribute('aria-hidden', 'false');
    els.drawer.querySelector('[data-role="drawer-close"]')?.addEventListener('click', closeDrawer, { once: true });
    for (const link of els.drawer.querySelectorAll('[data-role="context-action"]')) {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const action = actions.find((item) => item.id === link.dataset.actionId);
        if (action) performDashboardNavigation(action, context);
      });
    }
    const form = els.drawer.querySelector('[data-role="normalization-observation-form"]');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector('[data-role="normalization-observation-input"]');
      const message = els.drawer.querySelector('[data-role="normalization-observation-message"]');
      const observationId = input?.value?.trim() || '';
      const representedIds = node.memberRecordIds ?? node.data?.details?.normalizedObservationIds ?? [];
      if (!observationId || !representedIds.includes(observationId)) {
        if (message) message.textContent = observationId ? 'That observation is not represented by this normalized-evidence node.' : 'Enter an observation ID.';
        return;
      }
      const model = buildNormalizationObservationModel(layer, observationId);
      if (!model.found) {
        if (message) message.textContent = 'No normalized row exists for that observation ID.';
        return;
      }
      normalizationObservationId = observationId;
      renderDrawer(node);
    });
    const matchingForm = els.drawer.querySelector('[data-role="matching-observation-form"]');
    matchingForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = matchingForm.querySelector('[data-role="matching-observation-input"]');
      const message = els.drawer.querySelector('[data-role="matching-observation-message"]');
      const observationId = input?.value?.trim() || '';
      const role = node.data?.matchingRole ?? '';
      const representedIds = role === 'candidate-generation'
        ? [...new Set((node.memberRecordIds ?? []).map((id) => String(id).split(':')[0]).filter(Boolean))]
        : (node.memberRecordIds ?? []);
      if (!observationId || !representedIds.includes(observationId)) {
        if (message) message.textContent = observationId ? 'That observation is not represented by this matching node.' : 'Enter an observation ID.';
        return;
      }
      const model = buildMatchingObservationModel(layer, observationId);
      if (!model.found) {
        if (message) message.textContent = 'No SOURCE_OBSERVATIONS row exists for that observation ID.';
        return;
      }
      matchingObservationId = observationId;
      renderDrawer(node);
    });
    const conflictForm = els.drawer.querySelector('[data-role="conflict-search-form"]');
    conflictForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = conflictForm.querySelector('[data-role="conflict-search-input"]');
      const message = els.drawer.querySelector('[data-role="conflict-search-message"]');
      const nextId = input?.value?.trim() || '';
      const representedIds = node.memberRecordIds ?? [];
      if (!nextId || !representedIds.includes(nextId)) {
        if (message) message.textContent = nextId ? 'That conflict is not represented by this category.' : 'Enter a conflict ID.';
        return;
      }
      const model = buildConflictInspectionModel(layer, nextId);
      if (!model.found) {
        if (message) message.textContent = 'No CONFLICTS row exists for that conflict ID.';
        return;
      }
      conflictId = nextId;
      renderDrawer(node);
    });
    for (const button of els.drawer.querySelectorAll('[data-role="conflict-id-choice"]')) {
      button.addEventListener('click', () => {
        conflictId = button.dataset.conflictId || null;
        renderDrawer(node);
      });
    }
    const authorityForm = els.drawer.querySelector('[data-role="authority-search-form"]');
    authorityForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = authorityForm.querySelector('[data-role="authority-search-input"]');
      const message = els.drawer.querySelector('[data-role="authority-search-message"]');
      const nextId = input?.value?.trim() || '';
      const representedIds = node.memberRecordIds ?? [];
      if (!nextId || !representedIds.includes(nextId)) {
        if (message) message.textContent = nextId ? 'That record is not represented by this governance node.' : 'Enter an event or parcel ID.';
        return;
      }
      const model = buildAuthorityInspectionModel(layer, nextId);
      if (!model.found) {
        if (message) message.textContent = 'No governance/reconciliation record resolves from that ID.';
        return;
      }
      authorityRecordId = nextId;
      renderDrawer(node);
    });
    for (const button of els.drawer.querySelectorAll('[data-role="authority-id-choice"]')) {
      button.addEventListener('click', () => {
        authorityRecordId = button.dataset.authorityId || null;
        renderDrawer(node);
      });
    }
    const canonicalForm = els.drawer.querySelector('[data-role="canonical-search-form"]');
    canonicalForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = canonicalForm.querySelector('[data-role="canonical-search-input"]');
      const message = els.drawer.querySelector('[data-role="canonical-search-message"]');
      const nextId = input?.value?.trim() || '';
      const representedIds = node.memberRecordIds ?? [];
      if (!nextId || !representedIds.includes(nextId)) {
        if (message) message.textContent = nextId ? 'That parcel is not represented by this canonical node.' : 'Enter a canonical parcel ID.';
        return;
      }
      const model = buildCanonicalParcelTraceModel(layer, nextId);
      if (!model.found) {
        if (message) message.textContent = 'No canonical/reconciliation trace resolves from that parcel ID.';
        return;
      }
      canonicalParcelId = nextId;
      renderDrawer(node);
    });
    for (const button of els.drawer.querySelectorAll('[data-role="canonical-id-choice"]')) {
      button.addEventListener('click', () => {
        canonicalParcelId = button.dataset.canonicalId || null;
        renderDrawer(node);
      });
    }
    els.drawer.querySelector('[data-role="open-conflict-explorer"]')?.addEventListener('click', (event) => {
      const target = event.currentTarget;
      const selectedConflictId = target.dataset.conflictId || conflictId || node.datasetRecordId || null;
      const conflictParcelId = target.dataset.parcelId || selectedParcelId || null;
      const model = selectedConflictId ? buildConflictInspectionModel(layer, selectedConflictId) : null;
      const legacyDetail = { conflictId: selectedConflictId, parcelId: conflictParcelId, conflict: model, dataLayer: layer };
      dispatch('praman:evidence-graph:open-conflict-explorer', legacyDetail);
      if (onOpenConflictExplorer) onOpenConflictExplorer(legacyDetail);
      else {
        const context = resolveEvidenceNodeContext(node, layer, { parcelId: conflictParcelId, conflictId: selectedConflictId });
        const action = buildContextualDashboardActions(context, { paths: resolvedDashboardPaths }).find((item) => item.id === 'conflict-explorer');
        if (action) performDashboardNavigation(action, context);
      }
    });
  };

  const renderReplay = (snapshot) => {
    if (!renderer) return;
    latestSnapshot = snapshot;
    renderer.render(snapshot);
    if (els.health.dataset.state !== 'error') {
      const parcelExcluded = snapshot.mode === 'parcel' && snapshot.filterSummary?.active && snapshot.filterSummary?.selectedParcelMatches === false;
      const stateText = parcelExcluded ? 'Selected parcel excluded by active filters' : snapshot.mode === 'parcel' ? 'Parcel evidence linked' : snapshot.playbackState === 'running' ? 'Lifecycle running' : snapshot.playbackState === 'paused' ? 'Lifecycle paused' : snapshot.playbackState === 'completed' ? 'Lifecycle complete' : 'Evidence graph ready';
      setHealth(snapshot.playbackState === 'running' ? 'working' : 'ready', stateText);
    }
    const currentNote = snapshot.notes.filter((n) => n.stageId === snapshot.currentStage.id).map((n) => n.note).join(' ');
    els.playbackState.textContent = String(snapshot.playbackState || (snapshot.isPlaying ? 'running' : 'idle')).toUpperCase();
    els.operationName.textContent = snapshot.currentStage.label;
    els.operationDescription.textContent = `${snapshot.currentStage.description}${currentNote ? ` ${currentNote}` : ''}`;
    els.speed.value = String(snapshot.playbackSpeed);
    els.play.disabled = snapshot.playbackState !== 'paused';
    els.pause.disabled = snapshot.playbackState !== 'running';
    const root = container.querySelector('.praman-evidence-graph');
    if (root) root.dataset.mode = snapshot.mode === 'parcel' ? 'parcel' : 'run';
    const overviewLifecycleComplete = snapshot.mode === 'run' && snapshot.playbackState === 'completed';
    if (overviewLifecycleComplete) hasCompletedOverviewLifecycle = true;
    if (snapshot.mode === 'parcel') {
      els.replay.hidden = false;
      els.replay.textContent = 'BACK TO RECONCILIATION OVERVIEW';
    } else {
      els.replay.hidden = !hasCompletedOverviewLifecycle;
      els.replay.textContent = 'REPLAY RECONCILIATION';
    }
    if (snapshot.selectedNode) {
      if (drawerNodeId !== snapshot.selectedNode.id) { normalizationObservationId = null; matchingObservationId = null; conflictId = null; authorityRecordId = null; canonicalParcelId = null; }
      drawerNodeId = snapshot.selectedNode.id;
      renderDrawer(snapshot.selectedNode);
    } else if (els.drawer.dataset.open === 'true') {
      els.drawer.dataset.open = 'false'; els.drawer.setAttribute('aria-hidden', 'true'); els.drawer.innerHTML = '';
      normalizationObservationId = null; matchingObservationId = null; conflictId = null; authorityRecordId = null; canonicalParcelId = null; drawerNodeId = null;
    }
    if (snapshot.filterSummary?.active) {
      const fs = snapshot.filterSummary;
      els.filterIndicator.hidden = false;
      els.filterIndicator.textContent = snapshot.mode === 'parcel'
        ? `FILTERED · ${fs.activeFilterCount} filter${fs.activeFilterCount === 1 ? '' : 's'} · selected parcel ${fs.selectedParcelMatches === false ? 'excluded' : 'included'}`
        : `FILTERED · ${fs.activeFilterCount} filter${fs.activeFilterCount === 1 ? '' : 's'} · ${fmt.format(fs.visibleParcels)} parcel${fs.visibleParcels === 1 ? '' : 's'}`;
      els.filterToggle.dataset.active = 'true';
    } else {
      els.filterIndicator.hidden = true; els.filterIndicator.textContent = ''; els.filterToggle.dataset.active = 'false';
    }
    const detail = { snapshot, dataLayer: layer, controller };
    dispatch('praman:evidence-graph:replay-state', detail);
    onReplayStateChange?.(detail);
    persistNavigationState(snapshot);
  };

  const startController = ({ mode, parcelId = null, autoplay = false }) => {
    unsubscribeReplay?.(); controller?.destroy(); renderer?.destroy();
    const root = container.querySelector('.praman-evidence-graph');
    if (root) root.dataset.mode = mode === 'parcel' ? 'parcel' : 'run';
    setHealth('working', mode === 'parcel' ? 'Building parcel evidence graph' : 'Building evidence graph');
    controller = createEvidenceReplayController({ dataLayer: layer, mode, parcelId, filters: currentFilters });
    renderer = new EvidenceGraphRenderer({ container: els.graphRoot, onNodeSelected: (nodeId) => controller.selectNode(nodeId) });
    setReplayOpen(true);
    if (autoplay) controller.play();
    unsubscribeReplay = controller.subscribe(renderReplay);
    return controller;
  };

  const selectRestoredContextNode = (state) => {
    if (!controller) return;
    const snapshot = controller.getSnapshot();
    const inbound = state.inboundContext || {};
    let node = state.selectedNodeId ? snapshot.visibleNodes.find((n) => n.id === state.selectedNodeId) : null;
    if (!node && inbound.conflictId) node = snapshot.visibleNodes.find((n) => n.entityType === 'Conflict' && n.datasetRecordId === inbound.conflictId);
    if (!node && inbound.sourceId) node = snapshot.visibleNodes.find((n) => n.entityType === 'SourceDataset' && (n.sourceId === inbound.sourceId || n.datasetRecordId === inbound.sourceId));
    if (!node && inbound.versionId) node = snapshot.visibleNodes.find((n) => n.entityType === 'GeometryVersion' && (n.datasetRecordId === inbound.versionId || n.data?.versionLabel === inbound.versionId || n.data?.details?.versionLabel === inbound.versionId));
    if (!node && inbound.eventId) node = snapshot.visibleNodes.find((n) => n.entityType === 'GeoGitEvent' && n.datasetRecordId === inbound.eventId);
    if (node) controller.selectNode(node.id);
  };

  const restoreInitialNavigationState = () => {
    const state = initialNavigationState;
    currentFilters = normalizeExplorationFilters(state.filters || currentFilters);
    if (filterCatalog) els.filterPanel.innerHTML = filterPanelMarkup(filterCatalog, currentFilters);
    const inbound = state.inboundContext || {};
    if (state.search) els.searchInput.value = state.search;
    els.searchForm.dataset.open = String(Boolean(state.searchOpen));
    let parcelId = state.parcelId;
    if (!parcelId && inbound.conflictId) parcelId = layer.tables.conflicts.find((r) => r.conflict_id === inbound.conflictId)?.canonical_parcel_id || null;
    if (!parcelId && inbound.eventId) parcelId = layer.tables.geogitEvents.find((r) => r.event_id === inbound.eventId)?.parcel_id || null;
    const hasRestoreContext = Boolean(parcelId || state.stageId || state.selectedNodeId || state.search || state.searchOpen || inbound.conflictId || inbound.sourceId || inbound.versionId || inbound.eventId);
    if (!hasRestoreContext) { restoringNavigationState = false; return; }

    let replayController = null;
    if (parcelId && layer.getParcelEvidence(parcelId).found) {
      selectedParcelId = parcelId;
      els.searchInput.value = state.search || parcelId;
      els.replayParcel.hidden = false; els.replayParcel.disabled = false;
      els.selection.textContent = parcelId;
      els.searchMessage.textContent = 'Parcel evidence context restored'; els.searchMessage.dataset.state = 'ready';
      replayController = startController({ mode: 'parcel', parcelId, autoplay: false });
    } else {
      replayController = startController({ mode: 'run', autoplay: false });
    }

    if (state.playbackSpeed) replayController.setPlaybackSpeed(state.playbackSpeed);
    const inferredStage = state.stageId || (inbound.conflictId ? 'conflict-detection' : inbound.versionId || inbound.eventId ? 'history-lineage' : inbound.sourceId ? 'sources' : null);
    if (state.timelinePosition !== null && state.timelinePosition !== undefined) replayController.seekTimeline(state.timelinePosition);
    else if (inferredStage) replayController.jumpToStage(inferredStage);
    selectRestoredContextNode(state);
    restoringNavigationState = false;
    persistNavigationState(replayController.getSnapshot(), { force: true });
  };

  try {
    layer = await loadEvidenceGraphDataLayer({ baseUrl: datasetBaseUrl, fetchImpl, strict: false });
    if (destroyed) return { destroy() {} };
    const runSummary = layer.getEvidenceRunSummary();
    filterCatalog = buildExplorationFilterCatalog(layer);
    els.filterPanel.innerHTML = filterPanelMarkup(filterCatalog, currentFilters);
    els.filterToggle.disabled = false;
    parcelSearchIndex = buildParcelSearchIndex(layer);
    parcelSearchLookup = new Map(parcelSearchIndex.map((item) => [item.searchId.toLowerCase(), item]));
    els.parcelOptions.innerHTML = parcelSearchIndex.map((item) => `<option value="${esc(item.searchId)}">${esc(item.label)}</option>`).join('');
    const errors = layer.getDiagnostics({ severity: 'ERROR' });
    els.summary.innerHTML = summaryMarkup(runSummary);
    els.replay.disabled = false; els.lifecyclePlay.disabled = false; els.searchToggle.disabled = false; els.loading.hidden = true;
    if (errors.length) setHealth('error', `${errors.length} reference error${errors.length === 1 ? '' : 's'}`); else setHealth('ready', 'Dataset linked');
    restoreInitialNavigationState();

    const openSearch = () => {
      const isOpen = els.searchForm.dataset.open === 'true';
      els.searchForm.dataset.open = String(!isOpen);
      if (!isOpen) requestAnimationFrame(() => els.searchInput.focus());
      else { els.searchMessage.textContent = ''; els.searchMessage.dataset.state = ''; }
    };

    const beginOverviewLifecycle = ({ autoplay = true } = {}) => {
      const active = controller?.mode === 'run' ? controller.getSnapshot() : null;
      if (autoplay && active?.playbackState === 'running') return controller;
      selectedParcelId = null;
      hasCompletedOverviewLifecycle = false;
      els.replayParcel.hidden = true; els.replayParcel.disabled = true;
      const replayController = startController({ mode: 'run', autoplay });
      els.selection.textContent = `${fmt.format(runSummary.sourceObservations)} observations · ${fmt.format(runSummary.conflicts.total)} conflicts`;
      const detail = { summary: runSummary, dataLayer: layer, controller: replayController };
      dispatch('praman:evidence-graph:replay-requested', detail); onReplayRequested?.(detail);
      return replayController;
    };

    const lifecyclePlayHandler = () => beginOverviewLifecycle({ autoplay: true });

    const replayHandler = () => {
      const returningFromParcel = Boolean(selectedParcelId || controller?.mode === 'parcel');
      if (returningFromParcel) {
        els.searchInput.value = '';
        els.searchMessage.textContent = '';
        els.searchMessage.dataset.state = '';
        els.selection.textContent = '';
        beginOverviewLifecycle({ autoplay: false });
        return;
      }
      beginOverviewLifecycle({ autoplay: true });
    };

    const submitHandler = (event) => {
      event.preventDefault();
      const typed = els.searchInput.value.trim();
      if (!typed) { els.searchMessage.textContent = 'Enter a parcel ID'; els.searchMessage.dataset.state = 'error'; return; }
      const searchEntry = parcelSearchLookup.get(typed.toLowerCase()) || null;
      const parcelId = searchEntry?.parcelId || typed;
      const evidence = layer.getParcelEvidence(parcelId);
      if (!evidence.found || !searchEntry) { els.searchMessage.textContent = 'Parcel identifier not found in current canonical, historical, or source parcel records'; els.searchMessage.dataset.state = 'error'; return; }
      selectedParcelId = parcelId; els.searchInput.value = searchEntry.searchId;
      els.replayParcel.hidden = false; els.replayParcel.disabled = false;
      const sourceAlias = searchEntry.identifierType === 'SOURCE_PARCEL';
      els.searchMessage.textContent = sourceAlias ? `Source parcel ${searchEntry.searchId} → ${parcelId}` : 'Parcel evidence lifecycle playing';
      els.searchMessage.dataset.state = 'ready';
      els.selection.textContent = sourceAlias ? `${searchEntry.searchId} → ${parcelId}` : parcelId;
      const replayController = startController({ mode: 'parcel', parcelId, autoplay: true });
      const detail = { parcelId, searchIdentifier: searchEntry.searchId, identifierType: searchEntry.identifierType, evidence, dataLayer: layer, controller: replayController };
      dispatch('praman:evidence-graph:parcel-selected', detail); onParcelSelected?.(detail);
    };

    const replayParcelHandler = () => {
      if (!selectedParcelId) return;
      if (!controller || controller.mode !== 'parcel' || controller.parcelId !== selectedParcelId) startController({ mode: 'parcel', parcelId: selectedParcelId, autoplay: false });
      controller.replay();
      const detail = { parcelId: selectedParcelId, dataLayer: layer, controller };
      dispatch('praman:evidence-graph:parcel-replay-requested', detail);
      onParcelReplayRequested?.(detail);
    };

    const openFilters = () => {
      const open = els.filterPanel.dataset.open === 'true';
      els.filterPanel.dataset.open = String(!open); els.filterPanel.setAttribute('aria-hidden', String(open));
    };
    const applyFiltersFromPanel = () => {
      const next = { ...currentFilters };
      for (const control of els.filterPanel.querySelectorAll('[data-filter-key]')) {
        const key = control.dataset.filterKey;
        next[key] = control.type === 'checkbox' ? control.checked : control.value;
      }
      currentFilters = normalizeExplorationFilters(next);
      controller?.setFilters(currentFilters);
      persistNavigationState(controller?.getSnapshot() || latestSnapshot, { force: true });
      dispatch('praman:evidence-graph:filters-changed', { filters: currentFilters, active: hasActiveExplorationFilters(currentFilters), dataLayer: layer });
    };
    const filterChangeHandler = (event) => { if (event.target.closest('[data-filter-key]')) applyFiltersFromPanel(); };
    const clearFiltersHandler = () => {
      currentFilters = normalizeExplorationFilters({});
      els.filterPanel.innerHTML = filterPanelMarkup(filterCatalog, currentFilters);
      controller?.clearFilters();
      persistNavigationState(controller?.getSnapshot() || latestSnapshot, { force: true });
      dispatch('praman:evidence-graph:filters-changed', { filters: currentFilters, active: false, dataLayer: layer });
    };

    const playHandler = () => controller?.play();
    const pauseHandler = () => controller?.pause();
    const speedHandler = () => controller?.setPlaybackSpeed(Number(els.speed.value));

    const filterPanelClickHandler = (event) => { if (event.target.closest('[data-role="clear-filters"]')) clearFiltersHandler(); };
    const listeners = [
      [els.searchToggle, 'click', openSearch], [els.filterToggle, 'click', openFilters], [els.filterPanel, 'change', filterChangeHandler], [els.filterPanel, 'click', filterPanelClickHandler], [els.lifecyclePlay, 'click', lifecyclePlayHandler], [els.replay, 'click', replayHandler], [els.replayParcel, 'click', replayParcelHandler], [els.searchForm, 'submit', submitHandler],
      [els.play, 'click', playHandler], [els.pause, 'click', pauseHandler], [els.speed, 'change', speedHandler]
    ];
    for (const [el, event, handler] of listeners) { el.addEventListener(event, handler); cleanup.push(() => el.removeEventListener(event, handler)); }

    return {
      dataLayer: layer,
      runSummary,
      get replayController() { return controller; },
      get selectedParcelId() { return selectedParcelId; },
      get filters() { return { ...currentFilters }; },
      openSearch, openFilters, clearFilters: clearFiltersHandler,
      requestReplay: replayHandler,
      replaySelectedParcel: replayParcelHandler,
      destroy() {
        destroyed = true; unsubscribeReplay?.(); controller?.destroy(); renderer?.destroy(); cleanup.splice(0).forEach((fn) => fn()); container.replaceChildren();
      }
    };
  } catch (error) {
    els.loading.hidden = true; setHealth('error', 'Dataset load failure'); els.replay.disabled = true; els.lifecyclePlay.disabled = true; els.searchToggle.disabled = true; els.filterToggle.disabled = true;
    els.emptyTitle.textContent = 'Evidence Graph could not load the PRAMAN dataset'; els.emptyCopy.textContent = 'The evidence workspace is unavailable because the dataset could not be linked. Verify the PRAMAN_DATA path and reload this view.';
    dispatch('praman:evidence-graph:error', { error });
    return { error, destroy() { destroyed = true; container.replaceChildren(); } };
  }
}
