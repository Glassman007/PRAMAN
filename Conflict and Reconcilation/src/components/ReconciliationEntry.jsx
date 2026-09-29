import { useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import GeometryEvidenceMap from './GeometryEvidenceMap.jsx';
import { buildReconciliationWorkspace, formatConfidence } from '../data/reconciliationWorkspace.js';
import { REVIEW_ACTIONS, getReviewActionLabel, loadReviewerState, saveReviewerState } from '../data/reviewerStateService.js';

function present(value) {
  return value !== null && value !== undefined && value !== '';
}

function displayValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function Field({ label, value, mono = false }) {
  if (!present(value) && value !== false && value !== 0) return null;
  return (
    <div className="investigation-field">
      <span>{label}</span>
      <strong className={mono ? 'mono-value' : ''}>{displayValue(value)}</strong>
    </div>
  );
}

function ConfidenceCard({ label, value }) {
  const formatted = formatConfidence(value);
  if (!formatted) return null;
  return (
    <div className="confidence-card">
      <span>{label}</span>
      <strong>{formatted.display}</strong>
      <small>raw {formatted.raw}</small>
    </div>
  );
}

function ProposalComparison({ workspace }) {
  const { reconciliation, proposalDifferences } = workspace;
  const proposal = reconciliation.proposed_state ?? {};
  const entries = Object.entries(proposal);

  return (
    <section className="reconcile-section" aria-labelledby="proposal-title">
      <div className="section-heading">
        <div>
          <h2 id="proposal-title">Current state vs proposed state</h2>
          <p>Only dataset fields present in <code>proposed_state</code> are considered. Differences are derived against the current authoritative/historical state.</p>
        </div>
        <span>{proposalDifferences.length} difference{proposalDifferences.length === 1 ? '' : 's'}</span>
      </div>

      {proposalDifferences.length ? (
        <div className="proposal-diff-list">
          {proposalDifferences.map((item) => (
            <article className="proposal-diff-row" key={item.field}>
              <div className="proposal-field-name"><code>{item.field}</code></div>
              <div className="proposal-state-cell">
                <span>Current</span>
                <strong>{displayValue(item.currentValue)}</strong>
                {item.currentSource && <small>{item.currentSource}</small>}
              </div>
              <div className="proposal-arrow" aria-hidden="true">→</div>
              <div className="proposal-state-cell proposal-state-cell--proposed">
                <span>Proposed</span>
                <strong>{displayValue(item.proposedValue)}</strong>
                <small>RECONCILED_PARCELS.proposed_state</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-inline">The parsed proposal does not differ from the currently relevant dataset state for the fields it contains.</div>
      )}

      {entries.length > 0 && (
        <details className="reconcile-details">
          <summary>View complete parsed proposal</summary>
          <div className="proposal-object-grid">
            {entries.map(([field, value]) => <Field key={field} label={field} value={value} />)}
          </div>
        </details>
      )}
    </section>
  );
}

function ReconciliationStatus({ reconciliation }) {
  return (
    <section className="reconcile-section" aria-labelledby="reconcile-status-title">
      <div className="section-heading"><div><h2 id="reconcile-status-title">Dataset reconciliation state</h2><p>These values are read directly from the reconciliation record; reviewer actions are stored separately.</p></div></div>
      <div className="reconcile-status-grid">
        <Field label="Record status" value={reconciliation.record_status} />
        <Field label="Lineage status" value={reconciliation.lineage_status} />
        <Field label="Match status" value={reconciliation.match_status} />
        <Field label="Criticality level" value={reconciliation.criticality_level} />
        <Field label="Criticality reason" value={reconciliation.criticality_reason} />
        <Field label="Source count" value={reconciliation.source_count} />
        <Field label="Matched source IDs" value={reconciliation.matched_source_ids} mono />
        <Field label="Requires human review" value={reconciliation.requires_human_review ? 'True' : 'False'} />
        <Field label="Unresolved conflict IDs" value={reconciliation.unresolved_conflicts} mono />
        <Field label="Reconciliation timestamp" value={reconciliation.reconciliation_timestamp} />
      </div>
    </section>
  );
}

function ConfidenceDimensions({ reconciliation }) {
  const fields = [
    ['Overall match confidence', reconciliation.overall_match_confidence],
    ['Geometry confidence', reconciliation.geometry_confidence],
    ['Ownership confidence', reconciliation.ownership_confidence],
    ['Land-use confidence', reconciliation.land_use_confidence],
    ['Lineage confidence', reconciliation.lineage_confidence],
    ['Reconciliation confidence', reconciliation.reconciliation_confidence],
  ];
  return (
    <section className="reconcile-section" aria-labelledby="confidence-title">
      <div className="section-heading"><div><h2 id="confidence-title">Confidence dimensions</h2><p>Each confidence dimension remains independent; no synthetic combined score is calculated.</p></div></div>
      <div className="confidence-grid">
        {fields.map(([label, value]) => <ConfidenceCard key={label} label={label} value={value} />)}
      </div>
    </section>
  );
}

function ConflictList({ workspace, onSelectConflict }) {
  const unresolvedIds = new Set(workspace.unresolvedConflicts.map((item) => item.conflictId));
  return (
    <section className="reconcile-section" aria-labelledby="unresolved-title">
      <div className="section-heading">
        <div><h2 id="unresolved-title">Conflicts in this parcel</h2><p>Unresolved conflict references come from <code>RECONCILED_PARCELS.unresolved_conflicts</code>. Selecting one updates the reloadable route.</p></div>
        <span>{workspace.conflicts.length} total</span>
      </div>
      <div className="reconcile-conflict-list">
        {workspace.conflicts.map((conflict) => {
          const selected = conflict.conflict_id === workspace.selectedConflict?.conflict_id;
          const unresolved = unresolvedIds.has(conflict.conflict_id);
          const isOpen = workspace.openConflicts.some((openConflict) => openConflict.conflict_id === conflict.conflict_id);
          return (
            <button
              type="button"
              key={conflict.conflict_id}
              className={`reconcile-conflict-item${selected ? ' is-selected' : ''}`}
              onClick={() => isOpen && onSelectConflict(conflict.conflict_id)}
              aria-pressed={selected}
              disabled={!isOpen}
              title={isOpen ? 'Open this conflict in reconciliation' : 'Resolved conflicts are read-only in reconciliation'}
            >
              <div>
                <code>{conflict.conflict_id}</code>
                <strong>{conflict.conflict_type}</strong>
                <span>{conflict.attribute_or_geometry ?? '—'} · {conflict.source_a ?? '—'} ↔ {conflict.source_b ?? '—'}</span>
              </div>
              <div className="detail-badges">
                {unresolved && <StatusBadge compact value="unresolved">Unresolved</StatusBadge>}
                {!isOpen && <StatusBadge compact value="read-only">Read only</StatusBadge>}
                <StatusBadge compact value={conflict.status}>{conflict.status}</StatusBadge>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EvidenceChain({ workspace }) {
  const investigation = workspace.selectedInvestigation;
  const proposal = workspace.reconciliation.proposed_state ?? {};
  return (
    <section className="reconcile-section" aria-labelledby="evidence-support-title">
      <div className="section-heading">
        <div><h2 id="evidence-support-title">Evidence supporting the proposal</h2><p>Dataset chain: source observations → detected conflict → reconciliation proposal.</p></div>
      </div>
      <div className="proposal-evidence-flow">
        <article className="proposal-evidence-stage">
          <div className="eyebrow">1 · Source observations</div>
          <h3>Matched source records</h3>
          <div className="matched-observation-list">
            {workspace.matchedObservations.map(({ observationId, observation }) => (
              <div className="matched-observation" key={observationId}>
                <code>{observationId}</code>
                {observation ? (
                  <>
                    <strong>{observation.source_type}</strong>
                    <span>{observation.source_record_id ?? '—'}{observation.observation_date ? ` · ${observation.observation_date}` : ''}</span>
                    <small>source reliability {displayValue(observation.source_reliability)} · geometry {displayValue(observation.geometry_confidence)} · attribute {displayValue(observation.attribute_confidence)}</small>
                  </>
                ) : <span>Referenced observation could not be resolved.</span>}
              </div>
            ))}
          </div>
        </article>

        <article className="proposal-evidence-stage">
          <div className="eyebrow">2 · Detected conflict</div>
          {workspace.selectedConflict ? (
            <>
              <h3>{workspace.selectedConflict.conflict_id}</h3>
              <div className="evidence-field-grid evidence-field-grid--compact">
                <Field label="Type" value={workspace.selectedConflict.conflict_type} />
                <Field label="Attribute / geometry" value={workspace.selectedConflict.attribute_or_geometry} />
                <Field label="Source A value" value={workspace.selectedConflict.source_a_value} />
                <Field label="Source B value" value={workspace.selectedConflict.source_b_value} />
                <Field label="Status" value={workspace.selectedConflict.status} />
                <Field label="Recommended next evidence" value={workspace.selectedConflict.recommended_next_evidence} />
              </div>
              {investigation?.evidenceItems?.length > 0 && (
                <div className="reconcile-evidence-links">
                  {investigation.evidenceItems.map((item) => (
                    <div key={item.evidence.conflict_evidence_id}>
                      <code>{item.evidence.conflict_evidence_id}</code>
                      <span>{item.sourceType ?? item.evidence.evidence_type ?? 'Evidence'} · {item.evidence.evidence_role ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : <div className="empty-inline">No conflict resolves for this route.</div>}
        </article>

        <article className="proposal-evidence-stage proposal-evidence-stage--proposal">
          <div className="eyebrow">3 · Reconciliation proposal</div>
          <h3>Parsed proposed state</h3>
          <div className="proposal-object-grid">
            {Object.entries(proposal).map(([field, value]) => <Field key={field} label={field} value={value} />)}
          </div>
          <Field label="Reconciliation confidence" value={workspace.reconciliation.reconciliation_confidence} />
        </article>
      </div>
    </section>
  );
}

function HistoryContext({ workspace }) {
  const parcel = workspace.parcelCase;
  const hasHistory = workspace.geoGitEvents.length || workspace.lineageReferences.length || workspace.geometryVersions.length || parcel.historicalParcel;
  if (!hasHistory) return null;
  return (
    <details className="reconcile-details">
      <summary>Supporting parcel history</summary>
      <div className="history-grid reconciliation-history-grid">
        {parcel.historicalParcel && (
          <article className="history-section">
            <h3>Historical parcel</h3>
            <div className="evidence-field-grid">
              <Field label="Record status" value={parcel.historicalParcel.record_status} />
              <Field label="Lineage status" value={parcel.historicalParcel.lineage_status} />
              <Field label="Former owner" value={parcel.historicalParcel.former_owner} />
              <Field label="Retired date" value={parcel.historicalParcel.retired_date} />
              <Field label="Retirement reason" value={parcel.historicalParcel.retirement_reason} />
            </div>
          </article>
        )}
        <article className="history-section">
          <h3>Lineage</h3>
          <div className="history-list">
            {workspace.lineageReferences.map(({ event, role, relatedParcelId }) => (
              <div className="history-row" key={`${event.lineage_event_id}:${role}:${relatedParcelId}`}>
                <strong>{event.event_type}</strong>
                <span>{event.lineage_event_id} · {role}{relatedParcelId ? ` · ${relatedParcelId}` : ''}</span>
                <span>{event.effective_date ?? '—'} · {event.accepted_status ?? '—'}</span>
              </div>
            ))}
            {!workspace.lineageReferences.length && <div className="empty-inline">No lineage rows for this parcel.</div>}
          </div>
        </article>
        <article className="history-section">
          <h3>Geometry versions</h3>
          <div className="history-list">
            {workspace.geometryVersions.map((version) => (
              <div className="history-row" key={version.geometry_id}>
                <strong>{version.geometry_id}</strong>
                <span>{version.version_label ?? '—'} · {version.geometry_status ?? '—'}</span>
                <span>{version.effective_date ?? '—'} · {version.accepted_status ?? '—'}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="history-section history-section--wide">
          <h3>GeoGit events</h3>
          <div className="history-list history-list--events">
            {workspace.geoGitEvents.map((event) => (
              <div className="history-row" key={event.event_id}>
                <strong>{event.event_type}</strong>
                <span>{event.event_id} · {event.timestamp ?? '—'}</span>
                <span>{event.previous_version ?? '—'} → {event.resulting_version ?? '—'}</span>
                {event.reason && <p>{event.reason}</p>}
              </div>
            ))}
          </div>
        </article>
      </div>
    </details>
  );
}


function ReconciliationTopologyImpact({ workspace }) {
  const neighbours = workspace.topologyImpact?.neighbours ?? [];
  if (!neighbours.length) return null;
  return (
    <section className="reconcile-section" aria-labelledby="reconcile-topology-title">
      <div className="section-heading">
        <div>
          <h2 id="reconcile-topology-title">Shared-boundary impact</h2>
          <p>Touching parcels are derived from authoritative geometry. Review these neighbours before accepting a boundary-changing proposal.</p>
        </div>
        <span>{neighbours.length} touching parcel{neighbours.length === 1 ? '' : 's'}</span>
      </div>
      <div className="topology-neighbour-list">
        {neighbours.map((neighbour) => (
          <article className="topology-neighbour" key={neighbour.parcelId}>
            <div><code>{neighbour.parcelId}</code><strong>{neighbour.landUse ?? neighbour.propertyType ?? 'Adjacent canonical parcel'}</strong></div>
            <span>{neighbour.sharedSegmentCount} shared segment{neighbour.sharedSegmentCount === 1 ? '' : 's'}</span>
            <small>{neighbour.sharedLengthMeters.toFixed(2)} m derived shared length · {neighbour.geometryId}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function coerceDraftValue(rawValue, originalValue) {
  if (typeof originalValue === 'number') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : originalValue;
  }
  if (typeof originalValue === 'boolean') return rawValue === 'true';
  if (Array.isArray(originalValue) || (originalValue && typeof originalValue === 'object')) {
    try { return JSON.parse(rawValue); } catch { return rawValue; }
  }
  return rawValue;
}

function ReviewerActions({ workspace, onReturnToConflict }) {
  const parcelId = workspace.parcelId;
  const conflictId = workspace.selectedConflict?.conflict_id ?? null;
  const initialState = loadReviewerState(parcelId, conflictId);
  const baseProposal = workspace.reconciliation.proposed_state ?? {};
  const [reviewState, setReviewState] = useState(() => initialState);
  const [note, setNote] = useState(() => initialState?.note ?? '');
  const [draftProposal, setDraftProposal] = useState(() => initialState?.modifiedProposal ?? baseProposal);

  useEffect(() => {
    const stored = loadReviewerState(parcelId, conflictId);
    setReviewState(stored);
    setNote(stored?.note ?? '');
    setDraftProposal(stored?.modifiedProposal ?? baseProposal);
  }, [parcelId, conflictId, workspace.reconciliation.proposed_state]);

  const updateDraftField = (field, rawValue) => {
    const originalValue = baseProposal[field];
    setDraftProposal((current) => ({ ...current, [field]: coerceDraftValue(rawValue, originalValue) }));
  };

  const applyAction = (action) => {
    const next = saveReviewerState(parcelId, conflictId, {
      action,
      note,
      modifiedProposal: action === 'MODIFY_PROPOSAL' ? draftProposal : reviewState?.modifiedProposal ?? null,
      datasetReconciliationTimestamp: workspace.reconciliation.reconciliation_timestamp ?? null,
    });
    setReviewState(next);
  };

  return (
    <section className="reviewer-state-panel" aria-labelledby="reviewer-actions-title">
      <div className="section-heading">
        <div>
          <h2 id="reviewer-actions-title">Reviewer action</h2>
          <p>Prototype decisions are stored separately in browser local storage. The CSV-derived dataset state above is never overwritten.</p>
        </div>
        <StatusBadge compact value="reviewer-local-state">Reviewer/session state</StatusBadge>
      </div>

      {reviewState && (
        <div className="reviewer-state-summary">
          <strong>{getReviewActionLabel(reviewState.action)}</strong>
          <span>Reviewer/session state · {reviewState.conflictId}</span>
        </div>
      )}

      <label className="review-note-field">
        <span>Reviewer note</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional reviewer/session note" rows={3} />
      </label>

      <details className="review-modify-details">
        <summary>Modify proposal fields</summary>
        <p>Fields are generated from <code>RECONCILED_PARCELS.proposed_state</code>. Edits remain reviewer-local until a real persistence/authority service is connected.</p>
        <div className="proposal-field-editor-grid">
          {Object.entries(baseProposal).map(([field, originalValue]) => {
            const value = draftProposal?.[field];
            const structured = Array.isArray(originalValue) || (originalValue && typeof originalValue === 'object');
            return (
              <label className="proposal-field-editor" key={field}>
                <span><code>{field}</code></span>
                {typeof originalValue === 'boolean' ? (
                  <select value={String(value)} onChange={(event) => updateDraftField(field, event.target.value)}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : structured ? (
                  <textarea
                    rows={4}
                    value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    onChange={(event) => updateDraftField(field, event.target.value)}
                    spellCheck="false"
                  />
                ) : (
                  <input
                    type={typeof originalValue === 'number' ? 'number' : 'text'}
                    value={value ?? ''}
                    onChange={(event) => updateDraftField(field, event.target.value)}
                  />
                )}
                <small>Dataset proposal: {displayValue(originalValue)}</small>
              </label>
            );
          })}
        </div>
      </details>

      <div className="review-action-grid">
        {REVIEW_ACTIONS.map(({ value: action, label }) => (
          <button
            className={action === 'ACCEPT_PROPOSAL' ? 'primary-action' : 'secondary-action'}
            type="button"
            key={action}
            onClick={() => applyAction(action)}
          >
            {label}
          </button>
        ))}
      </div>

      {reviewState && (
        <div className="review-return-row">
          <div>
            <strong>Reviewer/session action saved separately.</strong>
            <span>The original dataset reconciliation and conflict statuses remain unchanged.</span>
          </div>
          <button className="primary-action" type="button" onClick={() => onReturnToConflict(conflictId)}>
            Return to Conflict Explorer →
          </button>
        </div>
      )}
    </section>
  );
}

export default function ReconciliationEntry({ model, parcelId, selectedConflictId, openConflictIds, context, onBackToExplorer, onSelectConflict, onOpenCase }) {
  const workspace = useMemo(
    () => buildReconciliationWorkspace(model, parcelId, selectedConflictId),
    [model, parcelId, selectedConflictId]
  );


  if (!workspace.valid) {
    return (
      <section className="workspace detail-workspace" aria-labelledby="reconcile-entry-title">
        <button className="back-button" type="button" onClick={onBackToExplorer}>← Back to Conflict Explorer</button>
        <div className="load-error">
          <strong>Reconciliation context could not be reconstructed.</strong>
          <span>{workspace.reason === 'SELECTED_CONFLICT_NOT_OPEN'
            ? `Conflict ${workspace.selectedConflictId ?? selectedConflictId ?? '—'} is not open and is read-only. Return to the parcel case and select an open conflict.`
            : `${workspace.reason ?? 'Unknown dataset relationship error.'} No mock reconciliation record was substituted.`}</span>
        </div>
      </section>
    );
  }

  const { parcelCase, reconciliation } = workspace;
  const datasetOpenIds = parcelCase.openConflicts.map((conflict) => conflict.conflict_id);
  const routeOpenIds = openConflictIds ?? [];
  const routeMatchesDataset = routeOpenIds.length === 0 || (routeOpenIds.length === datasetOpenIds.length && routeOpenIds.every((id) => datasetOpenIds.includes(id)));
  const locality = parcelCase.canonicalParcel?.locality ?? null;

  return (
    <section className="workspace detail-workspace reconciliation-workspace" aria-labelledby="reconcile-entry-title">
      <button className="back-button" type="button" onClick={onBackToExplorer}>← Back to Conflict Explorer</button>

      <div className="reconcile-breadcrumb" aria-label="Reconciliation breadcrumb">
        <button type="button" onClick={onBackToExplorer}>Conflict Explorer</button>
        <span>/</span>
        <button type="button" onClick={() => onOpenCase(workspace.selectedConflict?.conflict_id)}>{parcelId}</button>
        <span>/</span>
        <strong>Reconcile</strong>
      </div>

      <div className="detail-header reconciliation-header">
        <div>
          <div className="eyebrow">Hidden downstream workspace</div>
          <h1 id="reconcile-entry-title">Reconcile {parcelId}</h1>
          {locality && <p>{locality}</p>}
          <div className="detail-badges">
            <StatusBadge value={parcelCase.parcelKind}>{parcelCase.isHistorical ? 'Historical parcel' : 'Current parcel'}</StatusBadge>
            <StatusBadge value={reconciliation.record_status}>{reconciliation.record_status}</StatusBadge>
            <StatusBadge value={reconciliation.match_status}>{reconciliation.match_status}</StatusBadge>
            {reconciliation.requires_human_review && <StatusBadge value="required">Human review required</StatusBadge>}
          </div>
        </div>
        <div className="reconciliation-context-card">
          <span>Selected conflict</span>
          <strong>{workspace.selectedConflict?.conflict_id}</strong>
          <small>{context ?? 'dataset route'} · {datasetOpenIds.length} open conflict{datasetOpenIds.length === 1 ? '' : 's'}</small>
          {!routeMatchesDataset && <small className="context-warning">URL open-conflict context was stale; dataset-derived open conflicts are being used.</small>}
        </div>
      </div>

      <ReconciliationStatus reconciliation={reconciliation} />
      <ConfidenceDimensions reconciliation={reconciliation} />
      <ProposalComparison workspace={workspace} />
      <ConflictList workspace={workspace} onSelectConflict={onSelectConflict} />
      <EvidenceChain workspace={workspace} />

      {workspace.spatial.entries.length > 0 && (
        <section className="reconcile-section" aria-labelledby="proposal-geometry-title">
          <div className="section-heading">
            <div>
              <h2 id="proposal-geometry-title">Spatial proposal comparison</h2>
              <p>Current parcel geometry, relevant source evidence, and proposed geometry are rendered from actual dataset coordinates only.</p>
            </div>
            <span>{workspace.spatial.entries.length} geometr{workspace.spatial.entries.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <GeometryEvidenceMap
            entries={workspace.spatial.entries}
            discrepancy={workspace.selectedInvestigation?.geometryDiscrepancy ?? null}
            sharedSegments={workspace.topologyImpact?.sharedSegments ?? []}
          />
          {workspace.spatial.proposedGeometryId && !workspace.spatial.proposedGeometryResolved && (
            <div className="review-error">Proposed geometry ID {workspace.spatial.proposedGeometryId} could not be resolved to dataset geometry.</div>
          )}
        </section>
      )}

      <ReconciliationTopologyImpact workspace={workspace} />
      <HistoryContext workspace={workspace} />
      <ReviewerActions workspace={workspace} onReturnToConflict={onOpenCase} />
    </section>
  );
}
