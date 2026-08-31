import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_RECONCILIATION_API || "http://localhost:4000";

const RECONCILIATION_URL =
  import.meta.env.VITE_RECONCILIATION_URL || "http://localhost:5173";

function Pill({ children, tone = "neutral" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function SeverityPill({ severity }) {
  if (severity === "Critical") return <Pill tone="danger">Critical</Pill>;
  if (severity === "High") return <Pill tone="danger">High</Pill>;
  if (severity === "Medium") return <Pill tone="warning">Medium</Pill>;
  if (severity === "Low") return <Pill tone="neutral">Low</Pill>;
  return <Pill tone="neutral">{severity || "Unknown"}</Pill>;
}

function StatusPill({ status }) {
  const tone =
    status === "Escalated"
      ? "danger"
      : status === "Suggested"
      ? "purple"
      : status === "Resolved"
      ? "success"
      : status === "In Progress"
      ? "info"
      : "warning";

  return <Pill tone={tone}>{status}</Pill>;
}

function ConfidenceBar({ value }) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : null;

  return (
    <div
      className="confidenceWrap"
      aria-label={safeValue === null ? "Confidence not stated" : `Confidence ${safeValue}%`}
    >
      <div className="confidenceTrack">
        {safeValue !== null && (
          <div
            className="confidenceFill"
            style={{ width: `${Math.max(0, Math.min(100, safeValue))}%` }}
          />
        )}
      </div>
      <span>{safeValue === null ? "—" : `${safeValue}%`}</span>
    </div>
  );
}

function formatAge(ageHours) {
  if (ageHours === null || ageHours === undefined || ageHours === "") return "—";
  return `${ageHours}h`;
}

function decisionLabel(value) {
  const labels = {
    ACCEPT: "Recommendation accepted",
    MODIFY: "Recommendation modified",
    REJECT: "Recommendation rejected",
    ESCALATE: "Case escalated",
  };
  return labels[value] || value || "";
}

const ASSIGNMENT_OPTIONS = [
  {
    value: "Unassigned",
    label: "Unassigned",
    hint: "Not yet routed to a reviewer or review queue.",
  },
  {
    value: "Desk Review",
    label: "Desk Review",
    hint: "Documentary triage and basic source checks.",
  },
  {
    value: "Reconciliation",
    label: "Reconciliation",
    hint: "Evidence comparison and resolution review.",
  },
  {
    value: "Field Review",
    label: "Field Review",
    hint: "Survey or ground verification is required.",
  },
  {
    value: "Senior Review",
    label: "Senior Review",
    hint: "Escalated for senior-authority review.",
  },
];

function AssignmentStage({ stage }) {
  const safeStage = stage || "Unassigned";
  const tone =
    safeStage === "Field Review" || safeStage === "Senior Review"
      ? "danger"
      : safeStage === "Reconciliation"
      ? "info"
      : safeStage === "Desk Review"
      ? "purple"
      : safeStage === "Completed"
      ? "success"
      : "neutral";

  return <Pill tone={tone}>{safeStage}</Pill>;
}

function joinPresent(values, separator = " · ") {
  const present = values.filter(
    (value) => value !== null && value !== undefined && String(value).trim() !== ""
  );
  return present.length ? present.join(separator) : "—";
}

function geometryRings(geometry) {
  if (!geometry || typeof geometry !== "object") return [];

  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }

  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates)
      ? geometry.coordinates.flatMap((polygon) => polygon || [])
      : [];
  }

  return [];
}

function geometryBounds(geometries) {
  const coordinates = geometries
    .flatMap((geometry) => geometryRings(geometry))
    .flat()
    .filter(
      (coordinate) =>
        Array.isArray(coordinate) &&
        Number.isFinite(Number(coordinate[0])) &&
        Number.isFinite(Number(coordinate[1]))
    )
    .map(([x, y]) => [Number(x), Number(y)]);

  if (!coordinates.length) return null;

  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function geometryPath(geometry, bounds, width = 420, height = 210, padding = 24) {
  if (!geometry || !bounds) return "";

  const spanX = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const spanY = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
  const scale = Math.min(
    (width - padding * 2) / spanX,
    (height - padding * 2) / spanY
  );
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;

  const project = ([x, y]) => {
    const px = offsetX + (Number(x) - bounds.minX) * scale;
    const py = height - (offsetY + (Number(y) - bounds.minY) * scale);
    return [px, py];
  };

  return geometryRings(geometry)
    .map((ring) => {
      const valid = (ring || []).filter(
        (coordinate) =>
          Array.isArray(coordinate) &&
          Number.isFinite(Number(coordinate[0])) &&
          Number.isFinite(Number(coordinate[1]))
      );

      if (valid.length < 3) return "";
      const [[firstX, firstY], ...rest] = valid.map(project);
      return [
        `M ${firstX.toFixed(2)} ${firstY.toFixed(2)}`,
        ...rest.map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`),
        "Z",
      ].join(" ");
    })
    .filter(Boolean)
    .join(" ");
}

function DatasetGeometryPreview({ geometry }) {
  const canonical = geometry?.canonical || null;
  const survey = geometry?.survey || null;
  const bounds = geometryBounds([canonical, survey]);
  const canonicalPath = geometryPath(canonical, bounds);
  const surveyPath = geometryPath(survey, bounds);

  return (
    <div className="miniMap" aria-label="Parcel geometry preview">
      <svg viewBox="0 0 420 210" role="img" aria-label="Dataset parcel geometry comparison">
        <image
          href="/parcel-grid.png"
          x="0"
          y="0"
          width="420"
          height="210"
          preserveAspectRatio="none"
          opacity="0.56"
        />

        {canonicalPath && (
          <path
            d={canonicalPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            fillRule="evenodd"
          />
        )}

        {surveyPath && (
          <path
            d={surveyPath}
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeDasharray="7 6"
            fillRule="evenodd"
          />
        )}

        {!canonicalPath && !surveyPath && (
          <text x="210" y="105" textAnchor="middle" fontSize="12" fill="#64748b">
            Geometry not available in dataset
          </text>
        )}
      </svg>

      {(canonicalPath || surveyPath) && (
        <div className="mapLegend">
          {canonicalPath && (
            <span>
              <i className="legendBlue" /> Canonical
            </span>
          )}
          {surveyPath && (
            <span>
              <i className="legendRed" /> Survey
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConflictExplorer({ onOpenReconciliation }) {
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("dataset");
  const [selectedId, setSelectedId] = useState(() =>
    new URLSearchParams(window.location.search).get("parcel") || ""
  );
  const [showResolved, setShowResolved] = useState(() =>
    new URLSearchParams(window.location.search).get("showResolved") === "1"
  );
  const [decisionEcho] = useState(() =>
    new URLSearchParams(window.location.search).get("decision") || ""
  );
  const [decisionEchoParcel] = useState(() =>
    new URLSearchParams(window.location.search).get("parcel") || ""
  );
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState("");
  const [assignmentStageDraft, setAssignmentStageDraft] = useState("Unassigned");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyWorkspace, setHistoryWorkspace] = useState(null);
  const [historyAudit, setHistoryAudit] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadConflicts() {
      try {
        setLoading(true);
        setLoadError("");

        const response = await fetch(`${API_BASE}/api/conflicts`);
        if (!response.ok) {
          throw new Error(`Conflict API returned ${response.status}`);
        }

        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.items || [];

        if (!cancelled) {
          setConflicts(items);
          setSelectedId((current) => current || items[0]?.id || "");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load the conflict queue."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadConflicts();

    return () => {
      cancelled = true;
    };
  }, []);

  const conflictFilters = useMemo(
    () => ["All", ...new Set(conflicts.map((row) => row.conflict).filter(Boolean))],
    [conflicts]
  );

  const severityOptions = useMemo(
    () => [...new Set(conflicts.map((row) => row.severity).filter(Boolean))],
    [conflicts]
  );

  const statusOptions = useMemo(
    () => [...new Set(conflicts.map((row) => row.status).filter(Boolean))],
    [conflicts]
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    const rows = conflicts
      .filter((row) => {
        if (!showResolved && row.status === "Resolved") return false;
        if (filter !== "All" && row.conflict !== filter) return false;
        if (severity !== "All" && row.severity !== severity) return false;
        if (status !== "All" && row.status !== status) return false;

        if (
          q &&
          ![
            row.id,
            row.locality,
            row.ward,
            row.assignee,
            row.assignmentStage,
            row.conflict,
            row.rawConflictType,
            ...(row.sources || []),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }

        return true;
      });

    if (sort === "oldest") {
      return rows.sort((a, b) => (b.ageHours ?? -1) - (a.ageHours ?? -1));
    }

    if (sort === "confidence") {
      return rows.sort((a, b) => {
        const aValue = a.confidence == null ? Number.POSITIVE_INFINITY : a.confidence;
        const bValue = b.confidence == null ? Number.POSITIVE_INFINITY : b.confidence;
        return aValue - bValue;
      });
    }

    return rows;
  }, [conflicts, filter, search, severity, status, sort, showResolved]);

  useEffect(() => {
    if (!visibleRows.length) return;

    const selectedStillVisible = visibleRows.some((row) => row.id === selectedId);
    if (!selectedStillVisible) {
      setSelectedId(visibleRows[0].id);
    }
  }, [visibleRows, selectedId]);

  const selected =
    conflicts.find((item) => item.id === selectedId) ||
    visibleRows[0] ||
    conflicts[0] ||
    null;

  const selectedDecisionEcho =
    selected?.lastDecision ||
    (selected?.id === decisionEchoParcel ? decisionEcho : "");

  const openQueue = conflicts.filter((x) => x.status !== "Resolved").length;
  const highRisk = conflicts.filter(
    (x) => x.severity === "High" && x.status !== "Resolved"
  ).length;
  const escalated = conflicts.filter((x) => x.status === "Escalated").length;
  const unassigned = conflicts.filter(
    (x) => !x.assignee && x.status !== "Resolved"
  ).length;

  const handleOpenReconciliation = async () => {
    if (!selected) return;

    // Opening the workspace means this case has entered reconciliation review.
    // Critical/field-review and senior-review routes are intentionally preserved.
    if (["Unassigned", "Desk Review"].includes(selected.assignmentStage || "Unassigned")) {
      try {
        const response = await fetch(
          `${API_BASE}/api/parcels/${encodeURIComponent(selected.id)}/assignment`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignmentStage: "Reconciliation", assignee: "" }),
          }
        );
        if (response.ok) {
          const payload = await response.json();
          setConflicts((current) =>
            current.map((item) => (item.id === payload.item.id ? payload.item : item))
          );
        }
      } catch {
        // Navigation remains available even if the routing update cannot be persisted.
      }
    }

    if (onOpenReconciliation) {
      onOpenReconciliation(selected.id);
      return;
    }

    window.location.href =
      `${RECONCILIATION_URL}/?parcel=${encodeURIComponent(selected.id)}`;
  };

  const handleAssignNext = () => {
    if (!visibleRows.length) return;

    const currentIndex = visibleRows.findIndex((row) => row.id === selectedId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % visibleRows.length;
    setSelectedId(visibleRows[nextIndex].id);
  };

  const openAssignment = () => {
    if (!selected) return;
    setAssigneeDraft(selected.assignee || "");
    setAssignmentStageDraft(selected.assignmentStage || "Unassigned");
    setAssignmentError("");
    setAssignmentOpen(true);
  };

  const saveAssignment = async () => {
    if (!selected) return;
    setAssignmentSaving(true);
    setAssignmentError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/parcels/${encodeURIComponent(selected.id)}/assignment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignee: assigneeDraft.trim(),
            assignmentStage: assignmentStageDraft,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Assignment could not be saved.");

      setConflicts((current) =>
        current.map((item) => (item.id === payload.item.id ? payload.item : item))
      );
      setAssignmentOpen(false);
    } catch (error) {
      setAssignmentError(
        error instanceof Error ? error.message : "Assignment could not be saved."
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  const openHistoryAudit = async () => {
    if (!selected) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryWorkspace(null);
    setHistoryAudit([]);

    try {
      const [workspaceResponse, auditResponse] = await Promise.all([
        fetch(`${API_BASE}/api/parcels/${encodeURIComponent(selected.id)}/reconciliation`),
        fetch(`${API_BASE}/api/parcels/${encodeURIComponent(selected.id)}/audit`),
      ]);

      if (!workspaceResponse.ok || !auditResponse.ok) {
        throw new Error("Parcel history could not be loaded.");
      }

      const [workspacePayload, auditPayload] = await Promise.all([
        workspaceResponse.json(),
        auditResponse.json(),
      ]);
      setHistoryWorkspace(workspacePayload);
      setHistoryAudit(auditPayload.items || []);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Parcel history could not be loaded."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportQueue = () => {
    if (!visibleRows.length) return;

    const headers = [
      "Parcel",
      "Conflict",
      "Severity",
      "Confidence",
      "Status",
      "Assignee",
      "Assignment stage",
      "Source A",
      "Source B",
      "Reason",
    ];

    const rows = visibleRows.map((row) => [
      row.id,
      row.rawConflictType || row.conflict,
      row.severity,
      row.confidence == null ? "" : `${row.confidence}%`,
      row.status,
      row.assignee,
      row.assignmentStage,
      row.sources?.[0] || "",
      row.sources?.[1] || "",
      row.reason,
    ]);

    const escapeCell = (value) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "conflict-review-queue.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="conflictExplorer">
      <style>{styles}</style>

      <header className="topbar">
        <div>
          <div className="eyebrow">
            LAND RECORD HARMONIZATION · REVIEW OPERATIONS
          </div>
          <h1>Conflict Review</h1>
        </div>

        <div className="topActions">
          <button
            className="secondaryButton"
            type="button"
            onClick={handleExportQueue}
            disabled={!visibleRows.length}
          >
            Export queue
          </button>

          <button
            className="primaryButton"
            type="button"
            onClick={handleAssignNext}
            disabled={!visibleRows.length}
          >
            Assign next parcel
          </button>
        </div>
      </header>

      <section className="summaryGrid" aria-label="Conflict queue summary">
        <article className="summaryCard">
          <span className="summaryLabel">Open queue</span>
          <strong>{openQueue}</strong>
          <small>Awaiting action</small>
        </article>

        <article className="summaryCard">
          <span className="summaryLabel">High severity</span>
          <strong>{highRisk}</strong>
          <small>Prioritize today</small>
        </article>

        <article className="summaryCard">
          <span className="summaryLabel">Escalated</span>
          <strong>{escalated}</strong>
          <small>Needs senior / field review</small>
        </article>

        <article className="summaryCard">
          <span className="summaryLabel">Unassigned</span>
          <strong>{unassigned}</strong>
          <small>Needs ownership</small>
        </article>
      </section>

      <section className="queueShell">
        <div className="queuePanel">
          <div className="sectionHeading">
            <div>
              <h2>Review queue</h2>
              <p>
                {loading
                  ? "Loading conflicts…"
                  : `${visibleRows.length} parcels match the current view`}
              </p>
            </div>

            <label className="resolvedToggle">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />
              Show resolved
            </label>
          </div>

          <div className="typeTabs" role="tablist" aria-label="Conflict type filter">
            {conflictFilters.map((item) => {
              const count =
                item === "All"
                  ? conflicts.filter((x) => showResolved || x.status !== "Resolved").length
                  : conflicts.filter(
                      (x) => x.conflict === item && (showResolved || x.status !== "Resolved")
                    ).length;

              return (
                <button
                  key={item}
                  className={filter === item ? "typeTab active" : "typeTab"}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="controlsRow">
            <div className="searchBox">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search parcel, locality, ward, assignee…"
                aria-label="Search conflicts"
              />
            </div>

            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              aria-label="Filter by severity"
            >
              <option value="All">All severity</option>
              {severityOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="All">All status</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort conflict queue"
            >
              <option value="dataset">Dataset order</option>
              <option value="oldest">Oldest first</option>
              <option value="confidence">Lowest confidence</option>
            </select>
          </div>

          {loadError && (
            <div className="emptyState">
              <strong>Could not load conflicts</strong>
              <span>{loadError}</span>
              <span>Make sure the Layer 3 backend is running on port 4000.</span>
            </div>
          )}

          {!loadError && (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Parcel</th>
                    <th>Conflict</th>
                    <th>Severity</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Queue age</th>
                    <th title="Reviewer or review queue currently responsible for the parcel">Assignee</th>
                    <th aria-label="Open"></th>
                  </tr>
                </thead>

                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={row.id}
                      className={selected?.id === row.id ? "selectedRow" : ""}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td>
                        <div className="parcelCell">
                          <strong>{row.id}</strong>
                          <span>
                            {joinPresent([row.locality, row.ward])}
                          </span>
                        </div>
                      </td>

                      <td title={row.rawConflictType || row.conflict}>
                        {row.conflict}
                      </td>

                      <td>
                        <SeverityPill severity={row.severity} />
                      </td>

                      <td>
                        <ConfidenceBar value={row.confidence} />
                      </td>

                      <td>
                        <StatusPill status={row.status} />
                      </td>

                      <td>
                        <span>{formatAge(row.ageHours)}</span>
                      </td>

                      <td>
                        <div className="assigneeCell">
                          <strong>{row.assignee || "Unassigned"}</strong>
                          <span>{row.assignmentStage || "Unassigned"}</span>
                        </div>
                      </td>
                      <td className="arrowCell">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && visibleRows.length === 0 && (
                <div className="emptyState">
                  <strong>No parcels found</strong>
                  <span>Try changing one or more filters.</span>
                </div>
              )}
            </div>
          )}

          <footer className="queueFooter">
            <span>Conflict ID = Parcel ID</span>
          </footer>
        </div>

        {selected ? (
          <aside className="detailPanel" aria-label="Selected parcel conflict details">
            <div className="detailTop">
              <div>
                <span className="eyebrow">SELECTED PARCEL</span>
                <h2>{selected.id}</h2>
                <p>
                  {joinPresent([selected.locality, selected.ward])}
                </p>
              </div>

              <SeverityPill severity={selected.severity} />
            </div>

            <DatasetGeometryPreview geometry={selected.geometry} />

            {selectedDecisionEcho && (
              <div className="decisionEcho" role="status">
                <span>Updated action</span>
                <strong>{decisionLabel(selectedDecisionEcho)}</strong>
                {selected.decisionSummary && <p>{selected.decisionSummary}</p>}
              </div>
            )}

            <div className="detailMeta">
              <div>
                <span>Conflict</span>
                <strong>{selected.rawConflictType || selected.conflict}</strong>
              </div>

              <div>
                <span>Confidence</span>
                <strong>{selected.confidence == null ? "—" : `${selected.confidence}%`}</strong>
              </div>

              <div>
                <span>Status</span>
                <strong>{selected.status}</strong>
              </div>

              <div>
                <span>Queue age</span>
                <strong>{formatAge(selected.ageHours)}</strong>
              </div>
            </div>

            <section className="detailSection">
              <div className="sectionLabel">Why this parcel was flagged</div>
              <p className="detailCopy">{selected.reason || "—"}</p>
            </section>

            <section className="detailSection">
              <div className="sectionLabel">Source disagreement</div>

              <div className="sourceCards">
                <div className="sourceCard primarySource">
                  <span>{selected.sources?.[0] || "—"}</span>
                  <strong>{selected.currentValue || "—"}</strong>
                </div>

                <div className="versus">vs</div>

                <div className="sourceCard">
                  <span>{selected.sources?.[1] || "—"}</span>
                  <strong>{selected.competingValue || "—"}</strong>
                </div>
              </div>
            </section>

            <section className="detailSection">
              <div className="sectionLabel">Engine recommendation</div>

              <div className="recommendation">
                <div className="recommendationIcon" aria-hidden="true">➜</div>
                <p>{selected.recommendation || "No dataset recommendation available."}</p>
              </div>
            </section>

            <section className="detailSection compact">
              <div className="timelineRow assignmentRow">
                <span>Assignee <i className="helpDot" title="The assignee is the reviewer or review queue currently responsible for this parcel.">?</i></span>
                <strong>{selected.assignee || "Unassigned"}</strong>
              </div>

              <div className="timelineRow">
                <span>Assignment stage</span>
                <AssignmentStage stage={selected.assignmentStage} />
              </div>

              <div className="timelineRow">
                <span>Last updated</span>
                <strong>{selected.updatedAt || "—"}</strong>
              </div>

              <div className="timelineRow">
                <span>Evidence sources</span>
                <strong>{selected.sources?.join(", ") || "—"}</strong>
              </div>
            </section>

            <div className="detailActions">
              <button className="secondaryButton full" type="button" onClick={openAssignment}>
                Assign / reassign
              </button>

              <button
                className="primaryButton full"
                type="button"
                onClick={handleOpenReconciliation}
              >
                Open reconciliation →
              </button>
            </div>

            <button
              className="textButton"
              type="button"
              onClick={openHistoryAudit}
            >
              View parcel history & audit trail
            </button>
          </aside>
        ) : (
          <aside className="detailPanel">
            <div className="emptyState">
              <strong>No parcel selected</strong>
              <span>Select a conflict from the queue.</span>
            </div>
          </aside>
        )}
      </section>

      {assignmentOpen && selected && (
        <div className="assignmentBackdrop" onMouseDown={() => !assignmentSaving && setAssignmentOpen(false)}>
          <section className="assignmentModal" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-label={`Assign ${selected.id}`}>
            <div>
              <span className="eyebrow">PARCEL ASSIGNMENT</span>
              <h3>Route {selected.id}</h3>
              <p>
                Assignee means the person or review queue that currently owns this case.
                Routing changes as the parcel moves from triage to reconciliation, field review,
                or senior review.
              </p>
            </div>

            <label className="assignmentField">
              <span>Review route</span>
              <select
                value={assignmentStageDraft}
                onChange={(event) => setAssignmentStageDraft(event.target.value)}
              >
                {ASSIGNMENT_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
              <small>{ASSIGNMENT_OPTIONS.find((option) => option.value === assignmentStageDraft)?.hint}</small>
            </label>

            <label className="assignmentField">
              <span>Reviewer / team (optional)</span>
              <input
                value={assigneeDraft}
                onChange={(event) => setAssigneeDraft(event.target.value)}
                placeholder="Use route default when left blank"
                disabled={assignmentStageDraft === "Unassigned"}
              />
            </label>

            {assignmentError && <div className="assignmentError">{assignmentError}</div>}
            <div className="assignmentActions">
              <button className="secondaryButton" type="button" disabled={assignmentSaving} onClick={() => setAssignmentOpen(false)}>Cancel</button>
              <button className="primaryButton" type="button" disabled={assignmentSaving} onClick={saveAssignment}>{assignmentSaving ? "Saving…" : "Save route"}</button>
            </div>
          </section>
        </div>
      )}

      {historyOpen && selected && (
        <div className="assignmentBackdrop" onMouseDown={() => setHistoryOpen(false)}>
          <section className="historyModal" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-label={`History for ${selected.id}`}>
            <div className="historyHeader">
              <div>
                <span className="eyebrow">PARCEL HISTORY & AUDIT TRAIL</span>
                <h3>{selected.id}</h3>
                <p>Dataset timeline and reviewer actions for this parcel.</p>
              </div>
              <button className="modalClose" type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history">×</button>
            </div>

            {historyLoading ? (
              <div className="historyState">Loading parcel history…</div>
            ) : historyError ? (
              <div className="historyState historyStateError">{historyError}</div>
            ) : (
              <div className="historyColumns">
                <section>
                  <div className="sectionLabel">Dataset parcel history</div>
                  <div className="historyList">
                    {historyWorkspace?.timeline?.length ? historyWorkspace.timeline.map((event, index) => (
                      <article className="historyItem" key={`${event.year}-${event.type}-${index}`}>
                        <div className="historyDot" />
                        <div>
                          <span>{event.year || "—"}</span>
                          <strong>{event.type || "Dataset update"}</strong>
                          <p>{event.description || "No event description in dataset."}</p>
                          <small>{joinPresent([event.person, event.area != null ? `${event.area} m²` : null, event.verification])}</small>
                        </div>
                      </article>
                    )) : <p className="historyEmpty">No dataset timeline is available for this parcel.</p>}
                  </div>
                </section>

                <section>
                  <div className="sectionLabel">Reviewer audit trail</div>
                  <div className="historyList">
                    {historyAudit.length ? historyAudit.map((item) => (
                      <article className="historyItem" key={item.id}>
                        <div className="historyDot auditDot" />
                        <div>
                          <span>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "—"}</span>
                          <strong>{decisionLabel(item.action)}</strong>
                          <p>{item.summary || "Reviewer action recorded."}</p>
                          {item.reviewer && <small>{item.reviewer}</small>}
                        </div>
                      </article>
                    )) : <p className="historyEmpty">No reviewer actions have been recorded in this server session.</p>}
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

const styles = `
  :root {
    --bg: #eceff3;
    --panel: #ffffff;
    --line: #e5e9f0;
    --line-strong: #d7dce5;
    --text: #172033;
    --muted: #6b7280;
    --blue: #1d4ed8;
    --blue-soft: #eff6ff;
    --red: #b42318;
    --red-soft: #fef3f2;
    --amber: #9a6700;
    --amber-soft: #fffaeb;
    --green: #067647;
    --green-soft: #ecfdf3;
    --purple: #6941c6;
    --purple-soft: #f4f3ff;
    --box-shadow-light: 0 2px 8px rgba(15, 23, 42, .075);
  }

  * { box-sizing: border-box; }

  .conflictExplorer {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    padding: 28px;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
      sans-serif;
  }

  button, input, select { font: inherit; }

  .topbar {
    max-width: 1580px;
    margin: 0 auto 20px;
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-end;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .12em;
    color: #64748b;
  }

  .topbar h1 {
    margin: 6px 0 6px;
    font-size: 30px;
    line-height: 1.15;
    letter-spacing: -.03em;
  }

  .topbar p,
  .sectionHeading p,
  .detailTop p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  .topActions {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .primaryButton,
  .secondaryButton {
    border-radius: 9px;
    padding: 10px 14px;
    border: 1px solid transparent;
    font-weight: 700;
    cursor: pointer;
    transition: .15s ease;
  }

  .primaryButton {
    background: #172554;
    color: white;
    box-shadow: 0 1px 2px rgba(15, 23, 42, .1);
  }

  .primaryButton:hover { background: #1e3a8a; }

  .secondaryButton {
    background: white;
    border-color: var(--line-strong);
    color: #273449;
  }

  .secondaryButton:hover { background: #f8fafc; }

  .summaryGrid {
    max-width: 1580px;
    margin: 0 auto 18px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .summaryCard {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 15px 16px;
    box-shadow: var(--box-shadow-light);
  }

  .summaryLabel {
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  .summaryCard strong {
    display: block;
    margin-top: 5px;
    font-size: 25px;
    letter-spacing: -.03em;
  }

  .summaryCard small { color: #7c8798; }

  .queueShell {
    max-width: 1580px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 390px;
    gap: 14px;
    align-items: start;
  }

  .queuePanel,
  .detailPanel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: var(--box-shadow-light);
  }

  .queuePanel { overflow: hidden; }

  .sectionHeading {
    padding: 18px 20px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sectionHeading h2,
  .detailTop h2 {
    margin: 0 0 4px;
    font-size: 18px;
    letter-spacing: -.02em;
  }

  .resolvedToggle {
    color: var(--muted);
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
  }

  .typeTabs {
    display: flex;
    gap: 4px;
    padding: 0 20px 12px;
    border-bottom: 1px solid var(--line);
  }

  .typeTab {
    border: 0;
    background: transparent;
    color: #667085;
    padding: 7px 10px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    gap: 7px;
    align-items: center;
  }

  .typeTab span {
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 999px;
    background: #eef1f5;
    font-size: 10px;
  }

  .typeTab.active {
    color: #1e40af;
    background: #eff6ff;
  }

  .typeTab.active span {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .controlsRow {
    padding: 13px 20px;
    display: grid;
    grid-template-columns: minmax(250px, 1fr) 130px 145px 150px;
    gap: 8px;
    border-bottom: 1px solid var(--line);
  }

  .searchBox {
    height: 38px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 8px;
    background: white;
    box-shadow: var(--box-shadow-light);
  }

  .searchBox span { color: #8490a1; font-size: 18px; }

  .searchBox input {
    border: 0;
    outline: none;
    width: 100%;
    color: var(--text);
    background: transparent;
    font-size: 12px;
  }

  .controlsRow select {
    height: 38px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: white;
    color: #344054;
    padding: 0 9px;
    font-size: 12px;
    outline: none;
    box-shadow: var(--box-shadow-light);
  }

  .tableWrap { overflow-x: auto; }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 900px;
  }

  thead th {
    padding: 10px 12px;
    background: #f8fafc;
    border-bottom: 1px solid var(--line);
    text-align: left;
    color: #667085;
    font-size: 10px;
    letter-spacing: .04em;
    text-transform: uppercase;
    font-weight: 800;
    white-space: nowrap;
  }

  thead th:first-child,
  tbody td:first-child { padding-left: 20px; }

  tbody tr {
    border-bottom: 1px solid #edf0f4;
    cursor: pointer;
    transition: background .12s ease;
  }

  tbody tr:hover { background: #fbfcfe; }
  tbody tr.selectedRow { background: #f5f8ff; }

  tbody td {
    padding: 12px;
    font-size: 12px;
    vertical-align: middle;
    color: #344054;
  }

  .parcelCell {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .parcelCell strong { color: #172033; font-size: 12px; }
  .parcelCell span { color: #7c8798; font-size: 10px; white-space: nowrap; }

  .assigneeCell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 110px;
  }

  .assigneeCell strong {
    color: #344054;
    font-size: 11px;
    font-weight: 700;
  }

  .assigneeCell span {
    color: #8490a1;
    font-size: 9px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 10px;
    line-height: 1.4;
    font-weight: 800;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .pill-danger { color: var(--red); background: var(--red-soft); border-color: #fecdca; }
  .pill-warning { color: var(--amber); background: var(--amber-soft); border-color: #fedf89; }
  .pill-success { color: var(--green); background: var(--green-soft); border-color: #abefc6; }
  .pill-info { color: #175cd3; background: #eff8ff; border-color: #b2ddff; }
  .pill-purple { color: var(--purple); background: var(--purple-soft); border-color: #d9d6fe; }
  .pill-neutral { color: #475467; background: #f2f4f7; border-color: #e4e7ec; }

  .confidenceWrap {
    min-width: 110px;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 700;
  }

  .confidenceTrack {
    width: 62px;
    height: 5px;
    border-radius: 999px;
    overflow: hidden;
    background: #e8edf3;
  }

  .confidenceFill {
    height: 100%;
    border-radius: inherit;
    background: #3b82f6;
  }

  .ageAlert {
    color: var(--red);
    font-weight: 800;
  }

  .arrowCell {
    font-size: 20px;
    color: #98a2b3;
    text-align: right;
    padding-right: 18px;
  }

  .emptyState {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: #667085;
  }

  .emptyState strong { color: #344054; }

  .queueFooter {
    min-height: 43px;
    padding: 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #7c8798;
    font-size: 10px;
    background: #fbfcfd;
  }

  .detailPanel {
    padding: 18px;
    position: sticky;
    top: 18px;
  }

  .detailTop {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
  }

  .detailTop h2 { margin-top: 5px; }

  .miniMap {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    background: transparent;
    margin-bottom: 14px;
    position: relative;
    box-shadow: var(--box-shadow-light);
  }

  .miniMap svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .mapLegend {
    position: absolute;
    right: 8px;
    bottom: 8px;
    background: rgba(255,255,255,.92);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 5px 7px;
    display: flex;
    gap: 9px;
    font-size: 9px;
    color: #64748b;
  }

  .mapLegend span { display: flex; align-items: center; gap: 4px; }
  .mapLegend i { width: 8px; height: 2px; display: inline-block; }
  .legendBlue { background: #2563eb; }
  .legendRed { background: #dc2626; }

  .decisionEcho {
    margin: 10px 0 12px;
    padding: 9px 0 10px;
    border-top: 1px solid #b7dfc9;
    border-bottom: 1px solid #b7dfc9;
  }

  .decisionEcho span {
    display: block;
    color: #64748b;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-weight: 800;
  }

  .decisionEcho strong {
    display: block;
    margin-top: 3px;
    color: #067647;
    font-size: 12px;
  }

  .decisionEcho p {
    margin: 4px 0 0;
    color: #475467;
    font-size: 10px;
    line-height: 1.45;
  }

  .detailMeta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 2px 0 14px;
    border-top: 1px solid var(--line-strong);
    border-bottom: 1px solid var(--line-strong);
  }

  .detailMeta div {
    min-width: 0;
    padding: 11px 10px;
  }

  .detailMeta div:nth-child(odd) {
    border-right: 1px solid var(--line-strong);
  }

  .detailMeta div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line-strong);
  }

  .detailMeta span,
  .sectionLabel,
  .timelineRow span {
    display: block;
    color: #7c8798;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .05em;
    font-weight: 800;
  }

  .detailMeta strong {
    display: block;
    margin-top: 3px;
    font-size: 12px;
  }

  .detailSection {
    padding: 13px 0;
    border-top: 1px solid var(--line);
  }

  .detailSection.compact { padding-bottom: 5px; }

  .detailCopy {
    margin: 6px 0 0;
    color: #475467;
    font-size: 12px;
    line-height: 1.55;
  }

  .sourceCards {
    margin-top: 8px;
    display: grid;
    grid-template-columns: 1fr 24px 1fr;
    align-items: stretch;
  }

  .sourceCard {
    padding: 9px;
    border: 1px solid #f2c7c3;
    background: #fff8f7;
    border-radius: 8px;
    box-shadow: var(--box-shadow-light);
  }

  .sourceCard.primarySource {
    border-color: #bfdbfe;
    background: #f7fbff;
  }

  .sourceCard span {
    display: block;
    color: #7c8798;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .sourceCard strong {
    display: block;
    margin-top: 5px;
    font-size: 10px;
    line-height: 1.35;
  }

  .versus {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: #98a2b3;
    font-weight: 800;
  }

  .recommendation {
    margin-top: 9px;
    display: flex;
    gap: 9px;
    align-items: flex-start;
  }

  .recommendationIcon {
    color: #172033;
    font-size: 20px;
    font-weight: 900;
    line-height: 1;
    transform: translateY(1px);
    flex: 0 0 auto;
  }

  .recommendation p {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.5;
    color: #344054;
  }

  .timelineRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 6px 0;
  }

  .timelineRow span {
    text-transform: none;
    letter-spacing: 0;
    font-size: 10px;
  }

  .timelineRow strong {
    font-size: 10px;
    text-align: right;
  }

  .assignmentRow span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .helpDot {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    color: #64748b;
    font-size: 9px;
    font-style: normal;
    cursor: help;
  }

  .detailActions {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 8px;
    padding-top: 10px;
  }

  .full { width: 100%; font-size: 11px; }

  .textButton {
    display: block;
    width: 100%;
    margin-top: 9px;
    border: 0;
    background: transparent;
    color: #3158b8;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
    padding: 5px;
  }

  .assignmentBackdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(15, 23, 42, .35);
    backdrop-filter: blur(2px);
  }

  .assignmentModal {
    width: min(420px, calc(100vw - 40px));
    padding: 20px;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 24px 70px rgba(15, 23, 42, .18);
  }

  .assignmentModal h3 {
    margin: 5px 0 5px;
    font-size: 18px;
  }

  .assignmentModal p {
    margin: 0 0 14px;
    color: #64748b;
    font-size: 11px;
    line-height: 1.5;
  }

  .assignmentField {
    display: block;
    margin-top: 12px;
  }

  .assignmentField > span {
    display: block;
    margin-bottom: 6px;
    color: #475467;
    font-size: 10px;
    font-weight: 800;
  }

  .assignmentField small {
    display: block;
    margin-top: 5px;
    color: #8490a1;
    font-size: 9px;
    line-height: 1.4;
  }

  .assignmentModal input,
  .assignmentModal select {
    width: 100%;
    min-height: 40px;
    padding: 9px 11px;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    background: #fff;
    color: #344054;
    outline: none;
  }

  .assignmentModal input:disabled {
    background: #f8fafc;
    color: #98a2b3;
  }

  .assignmentModal input:focus,
  .assignmentModal select:focus {
    border-color: #93b4f4;
    box-shadow: 0 0 0 3px #eff6ff;
  }

  .historyModal {
    width: min(900px, calc(100vw - 40px));
    max-height: min(760px, calc(100vh - 40px));
    overflow: auto;
    padding: 22px;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 24px 70px rgba(15, 23, 42, .18);
  }

  .historyHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
  }

  .historyHeader h3 {
    margin: 5px 0 4px;
    font-size: 20px;
  }

  .historyHeader p {
    margin: 0;
    color: #64748b;
    font-size: 11px;
  }

  .modalClose {
    width: 32px;
    height: 32px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: #fff;
    color: #475467;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .historyColumns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 26px;
    padding-top: 18px;
  }

  .historyList {
    margin-top: 12px;
  }

  .historyItem {
    position: relative;
    display: grid;
    grid-template-columns: 16px 1fr;
    gap: 10px;
    padding-bottom: 18px;
  }

  .historyItem:not(:last-child)::before {
    content: "";
    position: absolute;
    left: 5px;
    top: 12px;
    bottom: 0;
    width: 1px;
    background: #dbe2ea;
  }

  .historyDot {
    position: relative;
    z-index: 1;
    width: 11px;
    height: 11px;
    margin-top: 2px;
    border: 3px solid #fff;
    border-radius: 999px;
    background: #3b82f6;
    box-shadow: 0 0 0 1px #93c5fd;
  }

  .historyDot.auditDot {
    background: #059669;
    box-shadow: 0 0 0 1px #6ee7b7;
  }

  .historyItem span {
    display: block;
    color: #8490a1;
    font-size: 9px;
  }

  .historyItem strong {
    display: block;
    margin-top: 3px;
    color: #1f2937;
    font-size: 11px;
  }

  .historyItem p {
    margin: 4px 0;
    color: #475467;
    font-size: 10px;
    line-height: 1.45;
  }

  .historyItem small,
  .historyEmpty,
  .historyState {
    color: #8490a1;
    font-size: 9px;
  }

  .historyState {
    padding: 34px 0;
    text-align: center;
  }

  .historyStateError {
    color: var(--red);
  }

  .assignmentError {
    margin-top: 9px;
    color: var(--red);
    font-size: 10px;
  }

  .assignmentActions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  @media (max-width: 1180px) {
    .queueShell { grid-template-columns: 1fr; }
    .detailPanel { position: static; }
  }

  @media (max-width: 820px) {
    .conflictExplorer { padding: 18px; }
    .topbar { align-items: flex-start; flex-direction: column; }
    .summaryGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .controlsRow { grid-template-columns: 1fr 1fr; }
    .searchBox { grid-column: 1 / -1; }
    .historyColumns { grid-template-columns: 1fr; }
  }

  @media (max-width: 560px) {
    .summaryGrid { grid-template-columns: 1fr; }
    .typeTabs { overflow-x: auto; }
    .controlsRow { grid-template-columns: 1fr; }
    .searchBox { grid-column: auto; }
    .queueFooter { align-items: flex-start; gap: 7px; flex-direction: column; padding-block: 10px; }
    .detailActions { grid-template-columns: 1fr; }
  }
`;
