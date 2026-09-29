import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchParcelHistoryDetail, TIMELINE_MESSAGES } from './api';
import { hasExplicitAuthorityEvidence, historicalStateForEvent, proposalComparisons } from './historyStateSemantics';
import { buildConflictExplorerLink, buildEvidenceGraphLink } from './layer4DeepLinks';
import { layer4EventSelectionKey, readLayer4SelectedEvent, urlWithLayer4SelectedEvent } from './layer4NavigationState';
import { GeometryChangeSpatialInspector, LazyGeometryCard, LineageSpatialInspector } from './SpatialHistory';
import './parcelTimeline.css';

const EVENT_META = Object.freeze({
  SURVEY_OBSERVATION: { label: 'Survey / physical observation', short: 'Survey', icon: '◎', tone: 'survey' },
  GEOMETRY_CHANGE: { label: 'Geometry change', short: 'Geometry', icon: '◇', tone: 'geometry' },
  OFFICIAL_APPROVAL: { label: 'Official approval', short: 'Approval', icon: '✓', tone: 'approval' },
  MUTATION: { label: 'Mutation / record change', short: 'Mutation', icon: '↺', tone: 'mutation' },
  SPLIT: { label: 'Split', short: 'Split', icon: '⑂', tone: 'split' },
  MERGE: { label: 'Merge', short: 'Merge', icon: '⋈', tone: 'merge' },
  CONFLICT: { label: 'Conflict / discrepancy', short: 'Conflict', icon: '!', tone: 'conflict' },
  ADMINISTRATIVE_METADATA: { label: 'Administrative metadata', short: 'Administrative', icon: '•', tone: 'administrative' }
});

function present(value, fallback = 'Not recorded') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function readable(value) {
  if (!value) return 'Not recorded';
  return String(value)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function timelineDate(event) {
  return event?.effective_date || event?.recorded_date || null;
}

function formatMoment(value) {
  if (!value) return 'Date not recorded';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  const hasTime = /\d{2}:\d{2}/.test(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {})
  }).format(date);
}

function yearFor(event) {
  const value = timelineDate(event);
  const match = value && String(value).match(/^(\d{4})/);
  return match ? match[1] : 'Undated';
}

function groupLineageEvents(events) {
  const output = [];
  const grouped = new Map();

  events.forEach((event) => {
    if (!['SPLIT', 'MERGE'].includes(event.event_type)) {
      output.push({ ...event, memberEvents: [event] });
      return;
    }

    const eventDay = timelineDate(event)?.slice(0, 10) || 'undated';
    const key = [
      event.event_type,
      event.event_subtype || '',
      eventDay,
      event.source || '',
      event.description || ''
    ].join('|');

    if (!grouped.has(key)) {
      const visual = {
        ...event,
        memberEvents: [event],
        related_parent_parcels: [...new Set(event.related_parent_parcels || [])],
        related_child_parcels: [...new Set(event.related_child_parcels || [])]
      };
      grouped.set(key, visual);
      output.push(visual);
      return;
    }

    const visual = grouped.get(key);
    visual.memberEvents.push(event);
    visual.related_parent_parcels = [...new Set([
      ...(visual.related_parent_parcels || []),
      ...(event.related_parent_parcels || [])
    ])];
    visual.related_child_parcels = [...new Set([
      ...(visual.related_child_parcels || []),
      ...(event.related_child_parcels || [])
    ])];

    if (!visual.recorded_date && event.recorded_date) visual.recorded_date = event.recorded_date;
    if (!visual.effective_date && event.effective_date) visual.effective_date = event.effective_date;
  });

  return output.sort((left, right) => {
    const leftDate = timelineDate(left);
    const rightDate = timelineDate(right);
    if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    return String(left.adapter_event_key || '').localeCompare(String(right.adapter_event_key || ''));
  });
}

function LineageCue({ event }) {
  const parents = [...new Set(event.related_parent_parcels || [])];
  const children = [...new Set(event.related_child_parcels || [])];
  const parcelId = event.parcel_id;

  if (event.event_type === 'SPLIT') {
    const isParent = parents.includes(parcelId);
    const text = isParent
      ? (children.length ? `${children.length} descendant${children.length === 1 ? '' : 's'}` : 'Split relationship recorded')
      : (parents.length ? `Result of split from ${parents.length} parent${parents.length === 1 ? '' : 's'}` : 'Split relationship recorded');

    return (
      <div className="lineage-cue" aria-label={text}>
        <span className="lineage-mini lineage-mini--split" aria-hidden="true"><i /><i /><i /></span>
        <span>{text}</span>
      </div>
    );
  }

  if (event.event_type === 'MERGE') {
    const isChild = children.includes(parcelId);
    const text = isChild
      ? (parents.length ? `${parents.length} parent${parents.length === 1 ? '' : 's'} converged` : 'Merge relationship recorded')
      : (children.length ? `Merged into ${children.length} successor${children.length === 1 ? '' : 's'}` : 'Merge relationship recorded');

    return (
      <div className="lineage-cue" aria-label={text}>
        <span className="lineage-mini lineage-mini--merge" aria-hidden="true"><i /><i /><i /></span>
        <span>{text}</span>
      </div>
    );
  }

  return null;
}

function TimelineEvent({ event, onInspect, historicalStateAvailable = false, isSelected = false }) {
  const meta = EVENT_META[event.event_type] || EVENT_META.ADMINISTRATIVE_METADATA;
  const dateKind = event.effective_date ? 'Effective' : event.recorded_date ? 'Recorded' : null;

  return (
    <button
      type="button"
      className={`parcel-history-event parcel-history-event--${meta.tone}${isSelected ? ' parcel-history-event--selected' : ''}`}
      onClick={() => onInspect(event)}
      aria-label={`Inspect ${meta.label}: ${readable(event.event_subtype || event.event_type)}`}
      aria-pressed={isSelected}
    >
      <span className="event-axis" aria-hidden="true">
        <span className="event-node" title={meta.label}>{meta.icon}</span>
      </span>

      <span className="event-body">
        <span className="event-topline">
          <span className="event-category">{meta.short}</span>
          <span className="event-date">
            {dateKind ? `${dateKind} · ${formatMoment(timelineDate(event))}` : 'Date not recorded'}
          </span>
        </span>

        <strong className="event-title">{readable(event.event_subtype || event.event_type)}</strong>
        {event.description && <span className="event-description">{event.description}</span>}

        <span className="event-footer">
          <span>{event.source || 'Source not recorded'}</span>
          {(event.parcel_version_before || event.parcel_version_after) && (
            <span>
              {event.parcel_version_before || '—'} → {event.parcel_version_after || '—'}
            </span>
          )}
        </span>

        <LineageCue event={event} />
        {historicalStateAvailable && (
          <span className="event-state-cue"><span aria-hidden="true">◷</span> Past state available</span>
        )}
      </span>
    </button>
  );
}

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="inspector-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function writeSelectedHistoryEventToLocation(event) {
  const url = urlWithLayer4SelectedEvent(window.location, event);
  window.history.replaceState(window.history.state, '', url);
}

function conflictExplorerLink(event, conflictId) {
  return buildConflictExplorerLink({
    conflictId,
    parcelId: event.parcel_id,
    eventId: layer4EventSelectionKey(event),
    from: 'parcel-history'
  }, window.location);
}

function evidenceGraphLink(event, extra = {}) {
  return buildEvidenceGraphLink({
    parcelId: event.parcel_id,
    source: event.source,
    sourceRecordId: event.source_record_id,
    observationId: event.observation_id,
    eventId: layer4EventSelectionKey(event),
    from: 'parcel-history',
    ...extra
  }, window.location);
}

function parcelEvidenceLink(parcelId, extra = {}) {
  return buildEvidenceGraphLink({ parcelId, from: 'parcel-history', ...extra }, window.location);
}

function parcelConflictLink(parcelId, conflictId) {
  return buildConflictExplorerLink({ parcelId, conflictId, from: 'parcel-history' }, window.location);
}

function ActionLink({ href, children }) {
  return <a className="inspector-action-link" href={href}>{children}<span aria-hidden="true">↗</span></a>;
}

function SurveyInspectorDetails({ event }) {
  const measurement = [
    event.observation_geometry_id ? `Geometry ${event.observation_geometry_id}` : null,
    event.observed_area_sqm !== null && event.observed_area_sqm !== undefined ? formatArea(event.observed_area_sqm) : null,
    event.positional_accuracy_m !== null && event.positional_accuracy_m !== undefined ? `±${event.positional_accuracy_m} m` : null
  ].filter(Boolean).join(' · ');

  return (
    <section className="inspector-section">
      <h3>Survey observation</h3>
      <dl>
        <DetailRow label="Survey / source type" value={readable(event.event_subtype || event.source)} />
        <DetailRow label="Observation date" value={event.effective_date ? formatMoment(event.effective_date) : null} />
        <DetailRow label="Survey status" value={event.survey_status ? readable(event.survey_status) : null} />
        <DetailRow label="Measurement relation" value={measurement || null} />
        <DetailRow label="Measurement CRS" value={event.measurement_crs} />
      </dl>
    </section>
  );
}

function GeometryInspectorDetails({ event }) {
  return (
    <section className="inspector-section">
      <h3>Geometry change</h3>
      <dl>
        <DetailRow label="Geometry before" value={event.geometry_version_before} />
        <DetailRow label="Geometry after" value={event.geometry_version_after} />
        <DetailRow label="Area before" value={formatArea(event.area_before_sqm)} />
        <DetailRow label="Area after" value={formatArea(event.area_after_sqm)} />
        <DetailRow label="Reason" value={event.description} />
        <DetailRow label="Acceptance status" value={event.authority_status ? readable(event.authority_status) : null} />
        <DetailRow label="Geometry status" value={event.geometry_status ? readable(event.geometry_status) : null} />
      </dl>
      <GeometryChangeSpatialInspector event={event} />
    </section>
  );
}

function ApprovalInspectorDetails({ event }) {
  return (
    <section className="inspector-section">
      <h3>Approval</h3>
      <dl>
        <DetailRow label="Approved state / version" value={event.parcel_version_after} />
        <DetailRow label="Authority status" value={event.authority_status ? readable(event.authority_status) : null} />
        <DetailRow label="Effective date" value={event.effective_date ? formatMoment(event.effective_date) : null} />
      </dl>
      {!event.effective_date && <p className="inspector-note">No separate effective date is recorded for this approval event.</p>}
    </section>
  );
}

function MutationInspectorDetails({ event }) {
  const explicitGeometryChange = event.geometry_version_before || event.geometry_version_after;
  return (
    <section className="inspector-section">
      <h3>Mutation</h3>
      {explicitGeometryChange ? (
        <dl>
          <DetailRow label="Geometry before" value={event.geometry_version_before} />
          <DetailRow label="Geometry after" value={event.geometry_version_after} />
        </dl>
      ) : (
        <p className="inspector-note">The dataset does not record a field-level or geometry delta for this mutation, so none is inferred.</p>
      )}
    </section>
  );
}

function SplitInspectorDetails({ event }) {
  const parents = [...new Set(event.related_parent_parcels || [])];
  const children = [...new Set(event.related_child_parcels || [])];
  return (
    <section className="inspector-section">
      <h3>Split relationship</h3>
      <dl>
        <DetailRow label="Parent parcel" value={parents.length ? parents.join(', ') : null} />
        <DetailRow label="Resulting child parcel(s)" value={children.length ? children.join(', ') : null} />
        <DetailRow label="Effective date" value={event.effective_date ? formatMoment(event.effective_date) : null} />
      </dl>
      <LineageSpatialInspector event={event} />
    </section>
  );
}

function MergeInspectorDetails({ event }) {
  const parents = [...new Set(event.related_parent_parcels || [])];
  const children = [...new Set(event.related_child_parcels || [])];
  return (
    <section className="inspector-section">
      <h3>Merge relationship</h3>
      <dl>
        <DetailRow label="Input parent parcel(s)" value={parents.length ? parents.join(', ') : null} />
        <DetailRow label="Resulting parcel" value={children.length ? children.join(', ') : null} />
        <DetailRow label="Effective date" value={event.effective_date ? formatMoment(event.effective_date) : null} />
      </dl>
      <LineageSpatialInspector event={event} />
    </section>
  );
}

function ConflictInspectorDetails({ event }) {
  const conflicts = Array.isArray(event.conflict_details) ? event.conflict_details : [];
  const referencedIds = [...new Set(event.related_conflict_ids || [])];

  return (
    <section className="inspector-section">
      <h3>Conflict</h3>
      {conflicts.length ? conflicts.map((conflict) => (
        <div className="conflict-inspector-case" key={conflict.conflictId}>
          <dl>
            <DetailRow label="Conflict type" value={conflict.conflictType ? readable(conflict.conflictType) : null} />
            <DetailRow label="Sources involved" value={[conflict.sourceA, conflict.sourceB].filter(Boolean).join(' ↔ ') || null} />
            <DetailRow label="Status" value={conflict.status ? readable(conflict.status) : null} />
            <DetailRow label="Affected field" value={conflict.attributeOrGeometry} />
            <DetailRow label="Explanation" value={conflict.explanation} />
            <DetailRow label="Recommended next evidence" value={conflict.recommendedNextEvidence} />
          </dl>
          <div className="inspector-action-row">
            <ActionLink href={conflictExplorerLink(event, conflict.conflictId)}>Open Conflict Case</ActionLink>
            <ActionLink href={evidenceGraphLink(event, { conflictId: conflict.conflictId })}>VIEW SUPPORTING EVIDENCE</ActionLink>
          </div>
        </div>
      )) : (
        <div className="conflict-inspector-case">
          <dl><DetailRow label="Conflict reference" value={referencedIds.length ? referencedIds.join(', ') : null} /></dl>
          {referencedIds.map((conflictId) => (
            <ActionLink key={conflictId} href={conflictExplorerLink(event, conflictId)}>Open Conflict Case</ActionLink>
          ))}
        </div>
      )}
    </section>
  );
}

function EventSpecificDetails({ event }) {
  switch (event.event_type) {
    case 'SURVEY_OBSERVATION': return <SurveyInspectorDetails event={event} />;
    case 'GEOMETRY_CHANGE': return <GeometryInspectorDetails event={event} />;
    case 'OFFICIAL_APPROVAL': return <ApprovalInspectorDetails event={event} />;
    case 'MUTATION': return <MutationInspectorDetails event={event} />;
    case 'SPLIT': return <SplitInspectorDetails event={event} />;
    case 'MERGE': return <MergeInspectorDetails event={event} />;
    case 'CONFLICT': return <ConflictInspectorDetails event={event} />;
    default: return null;
  }
}

function TechnicalProvenance({ event, members }) {
  const eventIds = [...new Set(members.map((item) => item.event_id).filter(Boolean))];
  const lineageRecordIds = [...new Set(
    members
      .filter((item) => item.source_table === 'PARCEL_LINEAGE')
      .map((item) => item.event_id)
      .filter(Boolean)
  )];
  const internalEventIds = eventIds.filter((eventId) => !lineageRecordIds.includes(eventId));
  const geogitIds = [...new Set(members.map((item) => item.related_geogit_event_id).filter(Boolean))];
  const commitIds = [...new Set(members.map((item) => item.related_commit_id).filter(Boolean))];
  const observationIds = [...new Set(members.map((item) => item.observation_id).filter(Boolean))];
  const adapterKeys = [...new Set(members.map((item) => item.adapter_event_key).filter(Boolean))];
  const hasTechnicalData = event.source_table || eventIds.length || geogitIds.length || commitIds.length || observationIds.length || adapterKeys.length;

  return (
    <details className="technical-provenance">
      <summary>Technical Provenance</summary>
      <div className="technical-provenance-body">
        {hasTechnicalData ? (
          <dl>
            <DetailRow label="Source table" value={event.source_table} />
            <DetailRow label="GeoGit event" value={geogitIds.length ? geogitIds.join(', ') : null} />
            <DetailRow label="GeoGit commit" value={commitIds.length ? commitIds.join(', ') : null} />
            <DetailRow label="Lineage record ID" value={lineageRecordIds.length ? lineageRecordIds.join(', ') : null} />
            <DetailRow label="Observation ID" value={observationIds.length ? observationIds.join(', ') : null} />
            <DetailRow label="Internal event ID" value={internalEventIds.length ? internalEventIds.join(', ') : null} />
            <DetailRow label="Adapter event key" value={adapterKeys.length ? adapterKeys.join(', ') : null} />
          </dl>
        ) : <p className="inspector-note">No additional technical provenance is recorded.</p>}
      </div>
    </details>
  );
}

function EventInspector({ event, historicalState, onViewHistoricalState, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!event) return undefined;
    const previousFocus = document.activeElement;
    const onKeyDown = (keyEvent) => {
      if (keyEvent.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [event, onClose]);

  if (!event) return null;

  const meta = EVENT_META[event.event_type] || EVENT_META.ADMINISTRATIVE_METADATA;
  const members = event.memberEvents || [event];
  const sourceRecordIds = [...new Set(members.map((item) => item.source_record_id).filter(Boolean))];
  const conflictIds = [...new Set(members.flatMap((item) => item.related_conflict_ids || []).filter(Boolean))];
  const parents = [...new Set(event.related_parent_parcels || [])];
  const children = [...new Set(event.related_child_parcels || [])];
  const datesDiffer = event.effective_date && event.recorded_date
    && event.effective_date.slice(0, 10) !== event.recorded_date.slice(0, 10);
  const relationship = [
    parents.length ? `Parent: ${parents.join(', ')}` : null,
    children.length ? `Child: ${children.join(', ')}` : null
  ].filter(Boolean).join(' · ');
  const canOpenEvidence = Boolean(event.source || event.source_record_id || event.observation_id);

  return (
    <div className="event-inspector-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className={`event-inspector event-inspector--${meta.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eventInspectorTitle"
        onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <div className="inspector-head">
          <div>
            <span className="inspector-kicker"><span aria-hidden="true">{meta.icon}</span> EVENT INSPECTOR</span>
            <h2 id="eventInspectorTitle">{readable(event.event_subtype || event.event_type)}</h2>
            <span className="inspector-event-type">{meta.label}</span>
          </div>
          <button ref={closeButtonRef} type="button" className="inspector-close" onClick={onClose} aria-label="Close event inspector" title="Close event inspector">×</button>
        </div>

        {event.description && <p className="inspector-description">{event.description}</p>}

        <section className="inspector-section inspector-section--primary">
          <h3>Event record</h3>
          <dl>
            <DetailRow label="Event type" value={meta.label} />
            <DetailRow label="Event subtype" value={readable(event.event_subtype || event.event_type)} />
            <DetailRow label="Effective date" value={event.effective_date ? formatMoment(event.effective_date) : 'Not recorded'} />
            <DetailRow label="Recorded date" value={event.recorded_date ? formatMoment(event.recorded_date) : 'Not recorded'} />
            <DetailRow label="Parcel version before" value={event.parcel_version_before} />
            <DetailRow label="Parcel version after" value={event.parcel_version_after} />
            <DetailRow label="Geometry version before" value={event.geometry_version_before} />
            <DetailRow label="Geometry version after" value={event.geometry_version_after} />
            <DetailRow label="Source" value={event.source} />
            <DetailRow label="Source record" value={sourceRecordIds.length ? sourceRecordIds.join(', ') : null} />
            <DetailRow label="Authority status" value={event.authority_status ? readable(event.authority_status) : null} />
            <DetailRow label="Review status" value={event.review_status ? readable(event.review_status) : null} />
            <DetailRow label="Related conflict" value={conflictIds.length ? conflictIds.join(', ') : null} />
            <DetailRow label="Related parcel relationship" value={relationship || null} />
          </dl>
          {datesDiffer && <p className="inspector-note">The recorded date differs from the effective date.</p>}
        </section>

        <EventSpecificDetails event={event} />

        {historicalState && (
          <section className="inspector-state-action" aria-label="Historical state action">
            <div>
              <span>Historical effective state available</span>
              <strong>{historicalState.parcelVersion || historicalState.geometryVersion || historicalState.parcelId}</strong>
            </div>
            <button
              type="button"
              className="view-state-button"
              onClick={() => {
                onViewHistoricalState(historicalState);
                onClose();
              }}
            >
              VIEW STATE AT THIS POINT
            </button>
          </section>
        )}

        {canOpenEvidence && (
          <section className="inspector-section inspector-context-links">
            <h3>Related context</h3>
            <ActionLink href={evidenceGraphLink(event)}>VIEW SUPPORTING EVIDENCE</ActionLink>
          </section>
        )}

        <TechnicalProvenance event={event} members={members} />
      </aside>
    </div>
  );
}

function formatArea(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(number)} m²`;
}

function CurrentAuthoritativePanel({ state, parcel }) {
  if (!hasExplicitAuthorityEvidence(state)) {
    return (
      <section className="state-panel state-panel--current state-panel--unavailable" aria-labelledby="currentStateTitle">
        <div className="state-panel-heading">
          <span className="state-panel-kicker" id="currentStateTitle"><span aria-hidden="true">!</span> CURRENT AUTHORITATIVE STATE</span>
        </div>
        <strong className="state-unavailable-title">Authoritative state unavailable from current records</strong>
        <p className="state-panel-note">
          {parcel.identityClass === 'HISTORICAL_RETIRED'
            ? 'This parcel identity is historical and has no accepted current canonical state.'
            : 'Layer 4 will not infer authority from recency, model scoring, reconciliation output, or survey accuracy.'}
        </p>
        <div className="data-quality-flag">Data-quality issue</div>
      </section>
    );
  }

  const geometryLabel = [state.geometry?.geometryId, state.geometry?.version].filter(Boolean).join(' · ');
  const conflictLabel = state.openConflictStatus === 'OPEN'
    ? `${state.openConflictCount} OPEN`
    : state.openConflictStatus === 'NONE_OPEN' ? 'NO OPEN CONFLICTS' : null;

  return (
    <section className="state-panel state-panel--current" aria-labelledby="currentStateTitle">
      <div className="state-panel-heading">
        <span className="state-panel-kicker" id="currentStateTitle"><span className="state-official-icon" aria-hidden="true">✓</span> CURRENT AUTHORITATIVE STATE</span>
        <strong className="state-parcel-id">{state.parcelId}</strong>
        <div className="state-badge-row">
          <span className="state-badge state-badge--official">{state.authorityStatus}</span>
          {state.recordStatus && <span className="state-badge">{readable(state.recordStatus)}</span>}
        </div>
      </div>

      <LazyGeometryCard
        label="OFFICIAL GEOMETRY"
        geometryRef={state.geometry}
        parcelId={state.parcelId}
        spatialState="current-authoritative"
        tone="official"
        sublabel={geometryLabel ? `Version ${state.geometry?.version || state.authoritativeGeometryVersion || 'not recorded'}` : null}
        unavailableText="Official geometry unavailable from current records"
      />

      <dl className="state-detail-list">
        <DetailRow label="Current accepted parcel version" value={state.acceptedParcelVersion || state.parcelVersion} />
        <DetailRow label="Legal / Authority Status" value={state.authorityStatus} />
        <DetailRow label="Area" value={formatArea(state.areaSqM)} />
        <DetailRow label="Recorded Owner / Holder" value={state.owner} />
        <DetailRow label="Land Use" value={state.landUse ? readable(state.landUse) : null} />
        <DetailRow label="Tenure" value={state.tenureType ? readable(state.tenureType) : null} />
        <DetailRow label="Geometry Status" value={state.geometry?.geometryStatus ? readable(state.geometry.geometryStatus) : null} />
        <DetailRow label="Last Official Change" value={state.lastOfficialChange?.timestamp ? formatMoment(state.lastOfficialChange.timestamp) : null} />
        <DetailRow label="Open Conflict Status" value={conflictLabel} />
      </dl>

      {state.lastOfficialChange?.reason && (
        <p className="state-panel-note">Last official change: {state.lastOfficialChange.reason}</p>
      )}

      <div className="state-integration-actions">
        <ActionLink href={parcelEvidenceLink(state.parcelId, {
          state: 'current-authoritative',
          geometryId: state.geometry?.geometryId,
          parcelVersion: state.acceptedParcelVersion || state.parcelVersion
        })}>VIEW SUPPORTING EVIDENCE</ActionLink>
        {state.openConflictIds?.length > 0 && (
          <ActionLink href={parcelConflictLink(state.parcelId, state.openConflictIds.length === 1 ? state.openConflictIds[0] : null)}>
            {state.openConflictIds.length === 1 ? 'OPEN CONFLICT CASE' : 'OPEN CONFLICT EXPLORER'}
          </ActionLink>
        )}
      </div>
    </section>
  );
}

function HistoricalStatePanel({ state, onReturnToCurrent }) {
  if (!state) return null;
  const geometryLabel = [state.geometry?.geometryId, state.geometryVersion || state.geometry?.version].filter(Boolean).join(' · ');
  const period = [
    state.effectiveDate ? formatMoment(state.effectiveDate) : null,
    state.retiredDate ? formatMoment(state.retiredDate) : null
  ].filter(Boolean).join(' → ');

  return (
    <section className="state-panel state-panel--historical" aria-labelledby="historicalStateTitle">
      <div className="state-panel-heading">
        <span className="state-panel-kicker state-panel-kicker--historical" id="historicalStateTitle"><span aria-hidden="true">◷</span> HISTORICAL STATE</span>
        <strong className="state-parcel-id">{state.parcelId}</strong>
        <div className="state-badge-row">
          <span className="state-badge state-badge--historical">{readable(state.recordStatus || 'HISTORICAL')}</span>
        </div>
      </div>

      <LazyGeometryCard
        label="HISTORICAL GEOMETRY"
        geometryRef={state.geometry}
        parcelId={state.parcelId}
        spatialState="historical"
        tone="historical"
        sublabel={[state.geometryVersion || state.geometry?.version, state.effectiveDate ? formatMoment(state.effectiveDate) : null].filter(Boolean).join(' · ')}
        unavailableText="Geometry version unavailable for this historical event"
      />

      <dl className="state-detail-list">
        <DetailRow label="Version" value={state.parcelVersion || state.geometryVersion} />
        <DetailRow label="Effective date / period" value={period || null} />
        <DetailRow label="Historical parcel ID" value={state.parcelId} />
        <DetailRow label="Historical geometry reference" value={geometryLabel || null} />
        <DetailRow label="Area at that time" value={formatArea(state.areaSqM)} />
        <DetailRow label="Land use at that time" value={state.landUse ? readable(state.landUse) : null} />
        <DetailRow label="Owner / holder at that time" value={state.owner} />
        <DetailRow label="Status" value={state.recordStatus ? readable(state.recordStatus) : null} />
        <DetailRow label="Reason state ended / superseded" value={state.retirementReason} />
      </dl>

      <div className="state-integration-actions">
        <ActionLink href={parcelEvidenceLink(state.parcelId, {
          state: 'historical',
          geometryId: state.geometry?.geometryId,
          parcelVersion: state.parcelVersion || state.geometryVersion
        })}>VIEW SUPPORTING EVIDENCE</ActionLink>
      </div>

      <button type="button" className="return-current-button" onClick={onReturnToCurrent}>RETURN TO CURRENT STATE</button>
    </section>
  );
}

function ProposalComparison({ current, proposal }) {
  const comparisons = proposalComparisons(current, proposal);
  if (!comparisons.length) return null;
  return (
    <div className="proposal-comparison">
      <div className="proposal-comparison-title">CURRENT → PROPOSED</div>
      {comparisons.map((row) => (
        <div className="proposal-comparison-row" key={row.key}>
          <div>
            <span>Current {row.label}</span>
            <strong>{row.key === 'areaSqM' ? formatArea(row.current) : present(row.current)}</strong>
          </div>
          <span className="proposal-arrow" aria-hidden="true">→</span>
          <div>
            <span>Proposed {row.label}</span>
            <strong>{row.key === 'areaSqM' ? formatArea(row.proposed) : present(row.proposed)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProposedChangePanel({ proposal, current }) {
  if (!proposal) {
    return (
      <section className="proposal-panel" aria-labelledby="proposalTitle">
        <div className="proposal-heading">
          <span className="proposal-icon" aria-hidden="true">△</span>
          <div><h3 id="proposalTitle">PROPOSED CHANGE</h3><strong>NOT AUTHORITATIVE</strong></div>
        </div>
        <p className="proposal-empty">No pending proposal</p>
      </section>
    );
  }

  const geometryDiffers = proposal.geometryId && proposal.geometryId !== current?.geometry?.geometryId;
  const proposalGeometryLabel = proposal.geometry
    ? [proposal.geometry.geometryId, proposal.geometry.version, readable(proposal.geometry.geometryStatus)].filter(Boolean).join(' · ')
    : geometryDiffers
      ? [proposal.geometryId, proposal.geometryReferenceStatus ? readable(proposal.geometryReferenceStatus) : null].filter(Boolean).join(' · ')
      : null;
  const status = proposal.reviewStatus || proposal.proposalDisposition || proposal.reconciliationStatus;

  return (
    <section className={`proposal-panel proposal-panel--${String(proposal.proposalDisposition || '').toLowerCase()}`} aria-labelledby="proposalTitle">
      <div className="proposal-heading">
        <span className="proposal-icon" aria-hidden="true">△</span>
        <div>
          <h3 id="proposalTitle">PROPOSED CHANGE</h3>
          <strong>NOT AUTHORITATIVE</strong>
        </div>
      </div>

      {status && <span className={`proposal-status proposal-status--${String(status).toLowerCase()}`}>{readable(status)}</span>}

      {geometryDiffers && proposal.geometry && (
        <LazyGeometryCard
          label="PROPOSED GEOMETRY"
          geometryRef={proposal.geometry}
          parcelId={proposal.parcelId}
          spatialState="proposed-non-authoritative"
          tone="proposed"
          badge="NOT AUTHORITATIVE"
          sublabel={proposal.reviewStatus ? readable(proposal.reviewStatus) : null}
          unavailableText="Proposed geometry coordinates unavailable from current records"
        />
      )}

      <dl className="state-detail-list state-detail-list--proposal">
        <DetailRow label="Proposed area" value={formatArea(proposal.areaSqM)} />
        <DetailRow label="Proposed land use" value={proposal.landUse ? readable(proposal.landUse) : null} />
        <DetailRow label="Proposed owner / record holder" value={proposal.owner} />
        <DetailRow label={proposal.geometry ? 'Proposed geometry' : 'Geometry referenced by proposal'} value={proposalGeometryLabel} />
        <DetailRow label="Origin of proposal" value={proposal.sourceTable} />
        <DetailRow label="Review status" value={status ? readable(status) : null} />
        <DetailRow label="Reason / evidence" value={proposal.reason} />
        <DetailRow label="Reconciliation status" value={proposal.reconciliationStatus ? readable(proposal.reconciliationStatus) : null} />
        <DetailRow label="Unresolved conflict(s)" value={proposal.unresolvedConflictIds?.length ? proposal.unresolvedConflictIds.join(', ') : null} />
      </dl>

      <ProposalComparison current={current} proposal={proposal} />

      <div className="state-integration-actions">
        <ActionLink href={parcelEvidenceLink(proposal.parcelId, {
          state: 'proposed-non-authoritative',
          geometryId: proposal.geometry?.geometryId || proposal.geometryId,
          reconciliationStatus: proposal.reconciliationStatus
        })}>VIEW SUPPORTING EVIDENCE</ActionLink>
      </div>
    </section>
  );
}

function ParcelStateColumn({ current, historicalState, proposal, parcel, onReturnToCurrent }) {
  return (
    <aside className="parcel-state-column" aria-label="Parcel state inspector">
      {historicalState
        ? <HistoricalStatePanel state={historicalState} onReturnToCurrent={onReturnToCurrent} />
        : <CurrentAuthoritativePanel state={current} parcel={parcel} />}
      <ProposedChangePanel proposal={proposal} current={current} />
    </aside>
  );
}

function ParcelHistoryLoadingSkeleton() {
  return (
    <main className="parcel-history-page parcel-history-page--loading" aria-busy="true" aria-label="Loading parcel history">
      <div className="parcel-history-shell">
        <div className="history-skeleton history-skeleton--back" />
        <div className="history-skeleton history-skeleton--title" />
        <div className="history-skeleton history-skeleton--meta" />
        <div className="parcel-history-layout parcel-history-layout--skeleton">
          <section className="history-column">
            <div className="history-skeleton history-skeleton--section" />
            {[0, 1, 2].map((item) => (
              <div className="history-skeleton-event" key={item}>
                <span className="history-skeleton history-skeleton--node" />
                <span className="history-skeleton history-skeleton--event" />
              </div>
            ))}
          </section>
          <aside className="parcel-state-column">
            <div className="history-skeleton history-skeleton--state" />
            <div className="history-skeleton history-skeleton--proposal" />
          </aside>
        </div>
      </div>
      <span className="sr-only">{TIMELINE_MESSAGES.loading}</span>
    </main>
  );
}

export default function ParcelTimeline({ parcelId, onBack, onOpenLineage }) {
  const [data, setData] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedHistoricalState, setSelectedHistoricalState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    setData(null);
    setSelectedEvent(null);
    setSelectedHistoricalState(null);

    fetchParcelHistoryDetail(parcelId)
      .then((payload) => {
        if (!ignore) setData(payload);
      })
      .catch((requestError) => {
        if (ignore) return;
        setError(requestError?.code === 'PARCEL_NOT_FOUND' ? TIMELINE_MESSAGES.notFound : TIMELINE_MESSAGES.error);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => { ignore = true; };
  }, [parcelId]);

  const events = useMemo(() => groupLineageEvents(data?.events || []), [data]);
  const selectedEventHistoricalState = useMemo(
    () => historicalStateForEvent(selectedEvent, data?.historicalStates || []),
    [selectedEvent, data]
  );

  useEffect(() => {
    const requestedEvent = readLayer4SelectedEvent(window.location);
    if (!requestedEvent || !events.length) return;
    const matchingEvent = events.find((event) => (
      layer4EventSelectionKey(event) === requestedEvent
      || (event.memberEvents || []).some((member) => layer4EventSelectionKey(member) === requestedEvent)
    ));
    if (matchingEvent) {
      setSelectedEvent((current) => layer4EventSelectionKey(current) === layer4EventSelectionKey(matchingEvent) ? current : matchingEvent);
    } else {
      writeSelectedHistoryEventToLocation(null);
    }
  }, [events, parcelId]);

  const inspectEvent = (event) => {
    // Event inspection is progressive disclosure. Selecting an event must not
    // silently change the parcel-state inspector or authoritative-current data.
    setSelectedEvent(event);
    writeSelectedHistoryEventToLocation(event);
  };

  const closeEventInspector = () => {
    setSelectedEvent(null);
    writeSelectedHistoryEventToLocation(null);
  };

  if (loading) {
    return <ParcelHistoryLoadingSkeleton />;
  }

  if (error) {
    return (
      <main className="parcel-history-page">
        <div className="history-detail-state history-detail-state--error">
          <strong>{error}</strong>
          <button type="button" onClick={onBack}>← All Parcels</button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const parcel = data.parcel || {};
  let previousYear = null;

  return (
    <main className="parcel-history-page">
      <div className="parcel-history-shell">
        <header className="parcel-history-header">
          <button type="button" className="all-parcels-link" onClick={onBack}>← All Parcels</button>
          <div className="parcel-history-title-row">
            <div>
              <div className="history-detail-kicker">Parcel History &amp; Lineage</div>
              <h1>{parcel.parcelId || parcelId}</h1>
              <div className="parcel-heading-meta">
                <span>{parcel.landUse ? readable(parcel.landUse) : 'Land use not recorded'}</span>
                <span className={`parcel-lifecycle parcel-lifecycle--${String(parcel.primaryStatus || '').toLowerCase()}`}>
                  {readable(parcel.primaryStatus)}
                </span>
              </div>
            </div>
            {onOpenLineage && (
              <button type="button" className="open-lineage-view" onClick={onOpenLineage}>
                PARCEL LINEAGE VIEW <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </header>

        <div className="parcel-history-layout">
          <section className="history-column" aria-labelledby="historyTimelineTitle">
            <div className="history-column-heading">
              <div>
                <span>Recorded history</span>
                <h2 id="historyTimelineTitle">Historical event timeline</h2>
              </div>
              <span>{events.length} event{events.length === 1 ? '' : 's'}</span>
            </div>

            {events.length === 0 ? (
              <div className="history-empty">
                <strong>No recorded historical events</strong>
                <span>The dataset contains no normalized Layer 4 events for this parcel.</span>
              </div>
            ) : (
              <div className="parcel-event-list">
                {events.map((event) => {
                  const year = yearFor(event);
                  const showYear = year !== previousYear;
                  previousYear = year;
                  return (
                    <div className="timeline-year-block" key={`${event.adapter_event_key || event.event_id}-${event.memberEvents?.length || 1}`}>
                      {showYear && <div className="timeline-year-label">{year}</div>}
                      <TimelineEvent event={event} onInspect={inspectEvent} historicalStateAvailable={Boolean(historicalStateForEvent(event, data.historicalStates || []))} isSelected={Boolean(selectedEvent && layer4EventSelectionKey(selectedEvent) === layer4EventSelectionKey(event))} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <ParcelStateColumn
            current={data.currentAuthoritative}
            historicalState={selectedHistoricalState}
            proposal={data.proposedChange}
            parcel={parcel}
            onReturnToCurrent={() => setSelectedHistoricalState(null)}
          />
        </div>
      </div>

      <EventInspector
        event={selectedEvent}
        historicalState={selectedEventHistoricalState}
        onViewHistoricalState={setSelectedHistoricalState}
        onClose={closeEventInspector}
      />
    </main>
  );
}
