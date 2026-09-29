import { useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import GeometryEvidenceMap from './GeometryEvidenceMap.jsx';
import { getCaseStatus } from '../data/conflictExplorerSelectors.js';
import { buildConflictInvestigation, hasPresentValue } from '../data/conflictInvestigation.js';
import { getReviewActionLabel, loadReviewerState } from '../data/reviewerStateService.js';
import { deriveParcelTopologyImpact } from '../data/spatialConflictAnalysis.js';

function Field({ label, value, mono = false }) {
  if (!hasPresentValue(value)) return null;
  return (
    <div className="investigation-field">
      <span>{label}</span>
      <strong className={mono ? 'mono-value' : ''}>{String(value)}</strong>
    </div>
  );
}

function CountField({ label, value }) {
  return (
    <div className="case-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function valueSet(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(hasPresentValue))];
}

function EvidenceCard({ item }) {
  const { evidence, observation, geometry, metadata } = item;
  return (
    <article className="evidence-card">
      <div className="evidence-card-head">
        <div>
          <div className="evidence-id">{evidence.conflict_evidence_id}</div>
          <strong>{item.sourceType ?? evidence.evidence_type ?? 'Evidence'}</strong>
        </div>
        <div className="detail-badges">
          {evidence.evidence_role && <StatusBadge compact value={evidence.evidence_role}>{evidence.evidence_role}</StatusBadge>}
          {evidence.supports_or_contradicts && <StatusBadge compact value={evidence.supports_or_contradicts}>{evidence.supports_or_contradicts}</StatusBadge>}
        </div>
      </div>
      <div className="evidence-field-grid">
        <Field label="Source authority" value={metadata?.authority} />
        <Field label="Source record ID" value={observation?.source_record_id} mono />
        <Field label="Observation ID" value={evidence.observation_id ?? observation?.observation_id} mono />
        <Field label="Attribute" value={evidence.attribute_name} />
        <Field label="Observed value" value={evidence.observed_value} />
        <Field label="Observation date" value={observation?.observation_date} />
        <Field label="Source reliability" value={observation?.source_reliability} />
        <Field label="Geometry confidence" value={observation?.geometry_confidence} />
        <Field label="Attribute confidence" value={observation?.attribute_confidence} />
        <Field label="Identifier confidence" value={observation?.identifier_confidence} />
        <Field label="Positional accuracy (m)" value={observation?.positional_accuracy_m ?? geometry?.positional_accuracy_m} />
        <Field label="Temporal role" value={evidence.temporal_role} />
        <Field label="Geometry ID" value={evidence.geometry_id ?? geometry?.geometry_id} mono />
        <Field label="Original geometry CRS" value={geometry?.original_crs} />
        <Field label="Normalized geometry CRS" value={geometry?.normalized_crs} />
        <Field label="Evidence type" value={evidence.evidence_type} />
        <Field label="Source table" value={evidence.source_table} mono />
        <Field label="Notes" value={evidence.notes} />
      </div>
    </article>
  );
}

function SourceComparison({ groups }) {
  if (!groups.length) return <div className="empty-inline">No source evidence is linked to this conflict.</div>;
  return (
    <div className="dynamic-source-grid">
      {groups.map((group) => (
        <article className="source-card" key={group.sourceType}>
          <div className="source-card-head">
            <div>
              <span className="source-role">{group.roles.join(' · ')}</span>
              <h3>{group.sourceType}</h3>
            </div>
            {group.metadata?.authority && <span className="source-authority">{group.metadata.authority}</span>}
          </div>
          <div className="source-card-values">
            {group.conflictValues.map((item) => <Field key={`${group.sourceType}:${item.label}`} label={item.label} value={item.value} />)}
            {group.evidenceItems.map((item) => (
              <Field
                key={item.evidence.conflict_evidence_id}
                label={item.evidence.attribute_name ?? item.evidence.evidence_role ?? 'Evidence value'}
                value={item.evidence.observed_value}
              />
            ))}
          </div>
          {group.observations.length > 0 && (
            <div className="source-observation-list">
              {group.observations.map((observation) => (
                <code key={observation.observation_id}>{observation.observation_id}</code>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Provenance({ groups }) {
  return (
    <details className="investigation-details">
      <summary>Source provenance</summary>
      <div className="provenance-grid">
        {groups.map((group) => (
          <article className="provenance-card" key={`prov:${group.sourceType}`}>
            <h3>{group.sourceType}</h3>
            {group.metadata ? (
              <div className="evidence-field-grid">
                <Field label="Source name" value={group.metadata.source_name} />
                <Field label="Authority" value={group.metadata.authority} />
                <Field label="Acquisition date" value={group.metadata.acquisition_date} />
                <Field label="CRS" value={group.metadata.CRS} />
                <Field label="Nominal accuracy" value={group.metadata.nominal_accuracy} />
                <Field label="Metadata reliability" value={group.metadata.reliability} />
                <Field label="Temporal currency" value={group.metadata.temporal_currency} />
                <Field label="Update frequency" value={group.metadata.update_frequency} />
              </div>
            ) : (
              <div className="empty-inline">No SOURCE_METADATA row exists for this evidence source type.</div>
            )}
            {group.observations.map((observation) => (
              <div className="provenance-observation" key={`provobs:${observation.observation_id}`}>
                <Field label="Observation ID" value={observation.observation_id} mono />
                <Field label="Source record ID" value={observation.source_record_id} mono />
                <Field label="Observation date" value={observation.observation_date} />
                <Field label="Source reliability" value={observation.source_reliability} />
                <Field label="Geometry confidence" value={observation.geometry_confidence} />
                <Field label="Attribute confidence" value={observation.attribute_confidence} />
                <Field label="Identifier confidence" value={observation.identifier_confidence} />
                <Field label="Positional accuracy (m)" value={observation.positional_accuracy_m} />
                <Field label="Record status" value={observation.record_status} />
              </div>
            ))}
          </article>
        ))}
      </div>
    </details>
  );
}

function ParcelHistoryShortcut({ parcelCase }) {
  const hasHistory = parcelCase.geoGitEvents.length || parcelCase.lineageReferences.length || parcelCase.geometryVersions.length || parcelCase.historicalParcel;
  if (!hasHistory) return null;

  return (
    <details className="investigation-details history-shortcut">
      <summary>
        Parcel history · {parcelCase.geoGitEvents.length} GeoGit · {parcelCase.lineageReferences.length} lineage · {parcelCase.geometryVersions.length} geometry version{parcelCase.geometryVersions.length === 1 ? '' : 's'}
      </summary>
      <div className="history-grid">
        {parcelCase.historicalParcel && (
          <article className="history-section">
            <h3>Historical parcel record</h3>
            <div className="evidence-field-grid">
              <Field label="Record status" value={parcelCase.historicalParcel.record_status} />
              <Field label="Lineage status" value={parcelCase.historicalParcel.lineage_status} />
              <Field label="Former owner" value={parcelCase.historicalParcel.former_owner} />
              <Field label="Retired date" value={parcelCase.historicalParcel.retired_date} />
              <Field label="Retirement reason" value={parcelCase.historicalParcel.retirement_reason} />
              <Field label="Historical geometry ID" value={parcelCase.historicalParcel.historical_geometry_id} mono />
            </div>
          </article>
        )}

        {parcelCase.lineageReferences.length > 0 && (
          <article className="history-section">
            <h3>Lineage references</h3>
            <div className="history-list">
              {parcelCase.lineageReferences.map(({ event, role, relatedParcelId }) => (
                <div className="history-row" key={`${event.lineage_event_id}:${role}:${relatedParcelId}`}>
                  <strong>{event.event_type}</strong>
                  <span>{event.lineage_event_id} · {role}{relatedParcelId ? ` · ${relatedParcelId}` : ''}</span>
                  <span>{event.effective_date ?? ''}{event.accepted_status ? ` · ${event.accepted_status}` : ''}</span>
                  {event.reason && <p>{event.reason}</p>}
                </div>
              ))}
            </div>
          </article>
        )}

        {parcelCase.geometryVersions.length > 0 && (
          <article className="history-section">
            <h3>Geometry versions</h3>
            <div className="history-list">
              {parcelCase.geometryVersions.map((version) => (
                <div className="history-row" key={version.geometry_id}>
                  <strong>{version.geometry_id}</strong>
                  <span>{version.version_label ?? ''}{version.geometry_status ? ` · ${version.geometry_status}` : ''}</span>
                  <span>{version.effective_date ?? ''}{version.accepted_status ? ` · ${version.accepted_status}` : ''}</span>
                  {version.change_reason && <p>{version.change_reason}</p>}
                </div>
              ))}
            </div>
          </article>
        )}

        {parcelCase.geoGitEvents.length > 0 && (
          <article className="history-section history-section--wide">
            <h3>GeoGit events</h3>
            <div className="history-list history-list--events">
              {parcelCase.geoGitEvents.map((event) => (
                <div className="history-row" key={event.event_id}>
                  <strong>{event.event_type}</strong>
                  <span>{event.event_id} · {event.timestamp ?? ''}</span>
                  <span>{event.previous_version ?? '—'} → {event.resulting_version ?? '—'}</span>
                  {event.reason && <p>{event.reason}</p>}
                </div>
              ))}
            </div>
          </article>
        )}
      </div>
    </details>
  );
}

function ReviewerStateNotice({ reviewState }) {
  if (!reviewState) return null;
  return (
    <section className="reviewer-return-notice" aria-label="Reviewer session activity">
      <div>
        <span className="eyebrow">Reviewer/session state · separate from dataset status</span>
        <strong>{getReviewActionLabel(reviewState.action)}</strong>
        <span>{reviewState.conflictId}</span>
        {reviewState.note && <p>{reviewState.note}</p>}
      </div>
      <StatusBadge compact value="reviewer-local-state">Local reviewer action</StatusBadge>
    </section>
  );
}



function TopologyImpact({ topologyImpact }) {
  const neighbours = topologyImpact?.neighbours ?? [];
  if (!neighbours.length) {
    return (
      <section className="investigation-section" aria-labelledby="topology-impact-title">
        <div className="section-heading">
          <div>
            <h2 id="topology-impact-title">Neighbour / shared-boundary impact</h2>
            <p>No authoritative touching parcel boundary could be derived for this parcel from the current geometry registry.</p>
          </div>
          <span>{neighbours.length} neighbours</span>
        </div>
      </section>
    );
  }

  return (
    <section className="investigation-section" aria-labelledby="topology-impact-title">
      <div className="section-heading">
        <div>
          <h2 id="topology-impact-title">Neighbour / shared-boundary impact</h2>
          <p>Derived from touching authoritative parcel geometries. These are topology relationships, not invented adjacency labels.</p>
        </div>
        <span>{neighbours.length} touching parcel{neighbours.length === 1 ? '' : 's'}</span>
      </div>
      <div className="topology-neighbour-list">
        {neighbours.map((neighbour) => (
          <article className="topology-neighbour" key={neighbour.parcelId}>
            <div>
              <code>{neighbour.parcelId}</code>
              <strong>{neighbour.landUse ?? neighbour.propertyType ?? 'Adjacent canonical parcel'}</strong>
            </div>
            <span>{neighbour.sharedSegmentCount} shared boundary segment{neighbour.sharedSegmentCount === 1 ? '' : 's'}</span>
            <small>{neighbour.sharedLengthMeters.toFixed(2)} m derived shared length · {neighbour.geometryId}</small>
          </article>
        ))}
      </div>
      <p className="topology-caution">A boundary-changing reconciliation should be checked against these touching parcels because an authoritative shared edge may affect both sides.</p>
    </section>
  );
}

function ConflictSelector({ conflicts, selectedConflictId, onSelectConflict }) {
  return (
    <aside className="conflict-selector" aria-label="Conflicts in selected parcel">
      <div className="conflict-selector-heading">
        <span>Individual conflicts</span>
        <strong>{conflicts.length}</strong>
      </div>
      <div className="conflict-selector-list">
        {conflicts.map((conflict) => {
          const selected = conflict.conflict_id === selectedConflictId;
          return (
            <button
              type="button"
              key={conflict.conflict_id}
              className={`conflict-selector-item${selected ? ' is-selected' : ''}`}
              onClick={() => onSelectConflict(conflict.conflict_id)}
              aria-pressed={selected}
            >
              <div className="selector-id-row"><code>{conflict.conflict_id}</code><StatusBadge compact value={conflict.status}>{conflict.status}</StatusBadge></div>
              <strong>{conflict.conflict_type}</strong>
              <span>{conflict.attribute_or_geometry ?? '—'}</span>
              <div className="selector-badges">
                <StatusBadge compact value={conflict.severity}>{conflict.severity}</StatusBadge>
                <StatusBadge compact value={conflict.criticality}>{conflict.criticality}</StatusBadge>
              </div>
              <small>{conflict.source_a ?? '—'} ↔ {conflict.source_b ?? '—'}</small>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default function ParcelConflictCaseDetail({ model, parcelId, selectedConflictId, onSelectConflict, onBack, onReconcile }) {
  const parcelCase = model.parcelConflictCaseByParcelId.get(parcelId) ?? null;
  const exactSelectedConflict = parcelCase && selectedConflictId
    ? parcelCase.conflicts.find((conflict) => conflict.conflict_id === selectedConflictId) ?? null
    : null;
  const defaultConflict = parcelCase && !selectedConflictId
    ? (parcelCase.openConflicts[0] ?? parcelCase.conflicts[0] ?? null)
    : null;
  const selectedConflict = exactSelectedConflict ?? defaultConflict;
  const invalidSelectedConflict = Boolean(parcelCase && selectedConflictId && !exactSelectedConflict);
  const investigation = useMemo(
    () => parcelCase && selectedConflict ? buildConflictInvestigation(model, parcelCase, selectedConflict) : null,
    [model, parcelCase, selectedConflict]
  );
  const topologyImpact = useMemo(
    () => parcelCase ? deriveParcelTopologyImpact(model, parcelCase) : { neighbours: [], sharedSegments: [] },
    [model, parcelCase]
  );
  const [reviewState, setReviewState] = useState(null);

  useEffect(() => {
    if (parcelCase && !selectedConflictId && defaultConflict) onSelectConflict(defaultConflict.conflict_id);
  }, [defaultConflict, onSelectConflict, parcelCase, selectedConflictId]);

  useEffect(() => {
    if (!selectedConflict) {
      setReviewState(null);
      return undefined;
    }
    const refresh = () => setReviewState(loadReviewerState(parcelId, selectedConflict.conflict_id));
    refresh();
    window.addEventListener('praman-reviewer-state-changed', refresh);
    return () => window.removeEventListener('praman-reviewer-state-changed', refresh);
  }, [parcelId, selectedConflict]);

  if (!parcelCase || invalidSelectedConflict || !selectedConflict || !investigation) {
    return (
      <section className="workspace detail-workspace">
        <button className="back-button" type="button" onClick={onBack}>← Back to Conflict Explorer</button>
        <div className="empty-state">{!parcelCase ? <>No conflict case resolves to parcel ID <strong>{parcelId}</strong>.</> : <>Conflict ID <strong>{selectedConflictId}</strong> does not belong to parcel <strong>{parcelId}</strong>.</>} No mock record was substituted.</div>
      </section>
    );
  }
  const caseStatus = getCaseStatus(parcelCase);
  const severities = valueSet(parcelCase.conflicts, 'severity');
  const criticalities = valueSet(parcelCase.conflicts, 'criticality');
  const locality = parcelCase.canonicalParcel?.locality ?? null;
  const selectedConflictIsOpen = parcelCase.openConflicts.some((conflict) => conflict.conflict_id === selectedConflict.conflict_id);
  const canReconcile = selectedConflictIsOpen;

  return (
    <section className="workspace detail-workspace investigation-workspace" aria-labelledby="case-title">
      <button className="back-button" type="button" onClick={onBack}>← Back to Conflict Explorer</button>

      <div className="detail-header investigation-header">
        <div>
          <div className="eyebrow">Conflict Explorer · Parcel investigation</div>
          <h1 id="case-title">{parcelCase.parcelId}</h1>
          {locality && <p>{locality}</p>}
          <div className="detail-badges">
            <StatusBadge value={parcelCase.parcelKind}>{parcelCase.isHistorical ? 'Historical parcel' : parcelCase.isCurrent ? 'Current parcel' : parcelCase.parcelKind}</StatusBadge>
            <StatusBadge value={caseStatus}>{caseStatus}</StatusBadge>
            {parcelCase.humanReviewRequired && <StatusBadge value="required">Human review required</StatusBadge>}
          </div>
        </div>
      </div>

      <div className="case-stat-strip">
        <CountField label="Associated conflicts" value={parcelCase.conflicts.length} />
        <CountField label="Open conflicts" value={parcelCase.openConflicts.length} />
        <CountField label="Resolved conflicts" value={parcelCase.resolvedConflicts.length} />
        <div className="case-stat"><span>Human review</span><strong>{parcelCase.humanReviewRequired ? 'Required' : 'Not required'}</strong></div>
        <div className="case-stat"><span>Severity represented</span><div className="stat-badges">{severities.map((value) => <StatusBadge compact key={value} value={value}>{value}</StatusBadge>)}</div></div>
        <div className="case-stat"><span>Criticality represented</span><div className="stat-badges">{criticalities.map((value) => <StatusBadge compact key={value} value={value}>{value}</StatusBadge>)}</div></div>
      </div>

      <ReviewerStateNotice reviewState={reviewState} />

      <div className="investigation-layout">
        <ConflictSelector
          conflicts={parcelCase.conflicts}
          selectedConflictId={selectedConflict.conflict_id}
          onSelectConflict={onSelectConflict}
        />

        <div className="investigation-content">
          <article className="investigation-panel conflict-explanation-panel">
            <div className="section-heading">
              <div><div className="eyebrow">Selected conflict</div><h2>{selectedConflict.conflict_id} · {selectedConflict.conflict_type}</h2></div>
              <div className="detail-badges">
                <StatusBadge compact value={selectedConflict.status}>{selectedConflict.status}</StatusBadge>
                <StatusBadge compact value={selectedConflict.severity}>{selectedConflict.severity}</StatusBadge>
                <StatusBadge compact value={selectedConflict.criticality}>{selectedConflict.criticality}</StatusBadge>
              </div>
            </div>
            <div className="conflict-explain-grid">
              <Field label="Conflict type" value={selectedConflict.conflict_type} />
              <Field label="Attribute / geometry" value={selectedConflict.attribute_or_geometry} />
              <Field label="Source A" value={selectedConflict.source_a} />
              <Field label="Source B" value={selectedConflict.source_b} />
              <Field label="Source A value" value={selectedConflict.source_a_value} />
              <Field label="Source B value" value={selectedConflict.source_b_value} />
              <Field label="Severity" value={selectedConflict.severity} />
              <Field label="Criticality" value={selectedConflict.criticality} />
              <Field label="Status" value={selectedConflict.status} />
              <Field label="Human review required" value={selectedConflict.human_review_required ? 'True' : 'False'} />
              <Field label="Recommended next evidence" value={selectedConflict.recommended_next_evidence} />
            </div>
            {selectedConflict.explanation && <div className="dataset-explanation"><span>Dataset explanation</span><p>{selectedConflict.explanation}</p></div>}
          </article>

          <section className="investigation-section" aria-labelledby="source-comparison-title">
            <div className="section-heading">
              <div><h2 id="source-comparison-title">Source comparison</h2><p>Columns are generated only from sources participating in this conflict and its linked evidence.</p></div>
              <span>{investigation.sourceGroups.length} source type{investigation.sourceGroups.length === 1 ? '' : 's'}</span>
            </div>
            <SourceComparison groups={investigation.sourceGroups} />
          </section>

          {investigation.hasGeometry && (
            <section className={`investigation-section spatial-section${investigation.isSpatialConflict ? '' : ' spatial-section--context'}`} aria-labelledby="spatial-title">
              <div className="section-heading">
                <div>
                  <h2 id="spatial-title">{investigation.isSpatialConflict ? 'Spatial conflict view' : 'Spatial evidence context'}</h2>
                  <p>Actual normalized dataset geometries; viewport is fitted to the geometries shown.</p>
                </div>
                <span>{investigation.geometryEntries.length} geometr{investigation.geometryEntries.length === 1 ? 'y' : 'ies'}</span>
              </div>
              <GeometryEvidenceMap
                entries={investigation.geometryEntries}
                compact={!investigation.isSpatialConflict}
                discrepancy={investigation.geometryDiscrepancy}
                sharedSegments={investigation.isSpatialConflict ? topologyImpact.sharedSegments : []}
              />
              {investigation.geometryDiscrepancy?.highlightedSegments?.length > 0 && (
                <div className="geometry-discrepancy-summary">
                  <strong>Derived source-edge discrepancy</strong>
                  <span>Largest displayed source-edge separation: {investigation.geometryDiscrepancy.maxSeparationMeters.toFixed(2)} m. This is a visual comparison derived from the two source geometries, not a replacement for the dataset conflict value.</span>
                </div>
              )}
            </section>
          )}

          <section className="investigation-section" aria-labelledby="evidence-chain-title">
            <div className="section-heading">
              <div><h2 id="evidence-chain-title">Evidence chain</h2><p>Conflict evidence → observation → geometry → source metadata, where those joins exist.</p></div>
              <span>{investigation.evidenceItems.length} record{investigation.evidenceItems.length === 1 ? '' : 's'}</span>
            </div>
            {investigation.evidenceItems.length ? (
              <div className="evidence-card-list">{investigation.evidenceItems.map((item) => <EvidenceCard key={item.evidence.conflict_evidence_id} item={item} />)}</div>
            ) : (
              <div className="empty-inline">No CONFLICT_EVIDENCE rows are linked to this conflict.</div>
            )}
          </section>

          <Provenance groups={investigation.sourceGroups} />
          <TopologyImpact topologyImpact={topologyImpact} />
          <ParcelHistoryShortcut parcelCase={parcelCase} />

          <div className="reconciliation-entry-bar">
            <div>
              <strong>Investigation context is retained in the URL.</strong>
              <span>{canReconcile
                ? `${parcelCase.openConflicts.length} open conflict${parcelCase.openConflicts.length === 1 ? '' : 's'} available; the selected conflict ${selectedConflict.conflict_id} is open and can be reconciled.`
                : parcelCase.openConflicts.length > 0
                  ? `The selected conflict ${selectedConflict.conflict_id} is already resolved. Select an open conflict to reconcile.`
                  : 'This case has no open conflicts to reconcile.'}</span>
            </div>
            <button
              className="primary-action"
              type="button"
              disabled={!canReconcile}
              onClick={() => onReconcile(parcelCase, selectedConflict.conflict_id)}
            >
              Open Reconciliation →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
