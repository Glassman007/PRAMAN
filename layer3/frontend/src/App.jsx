import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  FileCheck2,
  FileSearch,
  GitCompareArrows,
  History,
  Landmark,
  Map as MapIcon,
  MessageSquareText,
  PenLine,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  X,
  XCircle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const CONFLICT_REVIEW_URL = import.meta.env.VITE_CONFLICT_REVIEW_URL || 'http://localhost:5174';

function display(value, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function numberText(value, suffix = '') {
  return Number.isFinite(Number(value)) ? `${Number(value)}${suffix}` : '—';
}

function formatEvidenceDate(value) {
  if (!value) return 'Date not stated';
  if (/^\d{4}$/.test(String(value)) || /^\d{4}-\d{2}$/.test(String(value))) return String(value);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function geometryCoordinates(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];

  if (geometry.type === 'Polygon') {
    return geometry.coordinates?.[0] || [];
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates?.[0]?.[0] || [];
  }

  return [];
}

function svgPoints(geometry) {
  const coordinates = geometryCoordinates(geometry);
  if (coordinates.length < 3) return '';

  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, Number.EPSILON);
  const height = Math.max(maxY - minY, Number.EPSILON);

  return coordinates
    .map(([x, y]) => {
      const px = 16 + ((x - minX) / width) * 118;
      const py = 104 - ((y - minY) / height) * 88;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
}

function PolygonPreview({ geometry, proposed = false, emptyLabel = 'Geometry not stored in this source' }) {
  const points = svgPoints(geometry);

  if (!points) {
    return <span className="geometry-empty-text">{emptyLabel}</span>;
  }

  return (
    <div className={`polygon-preview ${proposed ? 'polygon-preview--proposed' : ''}`}>
      <svg viewBox="0 0 150 120" role="img" aria-label="Parcel geometry preview">
        <defs>
          <pattern id={proposed ? 'grid-proposed' : 'grid-source'} width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="150" height="120" className="polygon-grid" fill={`url(#${proposed ? 'grid-proposed' : 'grid-source'})`} />
        <polygon points={points} className="parcel-shape" />
      </svg>
      <span>{proposed ? 'Canonical map geometry' : 'Survey geometry'}</span>
    </div>
  );
}

function SourceHeader({ title, meta, icon: Icon, tone }) {
  return (
    <div className={`source-header source-header--${tone}`}>
      <div className="source-icon"><Icon size={18} /></div>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
    </div>
  );
}

function ValueCell({ children, muted = false, conflict = false, resolved = false }) {
  return (
    <div className={`value-cell ${muted ? 'is-muted' : ''} ${conflict ? 'is-conflict' : ''} ${resolved ? 'is-resolved' : ''}`}>
      {children}
    </div>
  );
}

function StatusPill({ status, onClick }) {
  const normalized = String(status || 'unknown').toLowerCase().replace(/\s+/g, '-');
  const className = `status-pill status-pill--${normalized}${onClick ? ' status-pill--button' : ''}`;

  if (onClick) {
    return <button type="button" className={className} onClick={onClick} title="Open this parcel in Conflict Review">{status}</button>;
  }

  return <span className={className}>{status}</span>;
}

function Modal({ title, eyebrow, onClose, children, footer, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className={`modal ${wide ? 'modal--wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </section>
    </div>
  );
}

function AuditItem({ item }) {
  return (
    <div className="audit-item">
      <div className="audit-mark"><History size={14} /></div>
      <div>
        <div className="audit-line">
          <strong>{item.action}</strong>
          <span>{new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <p>{item.summary}</p>
        {item.reviewer && <small>{item.reviewer}</small>}
      </div>
    </div>
  );
}

function EvidenceCard({ item }) {
  return (
    <article className="evidence-card">
      <div className="evidence-card__header">
        <FileCheck2 size={17} />
        <strong>{item.source}</strong>
      </div>
      <p>{item.detail}</p>
      <div className="evidence-meta">
        <span>{formatEvidenceDate(item.date)}</span>
        <span>Verification: {display(item.verified, 'Not stated')}</span>
      </div>
      {item.recordId && <small>{item.recordId}</small>}
    </article>
  );
}

function CoverageBar({ value, label }) {
  const safeValue = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : null;

  return (
    <div className="quality">
      <span>{safeValue === null ? '—' : `${safeValue}%`}</span>
      <div>{safeValue !== null && <i style={{ width: `${safeValue}%` }} />}</div>
      {label && <small>{label}</small>}
    </div>
  );
}

export default function App() {
  const requestedParcelId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('parcel') || null;
  }, []);

  const [parcelId, setParcelId] = useState(requestedParcelId);
  const [parcel, setParcel] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [pendingDecision, setPendingDecision] = useState(null);
  const [modifiedAction, setModifiedAction] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (parcelId) return undefined;

    let cancelled = false;

    async function resolveInitialParcelFromDataset() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${API_BASE}/api/conflicts`);
        if (!response.ok) throw new Error('Conflict API unavailable');

        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.items || [];
        const datasetParcelId = items.find((item) => item?.id)?.id || null;

        if (!datasetParcelId) {
          throw new Error('No conflict parcels are available in the dataset.');
        }

        if (!cancelled) {
          const url = new URL(window.location.href);
          url.searchParams.set('parcel', datasetParcelId);
          window.history.replaceState({}, '', url);
          setParcelId(datasetParcelId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not resolve a parcel from the dataset.');
          setLoading(false);
        }
      }
    }

    resolveInitialParcelFromDataset();

    return () => {
      cancelled = true;
    };
  }, [parcelId]);

  const loadWorkspace = async () => {
    if (!parcelId) return;
    setLoading(true);
    setError('');

    try {
      const [parcelRes, auditRes] = await Promise.all([
        fetch(`${API_BASE}/api/parcels/${encodeURIComponent(parcelId)}/reconciliation`),
        fetch(`${API_BASE}/api/parcels/${encodeURIComponent(parcelId)}/audit`),
      ]);

      if (!parcelRes.ok || !auditRes.ok) {
        throw new Error(parcelRes.status === 404 ? `Parcel ${parcelId} was not found.` : 'Workspace API unavailable');
      }

      const [parcelData, auditData] = await Promise.all([parcelRes.json(), auditRes.json()]);
      setParcel(parcelData);
      setAudit(auditData.items || []);
      setModifiedAction(parcelData.recommendation.action || '');
    } catch (err) {
      setError(err.message || 'Could not load reconciliation data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (parcelId) loadWorkspace();
  }, [parcelId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const evidenceSummary = useMemo(() => {
    if (!parcel) return '';
    return parcel.recommendation.evidence.map((item) => item.source).join(' · ');
  }, [parcel]);

  const conflictFlags = useMemo(() => {
    const type = String(parcel?.conflictType || '').toLowerCase();
    const toFinite = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
    const revenueArea = toFinite(parcel?.revenue?.area);
    const surveyArea = toFinite(parcel?.survey?.area);
    const canonicalArea = toFinite(parcel?.canonical?.area);
    const observedAreas = [revenueArea, surveyArea].filter((value) => value !== null);

    return {
      spatial: /geometry|coordinate|overlap|gap/.test(type),
      person: /addressing|semantic|bad data/.test(type),
      area:
        /bad data|digitization/.test(type) ||
        (canonicalArea !== null && observedAreas.some((value) => value !== canonicalArea)),
      parcelName: /parcel name/.test(type),
      verification: /never field verified|bad data/.test(type),
    };
  }, [parcel]);

  const openConflictReview = (decision = '') => {
    if (!parcel) return;

    const url = new URL(CONFLICT_REVIEW_URL, window.location.href);
    url.searchParams.set('parcel', parcel.id);
    if (decision) url.searchParams.set('decision', decision);
    if (decision === 'ACCEPT' || decision === 'MODIFY') {
      url.searchParams.set('showResolved', '1');
    }
    window.location.href = url.toString();
  };

  const openPreview = (action, resolutionAction = parcel?.recommendation.action) => {
    if (!parcel) return;

    setPendingDecision({
      action,
      parcelId: parcel.id,
      canonicalId: parcel.canonicalId,
      conflict: parcel.conflictType,
      currentCanonical: `${display(parcel.canonical.parcelName)} · ${display(parcel.canonical.owner)} · ${numberText(parcel.canonical.area, ' m²')}`,
      resolutionAction,
      evidence: evidenceSummary,
      reviewer: parcel.reviewer,
      note,
    });
    setActiveModal('preview');
  };

  const submitDecision = async (decision, payload = {}) => {
    if (!parcel) return;
    setSaving(true);

    try {
      const response = await fetch(`${API_BASE}/api/parcels/${encodeURIComponent(parcel.id)}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reviewer: parcel.reviewer,
          note: payload.note ?? note,
          resolutionAction: payload.resolutionAction || '',
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Decision failed');

      setParcel(result.workspace);
      setAudit(result.audit || []);
      setModifiedAction(result.workspace.recommendation.action || '');
      setActiveModal(null);
      setPendingDecision(null);
      setNote('');

      const url = new URL(CONFLICT_REVIEW_URL, window.location.href);
      url.searchParams.set('parcel', result.workspace.id);
      url.searchParams.set('decision', decision);
      if (decision === 'ACCEPT' || decision === 'MODIFY') {
        url.searchParams.set('showResolved', '1');
      }
      window.location.href = url.toString();
    } catch (err) {
      setToast(err.message || 'Decision could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="state-screen"><div className="loader" /><p>Loading reconciliation workspace…</p></div>;
  }

  if (error || !parcel) {
    return (
      <div className="state-screen">
        <AlertTriangle size={28} />
        <h2>Workspace unavailable</h2>
        <p>{error || 'The parcel could not be loaded.'}</p>
        <button className="button button--primary" onClick={loadWorkspace}><RotateCcw size={16} /> Retry</button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__left">
          <button className="icon-button" aria-label="Back to conflict queue" onClick={() => openConflictReview()}>
            <ArrowLeft size={19} />
          </button>
          <div className="breadcrumbs">
            <span>Conflict Review</span><ChevronRight size={14} /><strong>{parcel.id}</strong>
          </div>
        </div>
        <div className="topbar__right">
          {parcel.reviewer && <span className="reviewer"><UserRoundCheck size={15} /> {parcel.reviewer}</span>}
          <StatusPill status={parcel.status} onClick={() => openConflictReview()} />
        </div>
      </header>

      <main className="workspace">
        <section className="workspace-heading">
          <div>
            <div className="eyebrow-row">
              <span className="eyebrow">Reconciliation Workspace</span>
              <span className="severity"><AlertTriangle size={13} /> {parcel.severity} severity</span>
            </div>
            <h1>{parcel.id} · {parcel.canonicalId}</h1>
            <p>{parcel.locality}</p>
          </div>
          <div className="heading-metrics">
            <div><span>Conflict</span><strong>{parcel.conflictType}</strong></div>
            <div><span>Recommendation</span><strong>{parcel.recommendation.confidence == null ? '—' : `${parcel.recommendation.confidence}% confidence`}</strong></div>
            <div><span>Sources checked</span><strong>{parcel.sourcesChecked}</strong></div>
          </div>
        </section>

        <div className="workspace-grid">
          <div className="workspace-main">
            <section className="card issue-card">
              <div className="issue-card__icon"><GitCompareArrows size={18} /></div>
              <div>
                <span className="eyebrow">Detected conflict · {parcel.conflict?.id}</span>
                <h2>{parcel.conflictType}</h2>
                <p>{parcel.conflict?.summary}</p>
                <div className="observed-pair">
                  <span><strong>{parcel.conflict?.sourceA}</strong>{parcel.conflict?.observedA}</span>
                  <span><strong>{parcel.conflict?.sourceB}</strong>{parcel.conflict?.observedB}</span>
                </div>
              </div>
            </section>

            <section className="card comparison-card">
              <div className="card-title-row">
                <div>
                  <span className="eyebrow">Source comparison</span>
                  <h2>Field-level evidence</h2>
                </div>
              </div>

              <div className="comparison-table">
                <div className="comparison-row comparison-row--header">
                  <div className="field-label" />
                  <SourceHeader title="Revenue" meta={parcel.revenue.recordId || 'No matching record'} icon={Landmark} tone="revenue" />
                  <SourceHeader title="Survey" meta={parcel.survey.recordId || 'No matching record'} icon={MapIcon} tone="survey" />
                  <SourceHeader title="Canonical" meta={parcel.recordYear ? `${parcel.recordYear} GeoJSON layer` : 'GeoJSON layer'} icon={BadgeCheck} tone="proposed" />
                </div>

                <div className="comparison-row comparison-row--geometry">
                  <div className="field-label"><span>Geometry</span><small>Parcel boundary</small></div>
                  <ValueCell><PolygonPreview geometry={null} /></ValueCell>
                  <ValueCell conflict={conflictFlags.spatial}><PolygonPreview geometry={parcel.survey.geometry} /></ValueCell>
                  <ValueCell resolved><PolygonPreview geometry={parcel.canonical.geometry} proposed /></ValueCell>
                </div>

                <div className="comparison-row">
                  <div className="field-label"><span>Person</span><small>Owner / recorded role</small></div>
                  <ValueCell conflict={conflictFlags.person}>
                    <strong>{display(parcel.revenue.owner)}</strong>
                    <small>Revenue land_owner</small>
                  </ValueCell>
                  <ValueCell conflict={conflictFlags.person}>
                    <strong>{display(parcel.survey.recordedPerson)}</strong>
                    <small>{display(parcel.survey.personRole, 'Role not stated')}</small>
                  </ValueCell>
                  <ValueCell resolved>
                    <strong>{display(parcel.canonical.owner)}</strong>
                    <small>Current canonical owner display</small>
                  </ValueCell>
                </div>

                <div className="comparison-row">
                  <div className="field-label"><span>Area</span><small>Square metres</small></div>
                  <ValueCell conflict={conflictFlags.area}><strong>{numberText(parcel.revenue.area, ' m²')}</strong><small>Revenue ledger</small></ValueCell>
                  <ValueCell conflict={conflictFlags.area}><strong>{numberText(parcel.survey.area, ' m²')}</strong><small>Survey measurement</small></ValueCell>
                  <ValueCell resolved><strong>{numberText(parcel.canonical.area, ' m²')}</strong><small>Canonical map value</small></ValueCell>
                </div>

                <div className="comparison-row">
                  <div className="field-label"><span>Parcel reference</span><small>Naming / local reference</small></div>
                  <ValueCell conflict={conflictFlags.parcelName}><strong>{display(parcel.revenue.parcelName)}</strong><small>{display(parcel.revenue.surveyNo, 'Survey no. not stated')}</small></ValueCell>
                  <ValueCell conflict={conflictFlags.parcelName}><strong>{display(parcel.survey.parcelName)}</strong><small>{display(parcel.survey.surveyNo, 'Survey no. not stated')}</small></ValueCell>
                  <ValueCell resolved><strong>{display(parcel.canonical.parcelName)}</strong><small>{display(parcel.canonical.address)}</small></ValueCell>
                </div>

                <div className="comparison-row">
                  <div className="field-label"><span>Verification</span><small>Record + source coverage</small></div>
                  <ValueCell conflict={conflictFlags.verification}>
                    <strong>{display(parcel.revenue.fieldVerified)}</strong>
                    <CoverageBar value={parcel.revenue.coverage?.verifiedPct} label={`${display(parcel.revenue.dataQuality)} data quality`} />
                  </ValueCell>
                  <ValueCell conflict={conflictFlags.verification}>
                    <strong>{display(parcel.survey.fieldVerified)}</strong>
                    <CoverageBar value={parcel.survey.coverage?.verifiedPct} label={`${display(parcel.survey.dataQuality)} data quality`} />
                  </ValueCell>
                  <ValueCell resolved>
                    <strong>{parcel.canonical.confidence ?? '—'}% confidence</strong>
                    <small>{display(parcel.canonical.harmonizationStatus)}</small>
                  </ValueCell>
                </div>
              </div>
            </section>

            <section className="card recommendation-card">
              <div className="recommendation-topline">
                <div className="recommendation-icon"><ShieldCheck size={22} /></div>
                <div>
                  <span className="eyebrow">Resolution recommendation</span>
                  <h2>{parcel.recommendation.action}</h2>
                </div>
                <div className="confidence-ring">
                  <strong>{parcel.recommendation.confidence ?? '—'}%</strong>
                  <span>confidence</span>
                </div>
              </div>

              <div className="reasoning-box">
                <h3>Why this is recommended</h3>
                <p>{parcel.recommendation.explanation}</p>
                <p><strong>Authority basis:</strong> {parcel.recommendation.authorityBasis}</p>
              </div>

              <div className="evidence-grid">
                {parcel.recommendation.evidence.map((item) => <EvidenceCard item={item} key={item.source} />)}
              </div>

              <div className="human-action-note">
                <FileSearch size={18} />
                <div>
                  <strong>Human action required</strong>
                  <p>{display(parcel.recommendation.humanAction)}</p>
                </div>
              </div>

            </section>

            <section className="card action-card">
              <div className="card-title-row action-heading">
                <div>
                  <span className="eyebrow">Human-in-the-loop decision</span>
                  <h2>Record reviewer action</h2>
                </div>
                <span className="required-badge">Authorised review required</span>
              </div>

              <div className="action-grid">
                <button className="decision-button decision-button--accept" onClick={() => openPreview('ACCEPT')}>
                  <span className="decision-icon"><Check size={19} /></span>
                  <span><strong>Accept Recommendation</strong><small>Approve the proposed resolution action</small></span>
                </button>
                <button className="decision-button" onClick={() => { setModifiedAction(parcel.recommendation.action); setNote(''); setActiveModal('modify'); }}>
                  <span className="decision-icon"><PenLine size={18} /></span>
                  <span><strong>Modify</strong><small>Change the resolution before approval</small></span>
                </button>
                <button className="decision-button" onClick={() => { setNote(''); setActiveModal('reject'); }}>
                  <span className="decision-icon"><XCircle size={18} /></span>
                  <span><strong>Reject</strong><small>Decline this recommendation</small></span>
                </button>
                <button className="decision-button decision-button--escalate" onClick={() => { setNote(''); setActiveModal('escalate'); }}>
                  <span className="decision-icon"><AlertTriangle size={18} /></span>
                  <span><strong>Escalate</strong><small>Request senior or field review</small></span>
                </button>
              </div>
            </section>
          </div>

          <aside className="workspace-side">
            <section className="card side-card">
              <div className="side-card__heading"><FileSearch size={17} /><div><span className="eyebrow">Evidence trail</span><h3>Parcel history</h3></div></div>
              {parcel.timeline.length ? (
                <div className="timeline">
                  {parcel.timeline.map((event, index) => (
                    <div className={`timeline-item ${index === 0 ? 'timeline-item--latest' : ''}`} key={`${event.year}-${event.type}`}>
                      <span className="timeline-dot" />
                      <div>
                        <span>{event.year}</span>
                        <strong>{event.type}</strong>
                        <p>{event.description}</p>
                        <small>{display(event.person)} · {numberText(event.area, ' m²')} · {display(event.verification)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="empty-state">No historical timeline is available for this parcel.</p>}
            </section>

            <section className="card side-card audit-card">
              <div className="side-card__heading"><History size={17} /><div><span className="eyebrow">Reconciliation audit</span><h3>Activity log</h3></div></div>
              <div className="audit-list">
                {audit.length ? audit.map((item) => <AuditItem item={item} key={item.id} />) : <p className="empty-state">No reviewer decision recorded in this server session.</p>}
              </div>
            </section>

            <section className="card provenance-card">
              <span className="eyebrow">Case provenance</span>
              <div className="provenance-row"><span>Conflict ID</span><strong>{display(parcel.conflict?.id)}</strong></div>
              <div className="provenance-row"><span>Record year</span><strong>{display(parcel.recordYear)}</strong></div>
              <div className="provenance-row"><span>Source set</span><strong>{parcel.sourceSet?.length ? parcel.sourceSet.join(' · ') : '—'}</strong></div>
              <div className="provenance-row"><span>Canonical map</span><strong>{parcel.recordYear ? `GeoJSON ${parcel.recordYear}` : 'GeoJSON'}</strong></div>
            </section>
          </aside>
        </div>
      </main>

      {toast && <div className="toast"><BadgeCheck size={17} /> {toast}</div>}

      {activeModal === 'preview' && pendingDecision && (
        <Modal
          title="Decision Preview"
          eyebrow="Reconciliation audit"
          onClose={() => setActiveModal(null)}
          wide
          footer={
            <>
              <button className="button button--secondary" onClick={() => setActiveModal(null)}>Back</button>
              <button
                className="button button--primary"
                disabled={saving}
                onClick={() => submitDecision(pendingDecision.action, {
                  note: pendingDecision.note,
                  resolutionAction: pendingDecision.resolutionAction,
                })}
              >
                <ShieldCheck size={16} /> {saving ? 'Recording…' : 'Confirm Decision'}
              </button>
            </>
          }
        >
          <div className="preview-banner"><ShieldCheck size={19} /><div><strong>Review before recording</strong><p>This creates an audit event in the MVP backend. It does not modify the source dataset files.</p></div></div>
          <div className="decision-preview-grid">
            <div><span>Parcel</span><strong>{pendingDecision.parcelId} · {pendingDecision.canonicalId}</strong></div>
            <div><span>Decision</span><strong>{pendingDecision.action}</strong></div>
            <div><span>Conflict</span><strong>{pendingDecision.conflict}</strong></div>
            <div><span>Reviewer</span><strong>{display(pendingDecision.reviewer)}</strong></div>
            <div className="decision-preview-grid__wide"><span>Current canonical</span><strong>{pendingDecision.currentCanonical}</strong></div>
            <div className="decision-preview-grid__wide"><span>Resolution action</span><strong>{pendingDecision.resolutionAction}</strong></div>
            <div className="decision-preview-grid__wide"><span>Evidence set</span><strong>{pendingDecision.evidence}</strong></div>
          </div>
          {pendingDecision.note && <div className="reviewer-note"><MessageSquareText size={16} /><div><span>Reviewer note</span><p>{pendingDecision.note}</p></div></div>}
        </Modal>
      )}

      {activeModal === 'modify' && (
        <Modal
          title="Modify Recommendation"
          eyebrow="Reviewer override"
          onClose={() => setActiveModal(null)}
          footer={
            <>
              <button className="button button--secondary" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="button button--primary" disabled={!modifiedAction.trim()} onClick={() => openPreview('MODIFY', modifiedAction)}><ChevronRight size={16} /> Review Changes</button>
            </>
          }
        >
          <div className="form-grid form-grid--single">
            <label><span>Reviewer resolution / action</span><textarea rows="4" value={modifiedAction} onChange={(event) => setModifiedAction(event.target.value)} /></label>
            <label><span>Reviewer justification</span><textarea rows="4" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain why the recommendation was modified…" /></label>
          </div>
        </Modal>
      )}

      {activeModal === 'reject' && (
        <Modal
          title="Reject Recommendation"
          eyebrow="Reviewer action"
          onClose={() => setActiveModal(null)}
          footer={
            <>
              <button className="button button--secondary" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="button button--danger" disabled={!note.trim() || saving} onClick={() => submitDecision('REJECT')}><XCircle size={16} /> Reject Recommendation</button>
            </>
          }
        >
          <div className="warning-panel"><AlertTriangle size={18} /><p>Rejecting records the recommendation as declined. The source records and current canonical GeoJSON remain unchanged.</p></div>
          <label className="stacked-input"><span>Reason for rejection</span><textarea rows="5" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required for auditability…" /></label>
        </Modal>
      )}

      {activeModal === 'escalate' && (
        <Modal
          title="Escalate Case"
          eyebrow="Senior / field review"
          onClose={() => setActiveModal(null)}
          footer={
            <>
              <button className="button button--secondary" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="button button--warning" disabled={!note.trim() || saving} onClick={() => submitDecision('ESCALATE')}><AlertTriangle size={16} /> Escalate Case</button>
            </>
          }
        >
          <div className="warning-panel warning-panel--amber"><AlertTriangle size={18} /><p>Use escalation when documentary evidence is insufficient, contradictory, or ground verification is required.</p></div>
          <label className="stacked-input"><span>Escalation note</span><textarea rows="5" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe what must be verified next…" /></label>
        </Modal>
      )}
    </div>
  );
}
