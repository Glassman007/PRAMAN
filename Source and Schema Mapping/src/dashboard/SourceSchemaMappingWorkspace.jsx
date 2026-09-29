import React, { useEffect, useMemo, useRef, useState } from "react";
import "./sourceSchemaMapping.css";

const VIEWS = [
  ["overview", "Overview"],
  ["schema", "Schema Mapping"],
  ["quality", "Quality & Exceptions"],
  ["lineage", "Lineage & Impact"],
  ["history", "History & Configuration"],
];

const NA = "Not available";
const numberFmt = new Intl.NumberFormat("en-IN");
const formatNumber = (v) => (v === null || v === undefined || v === "") ? NA : (Number.isFinite(Number(v)) ? numberFmt.format(Number(v)) : NA);
const text = (v) => v === null || v === undefined || v === "" ? NA : String(v);
const entries = (obj) => Object.entries(obj || {});
const EXCEPTION_PAGE_SIZE = 100;

function urlInitial(key, fallback) {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(key) || fallback;
}

function syncUrl(sourceId, view) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (sourceId) url.searchParams.set("ssm_source", sourceId);
  if (view) url.searchParams.set("ssm_view", view);
  window.history.replaceState({}, "", url);
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`ssm-badge ssm-badge--${tone}`}>{children}</span>;
}

function EmptyState({ title, children }) {
  return <div className="ssm-empty"><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

function keyboardActivate(event, action) {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
}

function useDialogAccessibility(ref, onClose) {
  useEffect(() => {
    if (typeof document === "undefined" || !ref.current) return undefined;
    const node = ref.current;
    const previous = document.activeElement;
    const focusable = () => [...node.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.getAttribute("aria-hidden") !== "true");
    (focusable()[0] || node).focus?.();
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose?.(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [ref, onClose]);
}

function Metric({ label, value, note }) {
  return <div className="ssm-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function ArchitectureFlow({ stages }) {
  return <section className="ssm-section">
    <div className="ssm-section-head"><div><span className="ssm-kicker">Architecture</span><h2>Source → normalized source state</h2></div><p>Stage facts only; this is not a progress indicator.</p></div>
    <div className="ssm-flow">
      {stages.map((stage, i) => <React.Fragment key={stage.key}>
        <div className="ssm-stage">
          <span>{stage.label}</span>
          <strong>{text(stage.primary)}</strong>
          {stage.secondary && <small>{stage.secondary}</small>}
        </div>
        {i < stages.length - 1 && <div className="ssm-arrow" aria-hidden="true">→</div>}
      </React.Fragment>)}
    </div>
  </section>;
}

function SourceRegistry({ rows, selectedId, onSelect }) {
  return <section className="ssm-section">
    <div className="ssm-section-head"><div><span className="ssm-kicker">Registry</span><h2>Detected sources</h2></div><p>{formatNumber(rows.length)} visible</p></div>
    {rows.length === 0 ? <EmptyState title="No sources match the current search/filter." /> :
      <div className="ssm-table-wrap"><table className="ssm-table">
        <thead><tr><th>Source</th><th>Type</th><th>Records</th><th>Fields</th><th>Character</th><th>Geometry</th><th>CRS</th><th>Source → canonical</th><th>Validation</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.sourceId} className={selectedId === r.sourceId ? "is-selected" : ""} role="button" tabIndex={0} aria-label={`Inspect source ${text(r.sourceName)}`} onClick={() => onSelect(r.sourceId)} onKeyDown={e => keyboardActivate(e, () => onSelect(r.sourceId))}>
          <td><strong>{text(r.sourceName)}</strong><small>{r.sourceId}</small></td>
          <td>{text(r.sourceType)}</td>
          <td>{formatNumber(r.recordCount)}</td>
          <td>{formatNumber(r.fieldCount)}</td>
          <td>{text(r.dataCharacter)}</td>
          <td>{r.spatial?.geometry_record_count ? <>{formatNumber(r.spatial.geometry_record_count)}<small>{entries(r.spatial.normalized_geometry_type_frequencies).map(([k]) => k).join(", ") || NA}</small></> : NA}</td>
          <td>{entries(r.spatial?.original_crs_frequencies).map(([k]) => k).join(", ") || NA}</td>
          <td>{r.sourceToCanonicalMappingAvailable ? <Badge tone="ok">Available</Badge> : <Badge>Not available</Badge>}</td>
          <td>{r.issueOccurrences === 0 ? <Badge tone="ok">No issues detected</Badge> : <Badge tone="warn">{formatNumber(r.issueOccurrences)} occurrences</Badge>}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}

function OverviewView({ service, sources, selected, onSelect }) {
  const overview = useMemo(() => selected ? service.getSourceOverview(selected) : null, [service, selected]);
  const stages = useMemo(() => selected ? service.getArchitectureStages(selected) : [], [service, selected]);
  const rows = useMemo(() => sources.map(s => ({...s, ...service.getSourceOverview(s.sourceId), spatial: service.getSpatialMetadata(s.sourceId)})), [service, sources]);
  if (!selected || !overview) return <EmptyState title="No source selected" />;
  return <>
    <ArchitectureFlow stages={stages} />
    <div className="ssm-metrics-grid">
      <Metric label="Records" value={formatNumber(overview.recordCount)} />
      <Metric label="Fields" value={formatNumber(overview.fieldCount)} note={`${overview.normalizedFieldCount} normalized + ${overview.sourceNativeFieldCount} source-native`} />
      <Metric label="Populated values" value={formatNumber(overview.populatedValues)} note="Across detected normalized + source-native field profiles" />
      <Metric label="Missing values" value={formatNumber(overview.missingValues)} note="Across the same field profiles" />
      <Metric label="Unique source records" value={formatNumber(overview.uniqueSourceRecords)} />
      <Metric label="Mapped fields" value={overview.mappedFields} note="Explicit source→canonical mapping metadata" />
      <Metric label="Unmapped fields" value={overview.unmappedFields} note="Not inferred without mapping rules" />
      <Metric label="Mapping coverage" value={overview.mappingCoverage} note="No arbitrary coverage score" />
      <Metric label="Detected issues" value={formatNumber(overview.issueOccurrences)} note="Available validation-counter occurrences; records may overlap" />
    </div>
    <SourceRegistry rows={rows} selectedId={selected} onSelect={onSelect} />
  </>;
}

function clipValue(value, limit = 240) {
  const raw = value === null || value === undefined || value === "" ? NA : (typeof value === "object" ? JSON.stringify(value) : String(value));
  return raw.length > limit ? `${raw.slice(0, limit)}…` : raw;
}

function prettyLabel(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

const FIELD_EXPLANATIONS = Object.freeze({
  observation_id: "Unique identifier for this individual source observation inside PRAMAN.",
  source_type: "Label identifying which source family and source-specific schema this observation belongs to.",
  source_record_id: "Identifier that links the normalized observation back to the record identifier supplied by this source.",
  source_parcel_id: "Parcel identifier supplied or interpreted within this source. By itself, it does not prove that another agency's record refers to the same parcel.",
  owner_name: "Owner or occupier name carried from the selected source into the normalized pre-matching record.",
  address: "Property or location address carried from the selected source into the normalized pre-matching record.",
  land_use: "Land-use value stored in the normalized source state for later consistent comparison.",
  geometry_id: "Identifier linking this observation to the stored source-geometry record used for spatial processing.",
  observed_area: "Area value recorded for this source observation in the normalized source state.",
  observation_date: "Date represented by this source observation in the normalized pre-matching record.",
  source_reliability: "Source-level reliability value stored with the observation for later evidence evaluation.",
  geometry_confidence: "Stored confidence value for the spatial evidence associated with this observation.",
  attribute_confidence: "Stored confidence value for the non-spatial attributes associated with this observation.",
  temporal_freshness: "Stored measure of how recent the observation is relative to the dataset's temporal context.",
  identifier_confidence: "Stored confidence value for identifier evidence. It is not, by itself, proof of cross-source parcel identity.",
  positional_accuracy_m: "Recorded positional accuracy of the spatial evidence, expressed in metres.",
  source_specific_details: "Source-native information retained because the current contract does not document a trustworthy direct equivalent in the common normalized schema.",
  original_crs: "Coordinate reference system in which the source geometry was originally recorded.",
  original_geometry_wkt: "Original source geometry represented as Well-Known Text before spatial normalization.",
  normalized_crs: "Coordinate reference system PRAMAN uses after spatial normalization.",
  normalized_geometry_wkt: "Normalized geometry representation stored for spatial processing after coordinate-system normalization.",
  observed_area_sqm: "Area associated with the stored source geometry, expressed in square metres.",
  normalization_method: "Recorded method used to convert the source geometry into its normalized spatial representation.",
  geometry_quality_flag: "Recorded quality flag describing the condition of the normalized source geometry.",
  observation_ids: "Observation identifiers linked to this stored source-geometry record.",
  source_record_ids: "Source record identifiers linked to this stored source-geometry record."
});

const TERM_HELP = Object.freeze({
  Normalized: "Stored in a common PRAMAN source-state form so values from different source systems can later be compared consistently.",
  "Source-native": "Kept under the source's own field meaning because no trustworthy common-schema equivalent is documented.",
  Derived: "Calculated from one or more other values only when a documented derivation rule exists.",
  Transformation: "A documented rule that changes the representation of a value, such as coordinate-system normalization.",
  Validation: "The recorded check of whether a represented relationship and its values agree with the current contract and data.",
  "Relationship evidence": "Dataset, contract, transformation, or audit evidence that supports why the relationship is shown.",
  "Affected records": "Number of current source or geometry records for which the represented relationship applies.",
  Completeness: "Share of evaluated field values that are populated. It is a measured condition, not an overall PRAMAN quality score.",
  "Duplicate values": "Repeated populated values beyond the first occurrence. This does not automatically mean duplicate records.",
  "Datatype validity": "Whether values conform to an expected datatype where the current data dictionary defines one.",
  Exception: "A specific record or condition that failed a defined validation or quality rule in the current dataset.",
  Provenance: "The evidence trail showing where a represented value or relationship came from and which steps are actually documented.",
  Lineage: "Data traceability for a field or value. In this tab it does not mean parcel ownership or parcel-history lineage.",
  Impact: "A dependency that can be explicitly traced from the selected mapping, validation rule, or configuration. Unrecorded downstream effects are not assumed.",
  Configuration: "The current rules and metadata that control how PRAMAN interprets the selected source before parcel matching.",
  "Schema version": "A recorded version of a source schema definition. It is shown only when the current dataset actually stores version history.",
  "Validation rule": "A documented rule used to check required fields, nullability, datatypes, geometry, or another supported condition."
});

function plainFieldDescription(field) {
  if (!field) return null;
  if (FIELD_EXPLANATIONS[field.field]) return FIELD_EXPLANATIONS[field.field];
  if (field.layer === "source_native") return "Source-specific field retained under its original name for traceability. The current contract does not document a trustworthy common-schema equivalent for it.";
  if (String(field.field || "").startsWith("source_specific_details.")) return "Source-native value retained inside source_specific_details under its original source field name rather than being presented as a common normalized field.";
  if (field.definition && field.definition !== NA) return field.definition;
  return null;
}

function HelpTerm({ term, showLabel = true }) {
  const help = TERM_HELP[term];
  if (!help) return <span>{showLabel ? term : null}</span>;
  return <span className="ssm-help-term">{showLabel ? term : null}<span className="ssm-help-dot" tabIndex={0} title={help} aria-label={`${term}: ${help}`}>?<span className="ssm-help-tooltip" role="tooltip">{help}</span></span></span>;
}

function SectionExplanation({ children }) {
  return <p className="ssm-section-explanation">{children}</p>;
}

function percentValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return NA;
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function displayValue(value) {
  if (value === "") return "∅ Empty";
  if (value === null) return "∅ Null";
  if (value === undefined) return NA;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function RecordKeyValues({ record, highlightField }) {
  if (!record || !Object.keys(record).length) return <EmptyState title="Record unavailable" />;
  return <div className="ssm-record-kv">{Object.entries(record).map(([k,v]) => <div key={k} className={`ssm-record-kv__row ${highlightField === k ? "is-highlighted" : ""}`}><span>{k}</span><code title={displayValue(v)}>{clipValue(displayValue(v), 180)}</code></div>)}</div>;
}

function FieldNode({ field, selected, related, onClick, subtitle, description, nodeKey }) {
  const technicalDefinition = field?.definition && field.definition !== NA ? field.definition : null;
  const readableDescription = description || plainFieldDescription(field);
  return <button data-node-key={nodeKey || field.key || ""} className={`ssm-schema-node ${selected ? "is-selected" : ""} ${related ? "has-relation" : ""}`} onClick={onClick} type="button" title={technicalDefinition ? `Contract definition: ${technicalDefinition}` : undefined}>
    <span className="ssm-schema-node__name">{field.field}</span>
    <span className="ssm-schema-node__type">{text(field.dataType)}</span>
    {subtitle && <span className="ssm-schema-node__state">{subtitle}</span>}
    {readableDescription && readableDescription !== NA && <span className="ssm-schema-node__description">{readableDescription}</span>}
  </button>;
}

function relationshipLabel(relation, auditEntry) {
  if (auditEntry?.relationshipCategory) return auditEntry.relationshipCategory;
  if (!relation) return NA;
  if (relation.mappingKind === "source_native_value_retained") return "Source-native retention";
  if (relation.mappingKind === "explicit_geometry_transformation") return "Geometry normalization";
  if (relation.mappingKind === "explicit_source_to_canonical_mapping") return "Direct normalization";
  return prettyLabel(relation.mappingKind);
}

function relationshipFilterLabel(kind) {
  if (kind === "undocumented_derivation") return "Undocumented derivation";
  if (kind === "source_native_value_retained") return "Source-native retained";
  if (kind === "explicit_geometry_transformation") return "Geometry transformation";
  if (kind === "explicit_source_to_canonical_mapping") return "Direct normalization";
  return prettyLabel(kind);
}

function relationshipTargetNodeKey(relation) {
  if (!relation) return "";
  if (relation.mappingKind === "explicit_source_to_canonical_mapping") return `canonical:${relation.normalizedField}`;
  if (relation.mappingKind === "source_native_value_retained") return `retained_target:${relation.id}`;
  if (relation.mappingKind === "explicit_geometry_transformation") return `source_geometry:${relation.normalizedField}`;
  return `normalized_target:${relation.normalizedField}`;
}

function ConnectionOverlay({ gridRef, relationships }) {
  const [paths, setPaths] = useState([]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof window === "undefined") return undefined;
    let frame = null;
    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = grid.getBoundingClientRect();
        const nodes = [...grid.querySelectorAll("[data-node-key]")];
        const find = (key) => nodes.find(node => node.dataset.nodeKey === key);
        const next = [];
        for (const relation of relationships) {
          const source = find(`${relation.sourceLayer}:${relation.sourceField}`);
          const target = find(relationshipTargetNodeKey(relation));
          if (!source || !target) continue;
          const a = source.getBoundingClientRect(), b = target.getBoundingClientRect();
          const x1 = a.right - rect.left, y1 = a.top + a.height / 2 - rect.top;
          const x2 = b.left - rect.left, y2 = b.top + b.height / 2 - rect.top;
          const bend = Math.max(28, (x2 - x1) * .42);
          next.push({ id: relation.id, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` });
        }
        setPaths(next);
      });
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(grid);
    const scrollPanels = [...grid.querySelectorAll(".ssm-schema-scroll")];
    scrollPanels.forEach(panel => panel.addEventListener("scroll", update, { passive: true }));
    window.addEventListener("resize", update);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      scrollPanels.forEach(panel => panel.removeEventListener("scroll", update));
      window.removeEventListener("resize", update);
    };
  }, [gridRef, relationships.map(r => r.id).join("|")]);
  if (!paths.length) return null;
  return <svg className="ssm-connection-overlay" aria-hidden="true"><g>{paths.map(path => <path key={path.id} d={path.d} className="is-selected" />)}</g></svg>;
}

function MappingDetailsPanel({ relation, auditEntry, field, undocumentedEntry, relatedRelations, auditByRelationId, onSelectRelation, onOpenQuality, mappingAvailability }) {
  const entry = auditEntry || undocumentedEntry || null;
  if (!relation && !field && !entry) return <div className="ssm-details-empty">
    <span className="ssm-kicker">Relationship / Mapping Details</span>
    <h3>Select a field to inspect its mapping</h3>
    <p>This panel explains how a source field is retained, transformed, derived, normalized, or left without a documented derivation. PRAMAN needs this evidence view so a reviewer can see why a connection is shown instead of treating every similar-looking field as equivalent. Select a source or PRAMAN field to see the supported relationship, rule, affected records, validation, and evidence below.</p>
    <div className="ssm-mapping-limit"><strong>Source → canonical mapping</strong><span>{text(mappingAvailability)}</span><p>No connector is drawn unless the current PRAMAN contract/configuration documents it.</p></div>
  </div>;

  const category = entry?.relationshipCategory || relationshipLabel(relation, entry);
  const evidence = Array.isArray(entry?.mappingEvidence) ? entry.mappingEvidence : [entry?.mappingEvidence].filter(Boolean);
  const exceptions = entry?.exceptions || { count: relation?.validationIssueCount || 0, categories: [] };
  const destination = entry?.destinationField || relation?.normalizedLocation || relation?.normalizedField || (field?.layer === "normalized_source" ? field.field : NA);
  const ruleAvailable = (value) => value && value !== NA;

  return <div className="ssm-details-panel">
    <div className="ssm-details-head">
      <span className="ssm-kicker">Relationship / Mapping Details</span>
      <h3>{relation?.sourceField || field?.field || destination}</h3>
      <p>{relation ? `${relation.sourceField} → ${relation.normalizedLocation || relation.normalizedField}` : entry?.relationshipCategory || "Field inspection"}</p>
      <p className="ssm-details-purpose">This inspector explains what PRAMAN does with the selected field and the evidence supporting that interpretation. The values below describe the selected relationship only; they do not establish cross-source parcel identity.</p>
    </div>

    {relatedRelations?.length > 1 && <section className="ssm-details-section"><h4>Connected relationships</h4><div className="ssm-related-relations">{relatedRelations.map(r => <button type="button" key={r.id} className={relation?.id === r.id ? "is-active" : ""} onClick={()=>onSelectRelation(r)}><strong>{r.sourceField}</strong><span>→</span><code>{r.normalizedLocation || r.normalizedField}</code></button>)}</div></section>}

    {entry ? <>
      <section className="ssm-details-section"><h4>Relationship</h4>
        {[ ["Source field", entry.sourceField || NA], ["PRAMAN destination", destination], ["Relationship category", category], ["Source datatype", entry.sourceDatatype || relation?.sourceDataType], ["Destination datatype", entry.destinationDatatype || relation?.targetDataType], ["Affected records", `${formatNumber(entry.affectedRecords ?? relation?.affectedRecords)} ${entry.affectedRecordUnit || "records"}`], ["Validation status", entry.validationStatus || relation?.validationStatus], ["Validation result", entry.validationResult || NA] ].map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}{k === "Affected records" ? <> <HelpTerm term="Affected records" showLabel={false} /></> : k.startsWith("Validation") ? <> <HelpTerm term="Validation" showLabel={false} /></> : null}</span><strong>{text(v)}</strong></div>)}
      </section>
      <section className="ssm-details-section"><h4>Transformation / retention <HelpTerm term="Transformation" showLabel={false} /></h4>
        <div className="ssm-rule-block"><span>Transformation rule</span><strong>{ruleAvailable(entry.transformationRule) ? entry.transformationRule : "No documented transformation rule"}</strong></div>
        <div className="ssm-rule-block"><span>Retention rule</span><strong>{ruleAvailable(entry.retentionRule) ? entry.retentionRule : "Not applicable / not documented"}</strong></div>
        <div className="ssm-rule-block"><span>Normalization rule</span><strong>{ruleAvailable(entry.normalizationRule) ? entry.normalizationRule : "Not documented"}</strong></div>
      </section>
      <section className="ssm-details-section"><h4>Exceptions</h4>
        <div className="ssm-kv"><span>Relationship exceptions</span><strong>{formatNumber(exceptions.count || 0)}</strong></div>
        {exceptions.categories?.length > 0 && <div className="ssm-detail-tags">{exceptions.categories.map(item => <span key={item.category}>{prettyLabel(item.category)} · {formatNumber(item.count)}</span>)}</div>}
      </section>
      <section className="ssm-details-section"><h4>Mapping evidence <HelpTerm term="Relationship evidence" showLabel={false} /></h4>
        {evidence.length ? <ul className="ssm-evidence-list">{evidence.map((item,i)=><li key={`${i}:${item}`}>{text(item)}</li>)}</ul> : <p className="ssm-muted-note">No additional mapping evidence is recorded.</p>}
      </section>
      <section className="ssm-details-section"><h4>Why this relationship exists</h4><p className="ssm-detail-explanation">{text(entry.explanation)}</p></section>
      {relation && (relation.sampleInput !== null || relation.sampleOutput !== null) && <section className="ssm-details-section"><h4>Real sample</h4><div className="ssm-sample-block"><span>Source value</span><code title={text(relation.sampleInput)}>{clipValue(relation.sampleInput)}</code></div><div className="ssm-sample-block"><span>PRAMAN value</span><code title={text(relation.sampleOutput)}>{clipValue(relation.sampleOutput)}</code></div></section>}
    </> : <section className="ssm-details-section"><h4>Field metadata</h4>
      {[ ["Field", field?.field], ["Datatype", field?.dataType], ["Layer", field?.layer], ["Mapping state", field?.mappingState || NA], ["Populated", formatNumber(field?.populated)], ["Null / empty", formatNumber(field?.null_or_empty)], ["Unique populated", formatNumber(field?.unique_populated)] ].map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{text(v)}</strong></div>)}
      <div className="ssm-callout">No defensible relationship is documented for this field in the current dataset/configuration. No connector has been invented.</div>
    </section>}
    {onOpenQuality && (field || relation) && <button className="ssm-button ssm-details-action" type="button" onClick={() => onOpenQuality({ relationId: relation?.id || null, field: relation?.sourceField || field?.field })}>Inspect source quality</button>}
  </div>;
}

function SchemaView({ service, selected, search, context, preferences, onPreferencesChange, onContextChange, onOpenQuality }) {
  const model = useMemo(() => service.getSchemaMappingModel(selected), [service, selected]);
  const mappings = useMemo(() => service.getMappings(selected), [service, selected]);
  const mappingAudit = useMemo(() => service.getMappingAudit(selected), [service, selected]);
  const identifiers = useMemo(() => service.getIdentifierInterpretation(selected), [service, selected]);
  const unmapped = useMemo(() => service.getUnmappedSourceFieldClassification(selected), [service, selected]);
  const missingCanonical = useMemo(() => service.getMissingCanonicalFieldClassification(selected), [service, selected]);
  const valueDictionary = useMemo(() => service.getValueDictionary(selected), [service, selected]);
  const localSearch = preferences?.schemaSearch || "";
  const kindFilter = preferences?.schemaKindFilter || "all";
  const centerMode = preferences?.schemaRightMode || "normalized";
  const focusedDomainId = context?.domainId || null;
  const [selectedRelationId, setSelectedRelationId] = useState("");
  const [activeRelationIds, setActiveRelationIds] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [columns, setColumns] = useState([1, 1.04, .96]);
  const gridRef = useRef(null);
  const sourceScrollRef = useRef(null);
  const pramanScrollRef = useRef(null);
  const detailsScrollRef = useRef(null);

  useEffect(() => {
    const requested = context?.relationId && model?.relationships?.some(r => r.id === context.relationId) ? context.relationId : "";
    setSelectedRelationId(requested);
    setActiveRelationIds(requested ? [requested] : []);
    setSelectedField(null);
    if (typeof window !== "undefined") window.requestAnimationFrame(() => {
      sourceScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      pramanScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      detailsScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [selected]);

  if (!model) return <EmptyState title="No source selected" />;

  const globalSchemaQuery = (search || "").trim().toLowerCase();
  const localSchemaQuery = (localSearch || "").trim().toLowerCase();
  const matchesSchemaSearch = (value) => {
    const hay = String(value || "").toLowerCase();
    return (!globalSchemaQuery || hay.includes(globalSchemaQuery)) && (!localSchemaQuery || hay.includes(localSchemaQuery));
  };
  const auditByRelationId = new Map((mappingAudit?.representedRelationships || []).map(entry => [entry.relationId, entry]));
  const undocumentedByField = new Map((mappingAudit?.undocumentedNormalizedDerivations || []).map(entry => [String(entry.destinationField || "").split(".").pop(), entry]));
  const relationKinds = [...new Set((model.relationships || []).map(r => r.mappingKind))];
  const domainFieldNames = new Set((model.canonicalFields || []).filter(f => !focusedDomainId || f.domain === focusedDomainId).map(f => f.field));
  const relationships = (model.relationships || []).filter(r => {
    const kindOk = kindFilter === "all" || kindFilter === r.mappingKind;
    const textOk = matchesSchemaSearch(`${r.sourceField} ${r.normalizedField} ${r.normalizedLocation} ${relationshipLabel(r, auditByRelationId.get(r.id))}`);
    const domainOk = !focusedDomainId || (r.mappingKind === "explicit_source_to_canonical_mapping" && domainFieldNames.has(r.normalizedField));
    return kindOk && textOk && domainOk;
  });
  const visibleRelationshipIds = new Set(relationships.map(r => r.id));
  const activeRelationships = relationships.filter(r => activeRelationIds.includes(r.id));
  const selectedRelation = relationships.find(r => r.id === selectedRelationId) || activeRelationships[0] || null;

  useEffect(() => {
    const filtered = activeRelationIds.filter(id => visibleRelationshipIds.has(id));
    if (filtered.length !== activeRelationIds.length) {
      setActiveRelationIds(filtered);
      if (selectedRelationId && !visibleRelationshipIds.has(selectedRelationId)) setSelectedRelationId(filtered[0] || "");
    }
  }, [globalSchemaQuery, localSchemaQuery, kindFilter, focusedDomainId, selected, relationships.map(r => r.id).join("|")]);

  const sourceFields = (model.sourceFields || []).filter(f => matchesSchemaSearch(`${f.field} ${f.definition || ""} ${f.mappingState || ""}`));
  const geometrySourceNames = new Set((model.relationships || []).filter(r => r.sourceLayer === "source_geometry").map(r => r.sourceField));
  const geometryInputFields = (model.geometryFields || []).filter(f => geometrySourceNames.has(f.field) && matchesSchemaSearch(`${f.field} ${f.definition || ""}`));
  const retainedContainerNames = new Set((model.relationships || []).filter(r=>r.mappingKind === "source_native_value_retained").map(r=>r.normalizedField));
  const normalizedFields = (model.normalizedFields || []).filter(f => !retainedContainerNames.has(f.field) && (f.populated > 0 || model.relationships.some(r=>r.normalizedField===f.field)) && matchesSchemaSearch(`${f.field} ${f.definition || ""}`));
  const geometryTargets = (model.geometryNormalizedFields || []).filter(f => matchesSchemaSearch(`${f.field} ${f.definition || ""}`));
  const canonicalFields = (model.canonicalFields || []).filter(f => (!focusedDomainId || f.domain === focusedDomainId) && matchesSchemaSearch(`${f.field} ${f.definition || ""} ${f.domain || ""}`));
  const retainedTargets = relationships.filter(r => r.mappingKind === "source_native_value_retained");
  const showUndocumented = kindFilter === "all" || kindFilter === "undocumented_derivation";

  function relationForField(field, layer) {
    return relationships.filter(r => r.sourceField === field && r.sourceLayer === layer);
  }
  function revealNode(scrollRef, nodeKey) {
    if (!nodeKey || typeof window === "undefined") return;
    const attempt = () => {
      const scroller = scrollRef.current;
      if (!scroller) return false;
      const node = [...scroller.querySelectorAll("[data-node-key]")].find(item => item.dataset.nodeKey === nodeKey);
      if (!node) return false;
      const viewport = scroller.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      const margin = 14;
      let delta = 0;
      if (box.top < viewport.top + margin) delta = box.top - viewport.top - margin;
      else if (box.bottom > viewport.bottom - margin) delta = box.bottom - viewport.bottom + margin;
      if (Math.abs(delta) > 1) scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + delta), behavior: "smooth" });
      return true;
    };
    window.requestAnimationFrame(() => { if (!attempt()) window.requestAnimationFrame(attempt); });
  }
  function revealRelationshipTarget(relation) {
    revealNode(pramanScrollRef, relationshipTargetNodeKey(relation));
  }
  function revealRelationshipSource(relation) {
    revealNode(sourceScrollRef, `${relation.sourceLayer}:${relation.sourceField}`);
  }
  function relationshipsForTarget(field, mode = centerMode) {
    if (mode === "canonical") return relationships.filter(r => r.mappingKind === "explicit_source_to_canonical_mapping" && r.normalizedField === field);
    return relationships.filter(r => r.normalizedField === field || r.normalizedLocation === field);
  }
  function focusRelations(relations, field = null) {
    if (!relations.length) {
      setActiveRelationIds([]);
      setSelectedRelationId("");
      setSelectedField(field);
      onContextChange?.({ relationId: null, field: field?.field || null, issueId: null, observationId: null });
      return;
    }
    setActiveRelationIds(relations.map(r => r.id));
    setSelectedRelationId(relations[0].id);
    setSelectedField(null);
    onContextChange?.({ relationId: relations[0].id, field: relations[0].sourceField, issueId: null, observationId: null });
    if (relations[0].mappingKind === "explicit_source_to_canonical_mapping") onPreferencesChange?.({ schemaRightMode: "canonical" });
    else onPreferencesChange?.({ schemaRightMode: "normalized" });
  }
  function selectRelation(relation) {
    setActiveRelationIds([relation.id]);
    setSelectedRelationId(relation.id);
    setSelectedField(null);
    onContextChange?.({ relationId: relation.id, field: relation.sourceField, issueId: null, observationId: null });
    if (relation.mappingKind === "explicit_source_to_canonical_mapping") onPreferencesChange?.({ schemaRightMode: "canonical" });
    else onPreferencesChange?.({ schemaRightMode: "normalized" });
    revealRelationshipSource(relation);
    revealRelationshipTarget(relation);
  }
  function inspectSourceField(field) {
    const rels = relationForField(field.field, field.layer);
    focusRelations(rels, field);
    if (rels.length) revealRelationshipTarget(rels[0]);
  }
  function inspectTargetField(field) {
    const rels = relationshipsForTarget(field.field, centerMode);
    if (rels.length) {
      focusRelations(rels, field);
      revealRelationshipSource(rels[0]);
      return;
    }
    setActiveRelationIds([]);
    setSelectedRelationId("");
    setSelectedField(field);
    onContextChange?.({ relationId: null, field: field.field, issueId: null, observationId: null });
  }
  function startResize(index, event) {
    if (!gridRef.current || typeof document === "undefined") return;
    event.preventDefault();
    const startX = event.clientX;
    const start = [...columns];
    const rect = gridRef.current.getBoundingClientRect();
    const totalWeight = start.reduce((a,b) => a+b, 0);
    const move = (e) => {
      const delta = ((e.clientX - startX) / Math.max(rect.width, 1)) * totalWeight;
      const pairTotal = start[index] + start[index + 1];
      const nextA = Math.min(pairTotal - .58, Math.max(.58, start[index] + delta));
      const next = [...start]; next[index] = nextA; next[index + 1] = pairTotal - nextA; setColumns(next);
    };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  function keyboardResize(index, event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = [...columns]; const pairTotal = next[index] + next[index + 1];
    const delta = event.key === "ArrowRight" ? .08 : -.08;
    const nextA = Math.min(pairTotal - .58, Math.max(.58, next[index] + delta));
    next[index] = nextA; next[index + 1] = pairTotal - nextA; setColumns(next);
  }

  const selectedAudit = selectedRelation ? auditByRelationId.get(selectedRelation.id) : null;
  const selectedUndocumented = selectedField?.field ? undocumentedByField.get(selectedField.field) : null;
  const selectedRelatedRelations = activeRelationships.length ? activeRelationships : (selectedRelation ? [selectedRelation] : []);
  const undocumentedVisibleCount = showUndocumented ? (mappingAudit?.undocumentedNormalizedDerivations || []).filter(e => matchesSchemaSearch(`${e.destinationField} ${e.relationshipCategory}`)).length : 0;

  useEffect(() => {
    if (detailsScrollRef.current) detailsScrollRef.current.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedRelationId, selectedField?.key]);

  return <>
    <section className="ssm-section ssm-schema-shell">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Schema Mapping</span><h2>Schema Mapping</h2><SectionExplanation>This page shows how information attributed to the selected land-record source is represented and stored by PRAMAN before parcel matching. It distinguishes source-native information from normalized PRAMAN source-state fields and shows only the retention or transformation relationships supported by the current dataset, contract, and audit. Select a field below to see where PRAMAN stores or interprets it and what rule and evidence support that relationship.</SectionExplanation><div className="ssm-selected-source"><span>Selected source</span><strong>{model.sourceName}</strong><code>{model.sourceId}</code></div>{focusedDomainId && <small>Canonical domain focus: {text(focusedDomainId)} · <button type="button" className="ssm-inline-button" onClick={()=>onContextChange?.({ domainId: null })}>Clear focus</button></small>}</div></div>
      <div className="ssm-schema-toolbar">
        <label><span>Search schema</span><input value={localSearch} onChange={e=>onPreferencesChange?.({ schemaSearch: e.target.value })} placeholder="Field or relationship" /></label>
        <label><span>Relationship filter</span><select value={kindFilter} onChange={e=>{ onPreferencesChange?.({ schemaKindFilter: e.target.value }); setActiveRelationIds([]); setSelectedRelationId(""); setSelectedField(null); }}><option value="all">All relationship states ({formatNumber(model.relationships.length + (mappingAudit?.undocumentedNormalizedDerivations?.length || 0))})</option>{relationKinds.map(kind => <option key={kind} value={kind}>{relationshipFilterLabel(kind)} ({formatNumber(model.relationships.filter(r=>r.mappingKind===kind).length)})</option>)}{(mappingAudit?.undocumentedNormalizedDerivations?.length || 0) > 0 && <option value="undocumented_derivation">Undocumented derivation ({formatNumber(mappingAudit.undocumentedNormalizedDerivations.length)})</option>}</select></label>
        <div className="ssm-schema-toolbar__facts"><span>{formatNumber(sourceFields.length)} visible source fields</span><span>{formatNumber(relationships.length)} documented relationships</span>{undocumentedVisibleCount > 0 && <span>{formatNumber(undocumentedVisibleCount)} undocumented derivations</span>}</div>
      </div>

      <div className="ssm-terminology-help" aria-label="Schema mapping terminology help"><span>Terms:</span><HelpTerm term="Normalized" /><HelpTerm term="Source-native" /><HelpTerm term="Transformation" /><HelpTerm term="Validation" /><HelpTerm term="Relationship evidence" /><HelpTerm term="Affected records" /><span className="ssm-tech-note">Field cards keep the original contract definition in the hover tooltip.</span></div>

      <div className="ssm-schema-reading-order" aria-hidden="true"><span>Source Schema</span><b>→</b><span>PRAMAN Schema</span><b>→</b><span>Relationship / Mapping Details</span></div>

      <div className="ssm-schema-grid" ref={gridRef} style={{gridTemplateColumns:`minmax(280px,${columns[0]}fr) 8px minmax(300px,${columns[1]}fr) 8px minmax(320px,${columns[2]}fr)`}}>
        <ConnectionOverlay gridRef={gridRef} relationships={activeRelationships} />
        <section className="ssm-schema-panel">
          <div className="ssm-schema-panel__head ssm-schema-panel__head--explained"><div><span>LEFT</span><h3>Source Schema</h3><p>This panel shows the fields PRAMAN can attribute to the selected source in the current pre-match dataset. Source-specific fields preserve their source-native names, while common fields are shown when they already exist in the normalized source state. Review the grouped fields below to understand what arrived from this source and what source evidence is available for normalization.</p></div></div>
          <div className="ssm-schema-scroll" ref={sourceScrollRef} data-scroll-panel="source-schema" tabIndex={0} aria-label="Scrollable Source Schema fields">
            <details open><summary>Declared source-specific fields <span>{formatNumber(sourceFields.filter(f=>f.layer==="source_native").length)}</span></summary><div className="ssm-schema-list">{sourceFields.filter(f=>f.layer==="source_native").map(f => { const rels=relationForField(f.field,f.layer); const audit=rels[0] ? auditByRelationId.get(rels[0].id) : null; return <FieldNode key={f.key} nodeKey={f.key} field={f} related={rels.length>0} selected={activeRelationships.some(r=>r.sourceField===f.field && r.sourceLayer===f.layer) || selectedField?.key===f.key} subtitle={audit ? relationshipFilterLabel(rels[0].mappingKind) : f.mappingState} description={plainFieldDescription(f)} onClick={()=>inspectSourceField(f)} />; })}</div></details>
            <details open><summary>Normalized/common fields present <span>{formatNumber(sourceFields.filter(f=>f.layer==="normalized_common").length)}</span></summary><p className="ssm-group-note">These values exist in <code>{text(model.normalizedTable)}</code>. Where raw-field derivation is undocumented, no mapping connector is drawn.</p><div className="ssm-schema-list">{sourceFields.filter(f=>f.layer==="normalized_common").map(f => { const rels=relationForField(f.field,f.layer); const undoc=undocumentedByField.get(f.field); return <FieldNode key={f.key} nodeKey={f.key} field={f} related={rels.length>0} selected={activeRelationships.some(r=>r.sourceField===f.field && r.sourceLayer===f.layer) || selectedField?.key===f.key} subtitle={rels.length ? relationshipLabel(rels[0], auditByRelationId.get(rels[0].id)) : (undoc ? "Undocumented derivation" : f.mappingState)} description={plainFieldDescription(f)} onClick={()=>inspectSourceField(f)} />; })}</div></details>
            {geometryInputFields.length > 0 && <details open><summary>Geometry transformation inputs <span>{formatNumber(geometryInputFields.length)}</span></summary><div className="ssm-schema-list">{geometryInputFields.map(f => { const rels=relationForField(f.field,"source_geometry"); return <FieldNode key={f.key} nodeKey={f.key} field={f} related={rels.length>0} selected={activeRelationships.some(r=>r.sourceField===f.field && r.sourceLayer==="source_geometry") || selectedField?.key===f.key} subtitle={rels.length ? "Geometry transformation" : "No documented relationship"} description={plainFieldDescription(f)} onClick={()=>inspectSourceField(f)} />; })}</div></details>}
          </div>
        </section>

        <div className="ssm-resizer" role="separator" tabIndex={0} aria-label="Resize source and PRAMAN schema panels" aria-orientation="vertical" onPointerDown={e=>startResize(0,e)} onKeyDown={e=>keyboardResize(0,e)} />

        <section className="ssm-schema-panel ssm-schema-panel--center">
          <div className="ssm-schema-panel__head ssm-schema-panel__head--tabs ssm-schema-panel__head--explained"><div><span>CENTER</span><h3>PRAMAN Schema</h3><p>This panel shows the normalized/source-state destinations PRAMAN uses internally so information from different systems can later be compared consistently. These fields are pre-matching representations, not automatic canonical parcel facts. The groups below show populated normalized fields, geometry outputs, retained source-native destinations, or canonical reference fields when that reference mode is selected.</p></div><div className="ssm-mini-tabs"><button className={centerMode==="normalized"?"is-active":""} onClick={()=>{onPreferencesChange?.({ schemaRightMode: "normalized" }); setActiveRelationIds([]); setSelectedRelationId(""); setSelectedField(null);}}>Normalized source state</button><button className={centerMode==="canonical"?"is-active":""} onClick={()=>{onPreferencesChange?.({ schemaRightMode: "canonical" }); setActiveRelationIds([]); setSelectedRelationId(""); setSelectedField(null);}}>Canonical reference</button></div></div>
          <div className="ssm-schema-scroll" ref={pramanScrollRef} data-scroll-panel="praman-schema" tabIndex={0} aria-label="Scrollable PRAMAN Schema fields">
            {centerMode === "normalized" ? <>
              {showUndocumented && <details open><summary>{text(model.normalizedTable)} <span>{formatNumber(normalizedFields.length)}</span></summary><p className="ssm-group-note"><code>{text(model.normalizedTable)}</code> is PRAMAN's normalized pre-matching representation used by the later parcel-matching process. The fields below are populated normalized/source-state values for this source. “Undocumented derivation” means a destination exists, but the current contract does not prove which raw source field generated it.</p><div className="ssm-schema-list">{normalizedFields.map(f => { const rels=relationshipsForTarget(f.field,"normalized"); const undoc=undocumentedByField.get(f.field); return <FieldNode key={f.key} nodeKey={f.key} field={f} related={rels.length>0} selected={activeRelationships.some(r=>r.normalizedField===f.field) || selectedField?.key===f.key} subtitle={rels.length ? relationshipLabel(rels[0],auditByRelationId.get(rels[0].id)) : (undoc ? `Undocumented derivation · ${formatNumber(undoc.affectedRecords)} populated` : f.selectedSourceState)} description={plainFieldDescription(f)} onClick={()=>inspectTargetField(f)} />; })}</div></details>}
              {kindFilter !== "undocumented_derivation" && geometryTargets.length > 0 && <details open><summary>Normalized geometry outputs <span>{formatNumber(geometryTargets.length)}</span></summary><div className="ssm-schema-list">{geometryTargets.map(f => { const rels=relationshipsForTarget(f.field,"normalized"); return <FieldNode key={f.key} nodeKey={f.key} field={f} related={rels.length>0} selected={activeRelationships.some(r=>r.normalizedField===f.field) || selectedField?.key===f.key} subtitle="Geometry transformation" description={plainFieldDescription(f)} onClick={()=>inspectTargetField(f)} />; })}</div></details>}
              {kindFilter !== "undocumented_derivation" && retainedTargets.length > 0 && <details open><summary>Retained source-native destinations <span>{formatNumber(retainedTargets.length)}</span></summary><div className="ssm-schema-list">{retainedTargets.map(r => <FieldNode key={`target:${r.id}`} nodeKey={`retained_target:${r.id}`} field={{field:r.normalizedLocation || r.normalizedField, dataType:r.targetDataType, key:`retained_target:${r.id}`}} related selected={activeRelationIds.includes(r.id)} subtitle="Source-native retained" onClick={()=>{ focusRelations([r], { field:r.normalizedLocation || r.normalizedField, key:`retained_target:${r.id}`, layer:"normalized_source", dataType:r.targetDataType }); revealRelationshipSource(r); }} />)}</div></details>}
              {!relationships.length && kindFilter !== "undocumented_derivation" && <EmptyState title="No documented relationships match the current search/filter." />}
            </> : <>
              {!model.sourceToCanonicalMappingAvailable && <EmptyState title="Source → canonical mapping unavailable">Canonical fields are reference-only. The selected source is not shown as populating a canonical field unless explicit mapping metadata exists.</EmptyState>}
              <details open><summary>{text(model.canonicalTable)} <span>{formatNumber(canonicalFields.length)}</span></summary><div className="ssm-schema-list">{canonicalFields.map(f => { const rels=relationshipsForTarget(f.field,"canonical"); return <FieldNode key={f.key} nodeKey={f.key} field={f} selected={activeRelationships.some(r=>r.normalizedField===f.field) || selectedField?.key===f.key} related={rels.length>0} subtitle={rels.length ? relationshipLabel(rels[0],auditByRelationId.get(rels[0].id)) : `Reference only · ${text(f.selectedSourceMappingState)}`} description={plainFieldDescription(f)} onClick={()=>inspectTargetField({...f, layer:"canonical_reference", mappingState:f.selectedSourceMappingState || NA})} />; })}</div></details>
            </>}
          </div>
        </section>

        <div className="ssm-resizer" role="separator" tabIndex={0} aria-label="Resize PRAMAN schema and relationship details panels" aria-orientation="vertical" onPointerDown={e=>startResize(1,e)} onKeyDown={e=>keyboardResize(1,e)} />

        <section className="ssm-schema-panel ssm-schema-panel--details">
          <div className="ssm-schema-panel__head ssm-schema-panel__head--explained"><div><span>RIGHT</span><h3>Relationship / Mapping Details</h3><p>This panel explains how the selected field is retained, transformed, derived, normalized, or left without a documented derivation. PRAMAN needs this record so reviewers can distinguish a proven mapping from a value that merely exists in the normalized state. The inspector below shows the rule, datatypes, affected records, exceptions, validation, and evidence for the current selection.</p></div></div>
          <div className="ssm-schema-scroll ssm-schema-scroll--details" ref={detailsScrollRef} data-scroll-panel="relationship-details" tabIndex={0} aria-label="Scrollable relationship mapping details"><MappingDetailsPanel relation={selectedRelation} auditEntry={selectedAudit} field={selectedField} undocumentedEntry={selectedUndocumented} relatedRelations={selectedRelatedRelations} auditByRelationId={auditByRelationId} onSelectRelation={selectRelation} onOpenQuality={onOpenQuality} mappingAvailability={mappings?.sourceToCanonicalFieldMapping} /></div>
        </section>
      </div>
    </section>

    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Identifier interpretation</span><h2>Normalized source identifiers</h2><SectionExplanation>This section shows how PRAMAN identifies observations, source records, and source-level parcel references inside the selected source before comparing them with other sources. PRAMAN needs these identifiers to preserve traceability back to the source and to keep records distinct during preprocessing. The identifier cards below show the normalized representation, how many records populate it, and a real sample. Does not establish cross-source parcel identity.</SectionExplanation></div></div>
      {identifiers?.available ? <div className="ssm-identifier-grid">{identifiers.fields.map(i => <div className="ssm-identifier" key={i.field}><strong>{i.field}</strong><span>→</span><code>{i.normalizedRepresentation}</code><small>{formatNumber(i.populated)} populated · sample: {clipValue(i.sampleValue,80)}</small></div>)}</div> : <EmptyState title="Identifier interpretation unavailable" />}
      {!identifiers?.upstreamRawMappingAvailable && <div className="ssm-callout">Upstream raw identifier-field mapping is not present in the current pre-match dataset. The identifiers shown above are fields that exist in the normalized source state only.</div>}
    </section>

    <section className="ssm-section ssm-schema-availability">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Classification</span><h2>Mapping coverage & categorical normalization</h2><SectionExplanation>This section separates what the current metadata can classify from what it cannot support without inventing a relationship. It is intended to show which fields have explicit normalization rules, which are retained as source-specific information, which categorical normalizations are documented, and where the evidence is insufficient for a mapped/unmapped claim. Because the current pre-match contract has no explicit non-geometry raw-field mapping table or selected-source → canonical mapping metadata, an honest mapping-coverage percentage and mapped/unmapped totals cannot be calculated here.</SectionExplanation></div></div>
      <div className="ssm-two-col">
        {unmapped?.available ? <div className="ssm-panel"><h3>Unmapped source fields</h3>{unmapped.fields.length ? unmapped.fields.map(field => <code className="ssm-code-row" key={field}>{field}</code>) : <p className="ssm-muted-note">No unmapped source fields under the represented explicit mappings.</p>}</div> : <EmptyState title="Mapped / unmapped classification unavailable">{unmapped?.message}</EmptyState>}
        {missingCanonical?.available ? <div className="ssm-panel"><h3>Canonical fields not mapped by selected source</h3>{missingCanonical.fields.length ? missingCanonical.fields.map(item => <div className="ssm-kv" key={item.field}><span>{item.field}</span><strong>{text(item.requiredStatus)}</strong></div>) : <p className="ssm-muted-note">All represented canonical fields are mapped by the selected source.</p>}</div> : <EmptyState title="Missing canonical fields unavailable">{missingCanonical?.message}</EmptyState>}
      </div>
      {valueDictionary?.available ? <div className="ssm-top-gap"><h3>Value Dictionary</h3><div className="ssm-table-wrap"><table className="ssm-table"><thead><tr><th>Field</th><th>Source value</th><th>Normalized value</th><th>Occurrences</th><th>Status</th></tr></thead><tbody>{valueDictionary.rows.map(row => <tr key={row.id}><td>{text(row.field)}</td><td className="ssm-mono">{displayValue(row.sourceValue)}</td><td className="ssm-mono">{displayValue(row.normalizedValue)}</td><td>{formatNumber(row.occurrenceCount)}</td><td>{text(row.status)}</td></tr>)}</tbody></table></div></div> : <p className="ssm-muted-note">Value Dictionary is omitted because no categorical normalization rule table exists in the current pre-match dataset/configuration.</p>}
    </section>
  </>;
}

function ExceptionInspector({ service, selected, issue, onClose, onOpenLineage }) {
  const dialogRef = useRef(null);
  useDialogAccessibility(dialogRef, onClose);
  if (!issue) return null;
  const comparison = service.getExceptionRecordComparison(selected, issue.issue_id);
  const normalized = comparison?.normalizedSourceRecord || null;
  const preserved = comparison?.preservedSourceNativeAttributes || null;
  const geometry = comparison?.geometry || null;
  const mappingMeta = service.getMappings(selected);
  return <div className="ssm-drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" className="ssm-drawer ssm-exception-inspector" aria-label="Exception inspector">
      <div className="ssm-drawer-head"><div><span className="ssm-kicker">Exception inspector</span><h2>{prettyLabel(issue.issue_category)}</h2><p>{issue.issue_id}</p></div><button onClick={onClose} aria-label="Close exception inspector">×</button></div>
      <div className="ssm-drawer-body">
        <section className="ssm-drawer-section"><h3>Detected evidence</h3>
          {[["Affected source",issue.source_type],["Record identifier",issue.record_identifier],["Observation",issue.observation_id],["Affected field",issue.field],["Original value",displayValue(issue.original_value)],["Schema / validation rule",issue.schema_rule],["Related mapping / transformation",issue.related_mapping_or_transformation],["Validation failure",prettyLabel(issue.issue_category)],["Review / resolution state",issue.resolution_status || NA]].map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong className={k === "Original value" ? "ssm-mono" : ""}>{text(v)}</strong></div>)}
        </section>

        <section className="ssm-drawer-section"><div className="ssm-section-head ssm-section-head--compact"><div><span className="ssm-kicker">Record comparison</span><h3>Original source record vs normalized source record</h3></div></div>
          <div className="ssm-record-compare">
            <div className="ssm-record-column"><h4>Original Source Record</h4>
              {comparison?.originalSourceRecordAvailable ? <RecordKeyValues record={comparison.originalSourceRecord} highlightField={issue.field} /> : <>
                <EmptyState title="Original source record unavailable">{comparison?.originalSourceRecordNote || NA}</EmptyState>
                {preserved && Object.keys(preserved).length > 0 && <div className="ssm-preserved"><h5>Preserved source-native attributes</h5><p>These values are present inside the normalized source state; they are not presented as the missing upstream raw record.</p><RecordKeyValues record={preserved} highlightField={issue.field} /></div>}
              </>}
            </div>
            <div className="ssm-record-column"><h4>Normalized Source Record</h4><RecordKeyValues record={normalized} highlightField={issue.field === "source_specific_details" ? "source_specific_details" : null} />
              {geometry && <details className="ssm-record-details"><summary>Associated {text(mappingMeta?.geometryTable)} row</summary><RecordKeyValues record={geometry} highlightField={issue.field} /></details>}
            </div>
          </div>
        </section>
        {onOpenLineage && <button className="ssm-button ssm-drawer-action" type="button" onClick={() => onOpenLineage({ field: issue.field, issueId: issue.issue_id, observationId: issue.observation_id })}>Trace available provenance</button>}
      </div>
    </aside>
  </div>;
}

function QualityView({ service, selected, search, context, preferences, onPreferencesChange, onContextChange, onOpenLineage }) {
  const summary = useMemo(() => service.getSourceQualitySummary(selected), [service, selected]);
  const fields = useMemo(() => service.getFieldQualityProfiles(selected), [service, selected]);
  const allExceptions = useMemo(() => service.getExceptionQueue(selected), [service, selected]);
  const categories = useMemo(() => service.getExceptionCategories(selected), [service, selected]);
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const issueSearch = preferences?.qualitySearch || "";
  const issueCategory = preferences?.qualityCategory || "all";
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [issuePage, setIssuePage] = useState(0);
  const [recordBrowser, setRecordBrowser] = useState({ loading: false, error: null, rows: [], selectedIndex: 0 });

  useEffect(() => {
    const contextField = context?.field;
    const match = contextField ? fields.find(f => f.field === contextField) : null;
    setSelectedFieldKey(match?.key || fields[0]?.key || "");
    setSelectedIssueId(context?.issueId && allExceptions.some(i => i.issue_id === context.issueId) ? context.issueId : "");
    setIssuePage(0);
  }, [selected]);

  const selectedField = fields.find(f => f.key === selectedFieldKey) || fields[0] || null;
  const globalQuery = (search || "").trim().toLowerCase();
  const localIssueQuery = issueSearch.trim().toLowerCase();
  const visibleFields = fields.filter(f => !globalQuery || `${f.field} ${f.layer} ${f.expectedDataType || ""}`.toLowerCase().includes(globalQuery));
  const visibleExceptions = useMemo(() => allExceptions.filter(i => {
    const categoryOk = issueCategory === "all" || i.issue_category === issueCategory;
    const haystack = `${i.record_identifier || ""} ${i.observation_id || ""} ${i.field || ""} ${i.issue_category || ""} ${displayValue(i.original_value)}`.toLowerCase();
    const globalOk = !globalQuery || haystack.includes(globalQuery);
    const localOk = !localIssueQuery || haystack.includes(localIssueQuery);
    return categoryOk && globalOk && localOk;
  }), [allExceptions, issueCategory, globalQuery, localIssueQuery]);
  const pageCount = Math.max(1, Math.ceil(visibleExceptions.length / EXCEPTION_PAGE_SIZE));
  const boundedPage = Math.min(issuePage, pageCount - 1);
  const pagedExceptions = visibleExceptions.slice(boundedPage * EXCEPTION_PAGE_SIZE, (boundedPage + 1) * EXCEPTION_PAGE_SIZE);
  const selectedIssue = allExceptions.find(i => i.issue_id === selectedIssueId) || null;

  useEffect(() => { setIssuePage(0); }, [issueCategory, globalQuery, localIssueQuery]);

  if (!summary) return <EmptyState title="No source selected" />;

  function selectField(field) {
    setSelectedFieldKey(field.key);
    onContextChange?.({ field: field.field, relationId: null, issueId: null, observationId: null });
  }
  function selectIssue(issue) {
    setSelectedIssueId(issue.issue_id);
    onContextChange?.({ field: issue.field, relationId: null, issueId: issue.issue_id, observationId: issue.observation_id });
  }

  return <>
    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Quality & Exceptions</span><h2>Quality & Exceptions</h2><SectionExplanation>This page checks measurable data-quality conditions in the selected source before its normalized information continues through PRAMAN. PRAMAN needs these checks to surface structural, completeness, consistency, datatype, geometry, or other validation problems only when the current dataset provides evidence for them. The sections below show source-level measurements, field-level measurements, and specific recorded exceptions; the absence of a particular issue type is not treated as a failure.</SectionExplanation></div></div>
      <div className="ssm-terminology-help" aria-label="Quality terminology help"><span>Terms:</span><HelpTerm term="Completeness" /><HelpTerm term="Duplicate values" /><HelpTerm term="Datatype validity" /><HelpTerm term="Exception" /><HelpTerm term="Validation" /></div>
    </section>

    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Quality Profile</span><h2>Measured source quality</h2><SectionExplanation>This section gives a source-level summary of measurable data-quality conditions found in the selected dataset. Every value below is calculated or recorded from the current source and its validation contract. PRAMAN does not combine these measurements into an arbitrary overall quality score.</SectionExplanation></div><p>No aggregate quality score is calculated.</p></div>
      <div className="ssm-metrics-grid">
        <Metric label="Source records" value={formatNumber(summary.recordCount)} note="Records represented for the selected source in the normalized pre-matching state" />
        <Metric label="Completeness" value={percentValue(summary.completenessRatio)} note={`${formatNumber(summary.populatedValues)} populated / ${formatNumber(summary.totalValuesEvaluated)} evaluated values`} />
        <Metric label="Null / empty values" value={formatNumber(summary.nullOrEmptyValues)} note="Across normalized + declared source-native fields" />
        <Metric label="Unique source record IDs" value={formatNumber(summary.uniqueSourceRecords)} note={`${formatNumber(summary.duplicateSourceRecordIds)} duplicate source-record IDs · ${formatNumber(summary.duplicateObservationIds)} duplicate observation IDs`} />
        <Metric label="Duplicate value occurrences" value={formatNumber(summary.duplicateValueOccurrences)} note="Repeated values beyond the first occurrence; not duplicate records" />
        <Metric label="Datatype violations" value={formatNumber(summary.datatypeViolations)} note="Only rules explicitly defined in DATA_DICTIONARY" />
        <Metric label="Validation exceptions" value={formatNumber(summary.validationFailures)} note="Actual exception rows generated by dataset-backed validation" />
        {summary.transformationFailuresAvailable && <Metric label="Transformation failures" value={formatNumber(summary.transformationFailures)} note="Recorded geometry transformation relationships only" />}
      </div>
      <div className="ssm-quality-limit-row">
        <span>Mapping coverage: <strong>{typeof summary.mappingCoverage === "number" ? percentValue(summary.mappingCoverage) : text(summary.mappingCoverage)}</strong></span>
        {summary.hasGeometry && <span>Geometry validity: <strong>{summary.geometryValidityAvailable ? text(summary.geometryValidity) : NA}</strong></span>}
      </div>
      {entries(summary.geometryQualityFlags).length > 0 && <div className="ssm-panel ssm-top-gap"><h3>Geometry quality flags</h3><p className="ssm-muted-note">Flags are shown as recorded metadata; they are not automatically counted as geometry-validity failures.</p>{entries(summary.geometryQualityFlags).map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{formatNumber(v)}</strong></div>)}</div>}
    </section>

    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Field-Level Quality</span><h2>Actual selected-source fields</h2><SectionExplanation>This section checks individual fields so the user can see where measurable missing values, repeated values, datatype problems, parsing problems, transformation failures, or other supported conditions occur. Only checks represented by the current data and validation metadata are shown; unavailable checks remain unavailable rather than being inferred.</SectionExplanation></div><p>Select a field for its measured profile.</p></div>
      <div className="ssm-quality-layout">
        <div className="ssm-table-wrap"><table className="ssm-table ssm-table--quality"><thead><tr><th>Field</th><th>Layer</th><th>Populated</th><th>Missing</th><th>Unique</th><th>Repeated values</th><th>Datatype violations</th></tr></thead><tbody>{visibleFields.map(f => <tr key={f.key} role="button" tabIndex={0} aria-label={`Inspect field ${f.field}`} className={selectedField?.key === f.key ? "is-selected" : ""} onClick={() => selectField(f)} onKeyDown={e => keyboardActivate(e, () => selectField(f))}><td><strong>{f.field}</strong></td><td>{prettyLabel(f.layer)}</td><td>{formatNumber(f.populated)}</td><td>{formatNumber(f.missingValues)}</td><td>{formatNumber(f.unique_populated)}</td><td>{formatNumber(f.duplicateValueOccurrences)}</td><td>{f.datatypeViolations === null ? NA : formatNumber(f.datatypeViolations)}</td></tr>)}</tbody></table></div>
        {selectedField && <aside className="ssm-field-quality-inspector"><span className="ssm-kicker">Selected field</span><h3>{selectedField.field}</h3>
          {[["Layer",prettyLabel(selectedField.layer)],["Expected datatype",selectedField.expectedDataType],["Total records evaluated",formatNumber(selectedField.totalRecordsEvaluated)],["Populated values",formatNumber(selectedField.populated)],["Missing values",formatNumber(selectedField.missingValues)],["Unique values",formatNumber(selectedField.unique_populated)],["Duplicate value occurrences",formatNumber(selectedField.duplicateValueOccurrences)],["Datatype violations",selectedField.datatypeViolations === null ? NA : formatNumber(selectedField.datatypeViolations)],["Parsing failures",selectedField.parsingFailures === null ? NA : formatNumber(selectedField.parsingFailures)],["Unrecognized categorical values",selectedField.unrecognizedCategoricalValues === null ? NA : formatNumber(selectedField.unrecognizedCategoricalValues)],["Mapping failures",selectedField.mappingFailures === null ? NA : formatNumber(selectedField.mappingFailures)],["Transformation failures",selectedField.transformationFailures === null ? NA : formatNumber(selectedField.transformationFailures)]].map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{v}</strong></div>)}
          <div className="ssm-sample-block"><span>Real sample value</span><code title={text(selectedField.sample_value)}>{clipValue(selectedField.sample_value)}</code></div>
        </aside>}
      </div>
    </section>

    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Exceptions</span><h2>Detected validation exceptions</h2><SectionExplanation>Exceptions are specific records or conditions that failed a defined validation or quality rule. PRAMAN needs them so a reviewer can inspect the exact evidence behind a measurable problem instead of relying only on summary counts. The table below contains only exceptions recorded from the current dataset; no example exceptions are fabricated.</SectionExplanation></div><p>{formatNumber(visibleExceptions.length)} visible / {formatNumber(allExceptions.length)} detected</p></div>
      {allExceptions.length === 0 ? <EmptyState title="No exceptions detected for the current selection." /> : <>
        <div className="ssm-exception-toolbar"><label><span>Search exceptions</span><input value={issueSearch} onChange={e=>onPreferencesChange?.({ qualitySearch: e.target.value })} placeholder="Record, field, category or value" /></label><label><span>Issue category</span><select value={issueCategory} onChange={e=>onPreferencesChange?.({ qualityCategory: e.target.value })}><option value="all">All categories ({formatNumber(allExceptions.length)})</option>{categories.map(c => <option key={c.category} value={c.category}>{prettyLabel(c.category)} ({formatNumber(c.count)})</option>)}</select></label></div>
        {visibleExceptions.length === 0 ? <EmptyState title="No exceptions detected for the current selection." /> : <div className="ssm-table-wrap"><table className="ssm-table"><thead><tr><th>Source</th><th>Record</th><th>Field</th><th>Original value</th><th>Issue category</th><th>Mapping / transformation</th><th>Status</th></tr></thead><tbody>{pagedExceptions.map(issue => <tr key={issue.issue_id} role="button" tabIndex={0} aria-label={`Inspect exception ${issue.issue_id}`} className={selectedIssueId === issue.issue_id ? "is-selected" : ""} onClick={()=>selectIssue(issue)} onKeyDown={e => keyboardActivate(e, () => selectIssue(issue))}><td>{issue.source_type}</td><td><strong>{text(issue.record_identifier)}</strong><small>{text(issue.observation_id)}</small></td><td>{issue.field}</td><td className="ssm-mono">{clipValue(displayValue(issue.original_value),90)}</td><td><Badge tone="warn">{prettyLabel(issue.issue_category)}</Badge></td><td>{text(issue.related_mapping_or_transformation)}</td><td>{text(issue.resolution_status)}</td></tr>)}</tbody></table></div>}
        {visibleExceptions.length > EXCEPTION_PAGE_SIZE && <div className="ssm-pagination" aria-label="Exception pagination">
          <button type="button" disabled={boundedPage === 0} onClick={()=>setIssuePage(p => Math.max(0, p - 1))}>Previous</button>
          <span>Page {formatNumber(boundedPage + 1)} of {formatNumber(pageCount)} · {formatNumber(pagedExceptions.length)} rows shown</span>
          <button type="button" disabled={boundedPage >= pageCount - 1} onClick={()=>setIssuePage(p => Math.min(pageCount - 1, p + 1))}>Next</button>
        </div>}
      </>}
    </section>
    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Record inspection</span><h2>Browse normalized source records</h2><SectionExplanation>This section lets the reviewer inspect the actual normalized source-state record behind the selected source when the host application exposes those rows. It helps connect quality findings to real stored values. A raw upstream source record is shown only when that record is genuinely available; PRAMAN does not reconstruct one from normalized data.</SectionExplanation></div><p>Uses the host PRAMAN table loader when available; raw upstream records are never fabricated.</p></div>
      {!service.canLoadSourceRecords?.() ? <EmptyState title="General record browser unavailable">The current module instance was not given a live PRAMAN table loader. Exception-backed snapshots above remain available where present.</EmptyState> : <>
        <button className="ssm-button" type="button" disabled={recordBrowser.loading} onClick={async()=>{ setRecordBrowser(v=>({...v,loading:true,error:null})); try { const rows=await service.getSourceRecords(selected); setRecordBrowser({loading:false,error:null,rows,selectedIndex:0}); } catch(error) { setRecordBrowser({loading:false,error:String(error?.message||error),rows:[],selectedIndex:0}); } }}>{recordBrowser.loading ? "Loading records…" : recordBrowser.rows.length ? "Reload records" : "Load records"}</button>
        {recordBrowser.error && <div className="ssm-callout">{recordBrowser.error}</div>}
        {recordBrowser.rows.length > 0 && <div className="ssm-record-browser ssm-top-gap"><label><span>Record</span><select value={recordBrowser.selectedIndex} onChange={e=>setRecordBrowser(v=>({...v,selectedIndex:Number(e.target.value)}))}>{recordBrowser.rows.map((row,i)=><option key={i} value={i}>{text(row.observation_id || row.source_record_id || row.id || `Record ${i+1}`)}</option>)}</select></label><div className="ssm-two-col"><div className="ssm-panel"><h3>Original source record</h3><EmptyState title="Raw upstream source record unavailable">Only use a raw record here when the host loader/configuration explicitly exposes it.</EmptyState></div><div className="ssm-panel"><h3>Normalized Source Record</h3><RecordKeyValues record={recordBrowser.rows[recordBrowser.selectedIndex]} /></div></div></div>}
      </>}
    </section>

    {selectedIssue && <ExceptionInspector service={service} selected={selected} issue={selectedIssue} onClose={()=>setSelectedIssueId("")} onOpenLineage={onOpenLineage} />}
  </>;
}

function ProvenanceChain({ provenance }) {
  if (!provenance) return <EmptyState title="No provenance subject selected" />;
  return <div className="ssm-provenance-chain">{provenance.stages.map((stage, i) => <React.Fragment key={`${stage.label}:${i}`}><div className="ssm-provenance-stage"><span>{stage.label}</span><strong title={displayValue(stage.value)}>{clipValue(displayValue(stage.value),190)}</strong></div>{i < provenance.stages.length - 1 && <div className="ssm-provenance-arrow">↓</div>}</React.Fragment>)}</div>;
}

function LineageView({ service, selected, search, context, onContextChange, onOpenHistory }) {
  const subjects = useMemo(() => service.getProvenanceSubjects(selected), [service, selected]);
  const [subjectKey, setSubjectKey] = useState("");
  useEffect(() => {
    const byRelation = context?.relationId ? subjects.find(s => s.relationId === context.relationId) : null;
    const byField = context?.field ? subjects.find(s => s.sourceField === context.field || s.field === context.field) : null;
    setSubjectKey((byRelation || byField || subjects[0])?.key || "");
  }, [selected]);
  const query = (search || "").trim().toLowerCase();
  const visible = subjects.filter(s => !query || `${s.label} ${s.sourceField || ""} ${s.field || ""}`.toLowerCase().includes(query));
  const subject = subjects.find(s => s.key === subjectKey) || visible[0] || subjects[0] || null;
  const provenance = subject ? service.getAttributeProvenance(selected, subject.key, { observationId: context?.observationId || null, issueId: context?.issueId || null }) : null;
  const impact = subject?.relationId ? service.getMappingImpact(selected, subject.relationId) : null;

  function selectSubject(next) {
    setSubjectKey(next.key);
    onContextChange?.({ relationId: next.relationId, field: next.sourceField || next.field, issueId: context?.issueId || null, observationId: context?.observationId || null, provenanceKey: next.key });
  }

  return <>
    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Lineage & Impact</span><h2>Lineage & Impact</h2><SectionExplanation>This page shows where normalized information came from and which later PRAMAN processes are explicitly known to depend on it. Here, lineage means data traceability, not parcel ownership history or parcel-change history. The sections below show the strongest provenance chain supported by the current pre-match data and only those dependencies that are actually encoded.</SectionExplanation></div></div>
      <div className="ssm-terminology-help" aria-label="Lineage and impact terminology help"><span>Terms:</span><HelpTerm term="Lineage" /><HelpTerm term="Provenance" /><HelpTerm term="Impact" /><HelpTerm term="Transformation" /></div>
    </section>

    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Lineage</span><h2>Attribute provenance</h2><SectionExplanation>Lineage answers “Where did this value come from?” When the evidence supports it, the chain below traces the selected item from its source through the recorded source field, retention or transformation step, and normalized PRAMAN field. If a raw field or transformation step is not documented, the chain stops and states that limitation instead of inventing the missing step.</SectionExplanation></div><p>Strongest chain that can be proven from current pre-match data.</p></div>
      <div className="ssm-lineage-layout">
        <div className="ssm-lineage-subjects">{visible.length ? visible.map(item => <button type="button" key={item.key} className={subject?.key === item.key ? "is-selected" : ""} onClick={()=>selectSubject(item)}><strong>{item.label}</strong><span>{prettyLabel(item.kind)} · {item.availability}</span></button>) : <EmptyState title="No lineage items match the current search." />}</div>
        <div className="ssm-lineage-detail">
          {provenance ? <><div className="ssm-lineage-status"><Badge tone={provenance.completeness.startsWith("complete") ? "ok" : "warn"}>{prettyLabel(provenance.completeness)}</Badge></div><ProvenanceChain provenance={provenance} />{provenance.limitation && <div className="ssm-callout">{provenance.limitation}</div>}</> : <EmptyState title="Provenance unavailable" />}
        </div>
      </div>
    </section>

    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Impact</span><h2>What depends on this mapping?</h2><SectionExplanation>Impact answers “What parts of PRAMAN rely on this field or transformation?” The panels below show only dependencies that can be traced from the current mapping, validation rules, transformation metadata, or configuration. PRAMAN does not assume that every field affects matching, conflict resolution, reconciliation, or every later dashboard.</SectionExplanation></div><p>No matching/reconciliation impact is inferred.</p></div>
      {!impact ? <EmptyState title="Mapping impact unavailable">The selected normalized field has no explicit mapping relationship in the current pre-match configuration.</EmptyState> : <div className="ssm-two-col">
        <div className="ssm-panel"><h3>Calculated impact</h3>{[["Current source records using mapping",formatNumber(impact.affectedRecords)],["Normalized attributes affected",impact.normalizedFieldsAffected.join(", ") || NA],["Dependent transformations",impact.transformations.join(" · ") || "None recorded"],["Downstream matching/reconciliation",impact.downstreamPipelineDependencies]].map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{text(v)}</strong></div>)}</div>
        <div className="ssm-panel"><h3>Traceable dependencies</h3><h4>Validation rules</h4>{impact.validationDependencies.length ? impact.validationDependencies.map(v => <code className="ssm-code-row" key={v}>{v}</code>) : <p className="ssm-muted-note">No validation-rule dependency is encoded for this relationship.</p>}<h4>Configuration</h4>{impact.configurationDependencies.map(v => <code className="ssm-code-row" key={v}>{v}</code>)}</div>
      </div>}
      <div className="ssm-callout">{impact?.downstreamNote || "Matching, conflict resolution, reconciliation and authoritative-state dependencies are outside this module."}</div>
      {onOpenHistory && <button className="ssm-button ssm-top-gap" type="button" onClick={()=>onOpenHistory({ relationId: subject?.relationId || null, field: subject?.sourceField || subject?.field || null, provenanceKey: subject?.key || null })}>Open History & Configuration</button>}
    </section>
  </>;
}

function HistoryRecord({ record, fallbackTitle }) {
  if (!record || typeof record !== "object") return null;
  const title = record.event_type || record.action || record.type || record.version || record.version_id || fallbackTitle || NA;
  const timestamp = record.timestamp || record.date || record.created_at || record.updated_at || null;
  const details = Object.fromEntries(Object.entries(record).filter(([key]) => !["event_type","action","type","timestamp","date","created_at","updated_at"].includes(key)));
  return <div className="ssm-history-record"><div className="ssm-history-record__head"><strong>{text(title)}</strong>{timestamp && <span>{text(timestamp)}</span>}</div>{Object.keys(details).length > 0 && <RecordKeyValues record={details} />}</div>;
}

function HistoryView({ service, selected, search, context, onExport }) {
  const source = useMemo(() => service.getSource(selected), [service, selected]);
  const history = useMemo(() => service.getSourceSchemaHistory(selected), [service, selected]);
  const config = useMemo(() => service.getCurrentMappingConfiguration(selected), [service, selected]);
  const transforms = useMemo(() => service.getTransformationRules(selected), [service, selected]);
  const identifiers = useMemo(() => service.getIdentifierInterpretation(selected), [service, selected]);
  const valueDictionary = useMemo(() => service.getValueDictionary(selected), [service, selected]);
  const availableVersions = useMemo(() => service.getAvailableVersions(selected), [service, selected]);
  const versionComparison = useMemo(() => service.getVersionComparison?.(selected), [service, selected]);
  const historyQuery = (search || "").trim().toLowerCase();
  const matchesHistory = (record) => !historyQuery || JSON.stringify(record || {}).toLowerCase().includes(historyQuery);
  if (!source) return <EmptyState title="No source selected" />;
  return <>
    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">History & Configuration</span><h2>History & Configuration</h2><SectionExplanation>This page records how the selected source is interpreted by PRAMAN: the current mapping configuration, schema rules, transformations, identifier and validation settings, and any real recorded versions or configuration changes. PRAMAN needs this information so source interpretation can be reviewed and reproduced. This is not parcel ownership or parcel-change history; that belongs in the Parcel History & Lineage dashboard.</SectionExplanation></div></div>
      <div className="ssm-terminology-help" aria-label="History and configuration terminology help"><span>Terms:</span><HelpTerm term="Configuration" /><HelpTerm term="Schema version" /><HelpTerm term="Transformation" /><HelpTerm term="Validation rule" /></div>
    </section>

    <section className="ssm-section"><div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">History</span><h2>Source/schema history</h2><SectionExplanation>This section answers whether PRAMAN has a recorded history of changes to this source's schema or mapping configuration. When history exists, the records below show the stored event or version details and timestamps that are actually present. When it does not exist, PRAMAN states that plainly rather than fabricating versions, dates, operators, or edits.</SectionExplanation></div></div>
      {!history?.available ? <EmptyState title="No source/schema history is available in the current dataset.">{history?.note}</EmptyState> : history.events?.filter(matchesHistory).length ? <div className="ssm-timeline">{history.events.filter(matchesHistory).map((event,i)=><HistoryRecord key={event.id || event.event_id || i} record={event} fallbackTitle={`History event ${i + 1}`} />)}</div> : <EmptyState title={historyQuery ? "No history events match the current search." : "No history events exist for the selected source."}>{history?.note}</EmptyState>}
    </section>

    <section className="ssm-section"><div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Schema versions</span><h2>Version comparison</h2><SectionExplanation>This section compares recorded schema or mapping versions only when version records exist in the current dataset. It is used to see what changed between documented definitions; if fewer than two real versions are available, PRAMAN does not manufacture a comparison.</SectionExplanation></div></div>
      {!history?.schemaVersions?.length && !history?.mappingVersions?.length && !availableVersions?.versions?.length ? <EmptyState title="Schema version comparison unavailable">No source schema or mapping versions are present in the current pre-match dataset.</EmptyState> : <div className="ssm-two-col">
        <div className="ssm-panel"><h3>Schema versions</h3>{(history.schemaVersions?.length ? history.schemaVersions : availableVersions?.versions || []).filter(matchesHistory).length ? (history.schemaVersions?.length ? history.schemaVersions : availableVersions?.versions || []).filter(matchesHistory).map((version,i)=><HistoryRecord key={version.id || version.version_id || i} record={version} fallbackTitle={`Schema version ${i + 1}`} />) : <EmptyState title="No schema versions match the current search" />}</div>
        <div className="ssm-panel"><h3>Mapping versions</h3>{history.mappingVersions?.filter(matchesHistory).length ? history.mappingVersions.filter(matchesHistory).map((version,i)=><HistoryRecord key={version.id || version.version_id || i} record={version} fallbackTitle={`Mapping version ${i + 1}`} />) : <EmptyState title="No mapping versions available" />}</div>
      </div>}
    </section>

    {versionComparison?.available && <section className="ssm-section"><div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Version diff</span><h2>Latest schema changes</h2><SectionExplanation>This comparison lists field additions, removals, and datatype changes that can be calculated from the two recorded schema versions shown here. It does not infer why a change happened unless the stored history says so.</SectionExplanation></div><p>{text(versionComparison.leftId)} → {text(versionComparison.rightId)}</p></div><div className="ssm-three-col"><div className="ssm-panel"><h3>Added fields</h3>{versionComparison.addedFields?.length ? versionComparison.addedFields.map(v=><code className="ssm-code-row" key={v}>{v}</code>) : <p className="ssm-muted-note">None detected.</p>}</div><div className="ssm-panel"><h3>Removed fields</h3>{versionComparison.removedFields?.length ? versionComparison.removedFields.map(v=><code className="ssm-code-row" key={v}>{v}</code>) : <p className="ssm-muted-note">None detected.</p>}</div><div className="ssm-panel"><h3>Datatype changes</h3>{versionComparison.datatypeChanges?.length ? versionComparison.datatypeChanges.map(v=><div className="ssm-kv" key={v.field}><span>{v.field}</span><strong>{text(v.from)} → {text(v.to)}</strong></div>) : <p className="ssm-muted-note">None detected.</p>}</div></div></section>}

    <section className="ssm-section">
      <div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Configuration</span><h2>Current mapping configuration</h2><SectionExplanation>This section shows the current rules that control how PRAMAN represents the selected source before parcel matching. Active relationships define documented source-to-destination storage, transformation rules describe recorded conversions, identifier normalization preserves source traceability, and validation configuration defines the schema checks that are actually present. A categorical dictionary appears only when a real value-normalization dictionary is represented.</SectionExplanation></div><button className="ssm-button" type="button" onClick={onExport}>Export Mapping</button></div>
      <div className="ssm-callout">Configuration scope: <strong>{prettyLabel(config?.scope || NA)}</strong> · normalized output: <strong>{text(config?.normalizedOutputTable)}</strong>. These are pre-matching source-state settings, not parcel-history records.</div>
      <div className="ssm-two-col ssm-top-gap">
        <div className="ssm-panel"><h3>Active relationships</h3><p className="ssm-muted-note">Controls which documented source fields are retained or transformed into the PRAMAN source-state destinations shown by this module.</p>{config?.relationships?.filter(r=>matchesHistory(r)).length ? config.relationships.filter(r=>matchesHistory(r)).map(r => <div className={`ssm-config-relation ${context?.relationId===r.id ? "is-selected" : ""}`} key={r.id}><strong>{r.sourceField} → {r.normalizedLocation || r.normalizedField}</strong><span>{prettyLabel(r.mappingKind)}</span><small>{formatNumber(r.affectedRecords)} affected records</small></div>) : <EmptyState title="No mapping relationships available" />}</div>
        <div className="ssm-panel"><h3>Transformation rules</h3><p className="ssm-muted-note">Controls documented representation changes, such as geometry/CRS normalization. Non-geometry rules appear only when the contract actually records them.</p>{entries(transforms?.geometry?.methods).length ? <><h4>Geometry</h4>{entries(transforms.geometry.methods).filter(([k,v])=>matchesHistory({k,v})).map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{formatNumber(v)} records</strong></div>)}</> : null}{Array.isArray(transforms?.nonGeometry) && transforms.nonGeometry.length ? <><h4>Non-geometry</h4>{transforms.nonGeometry.filter(matchesHistory).map((rule,i)=><HistoryRecord key={rule.id || rule.rule_id || i} record={rule} fallbackTitle={`Transformation ${i+1}`} />)}</> : null}{!entries(transforms?.geometry?.methods).length && !(Array.isArray(transforms?.nonGeometry) && transforms.nonGeometry.length) && <EmptyState title="No transformation rules available" />}</div>
      </div>
      <div className="ssm-two-col ssm-top-gap">
        <div className="ssm-panel"><h3>Identifier normalization</h3><p className="ssm-muted-note">Controls how source and observation identifiers are represented so normalized records remain traceable to the selected source. These identifiers do not prove cross-source parcel identity.</p>{identifiers?.available ? identifiers.fields.map(i => <div className="ssm-kv" key={i.field}><span>{i.field}</span><strong className="ssm-mono">{i.normalizedRepresentation}</strong></div>) : <EmptyState title="Not available" />}</div>
        <div className="ssm-panel"><h3>Validation configuration</h3><p className="ssm-muted-note">Controls which source-specific keys are declared, which are required, and which may legitimately be null for historical records. Datatype checks are applied only where the data dictionary defines them.</p>{[["Declared source-specific keys",config?.validationConfiguration?.sourceSpecificKeys?.join(", ") || NA],["Required keys",config?.validationConfiguration?.requiredKeys?.join(", ") || NA],["Historical-nullable keys",config?.validationConfiguration?.historicalNullableKeys?.join(", ") || NA]].map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
      </div>
      {valueDictionary?.available ? <div className="ssm-panel ssm-top-gap"><h3>Categorical dictionary</h3><p className="ssm-muted-note">Controls documented source-value → normalized-value conversions for categorical fields. Rows are shown only when a real dictionary exists in the current configuration.</p><div className="ssm-table-wrap"><table className="ssm-table"><thead><tr><th>Field</th><th>Source</th><th>Normalized</th><th>Occurrences</th><th>Status</th></tr></thead><tbody>{valueDictionary.rows.filter(matchesHistory).map(row=><tr key={row.id}><td>{text(row.field)}</td><td>{displayValue(row.sourceValue)}</td><td>{displayValue(row.normalizedValue)}</td><td>{formatNumber(row.occurrenceCount)}</td><td>{text(row.status)}</td></tr>)}</tbody></table></div></div> : <div className="ssm-callout">Categorical dictionary: {valueDictionary?.message || NA}</div>}
      <div className="ssm-callout">Source → canonical mapping: <strong>{Array.isArray(config?.sourceToCanonicalMapping) ? `${formatNumber(config.sourceToCanonicalMapping.length)} explicit mapping${config.sourceToCanonicalMapping.length === 1 ? "" : "s"}` : NA}</strong>. This configuration reproduces only mappings and transformations represented by the current pre-match Source & Schema Mapping contract.</div>
    </section>

    <section className="ssm-section"><div className="ssm-section-head ssm-section-head--explanatory"><div><span className="ssm-kicker">Templates & audit</span><h2>Reusable mapping templates / reviewer events</h2><SectionExplanation>This section is reserved for reusable mapping templates or reviewer/audit events that are actually recorded for the selected source. If the current dataset contains none, the empty state below is the truthful result rather than a generated audit trail.</SectionExplanation></div></div>
      {!history?.templates?.filter(matchesHistory).length ? <EmptyState title={historyQuery ? "No mapping templates match the current search." : "No mapping templates or reviewer audit events are available."} /> : <div className="ssm-history-records">{history.templates.filter(matchesHistory).map((template,i)=><HistoryRecord key={template.id || template.template_id || i} record={template} fallbackTitle={`Template ${i + 1}`} />)}</div>}
    </section>
  </>;
}

function SourceDrawer({ service, sourceId, onClose }) {
  const dialogRef = useRef(null);
  useDialogAccessibility(dialogRef, onClose);
  const source = service.getSource(sourceId);
  const fields = service.getSourceFieldProfiles(sourceId);
  const spatial = service.getSpatialMetadata(sourceId);
  const qualitySummary = service.getSourceQualitySummary(sourceId);
  if (!source) return null;
  const metadata = source.metadata || {};
  const isSpatial = Number(spatial?.geometry_record_count) > 0;
  return <div className="ssm-drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" className="ssm-drawer" aria-label="Source details">
      <div className="ssm-drawer-head"><div><span className="ssm-kicker">Source inspector</span><h2>{text(service.getSourceOverview(sourceId)?.sourceName)}</h2><p>{source.source_id}</p></div><button onClick={onClose} aria-label="Close source drawer">×</button></div>
      <div className="ssm-drawer-body">
        <div className="ssm-drawer-section"><h3>Source metadata</h3>
          {[["Source name",service.getSourceOverview(sourceId)?.sourceName],["Format",service.getSourceOverview(sourceId)?.format],["Adapter",service.getSourceOverview(sourceId)?.adapter],["Source identifier",source.source_id],["Record count",formatNumber(source.normalized_source_state?.record_count)],["Acquisition date",metadata.acquisition_date],["Temporal currency",metadata.temporal_currency],["Update frequency",metadata.update_frequency]].map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{text(v)}</strong></div>)}
          <div className="ssm-kv"><span>Version history</span><strong>{service.getAvailableVersions(sourceId)?.available ? "Available" : "Not available"}</strong></div>
        </div>
        <div className="ssm-drawer-section"><h3>Schema</h3>
          <div className="ssm-field-cards">{fields.map(f => <div className="ssm-field-card" key={`${f.layer}:${f.field}`}><div><strong>{f.field}</strong><Badge>{f.layer === "source_native" ? "Source-native" : "Normalized"}</Badge></div><dl><dt>Datatype</dt><dd>{text(f.dataType)}</dd><dt>Populated</dt><dd>{formatNumber(f.populated)}</dd><dt>Null</dt><dd>{formatNumber(f.null_or_empty)}</dd><dt>Unique</dt><dd>{formatNumber(f.unique_populated)}</dd><dt>Sample</dt><dd className="ssm-mono">{text(f.sample_value)}</dd><dt>Semantic role</dt><dd>{text(f.semanticRole)}</dd></dl></div>)}</div>
        </div>
        {isSpatial && <div className="ssm-drawer-section"><h3>Spatial</h3>
          <div className="ssm-kv"><span>Original CRS</span><strong>{entries(spatial.original_crs_frequencies).map(([k])=>k).join(", ") || NA}</strong></div>
          <div className="ssm-kv"><span>Normalized CRS</span><strong>{entries(spatial.normalized_crs_frequencies).map(([k])=>k).join(", ") || NA}</strong></div>
          <div className="ssm-kv"><span>Geometry type</span><strong>{entries(spatial.normalized_geometry_type_frequencies).map(([k])=>k).join(", ") || NA}</strong></div>
          <div className="ssm-kv"><span>Feature count</span><strong>{formatNumber(spatial.geometry_record_count)}</strong></div>
          <div className="ssm-kv"><span>Bounds</span><strong className="ssm-mono">{spatial.normalized_bounds ? `${spatial.normalized_bounds.min_x}, ${spatial.normalized_bounds.min_y} → ${spatial.normalized_bounds.max_x}, ${spatial.normalized_bounds.max_y}` : NA}</strong></div>
          <div className="ssm-kv"><span>Validity information</span><strong>{qualitySummary?.geometryValidityAvailable ? text(qualitySummary.geometryValidity) : NA}</strong></div>
          {entries(spatial.geometry_quality_flags).map(([k,v]) => <div className="ssm-kv" key={k}><span>{k}</span><strong>{formatNumber(v)}</strong></div>)}
        </div>}
      </div>
    </aside>
  </div>;
}

export function SourceSchemaMappingWorkspace({ service, syncSelectionToUrl = true }) {
  const rawSources = useMemo(() => service.getSources(), [service]);
  const validViews = new Set(VIEWS.map(([id]) => id));
  const initialView = urlInitial("ssm_view", "overview");
  const firstId = rawSources[0]?.sourceId || "";
  const initialSource = urlInitial("ssm_source", firstId);
  const [view, setView] = useState(validViews.has(initialView) ? initialView : "overview");
  const [selected, setSelected] = useState(rawSources.some(s => s.sourceId === initialSource) ? initialSource : firstId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [drawer, setDrawer] = useState(false);
  const [workflowContext, setWorkflowContext] = useState({ relationId: null, field: null, issueId: null, observationId: null, provenanceKey: null, domainId: null });
  const [viewPreferences, setViewPreferences] = useState({
    schemaSearch: "",
    schemaKindFilter: "all",
    schemaRightMode: "normalized",
    qualitySearch: "",
    qualityCategory: "all",
  });

  useEffect(() => { if (syncSelectionToUrl) syncUrl(selected, view); }, [selected, view, syncSelectionToUrl]);
  useEffect(() => {
    if (!rawSources.some((source) => source.sourceId === selected)) {
      setSelected(rawSources[0]?.sourceId || "");
      setDrawer(false);
      setWorkflowContext({ relationId: null, field: null, issueId: null, observationId: null, provenanceKey: null, domainId: null });
    }
  }, [rawSources, selected]);

  const sources = useMemo(() => rawSources.filter(s => {
    const o = service.getSourceOverview(s.sourceId);
    const fieldNames = service.getSourceFieldProfiles(s.sourceId).map(f=>f.field).join(" ");
    const geometryNames = service.getSourceGeometryFieldProfiles(s.sourceId).map(f=>f.field).join(" ");
    const mappingNames = (service.getMappings(s.sourceId)?.relationships || []).map(r=>`${r.sourceField} ${r.normalizedField} ${r.mappingKind}`).join(" ");
    const issueNames = service.getExceptionCategories(s.sourceId).map(c=>c.category).join(" ");
    const hay = `${o?.sourceName || ""} ${o?.sourceType || ""} ${o?.sourceId || ""} ${fieldNames} ${geometryNames} ${mappingNames} ${issueNames}`.toLowerCase();
    const matchesSearch = !search.trim() || hay.includes(search.trim().toLowerCase());
    const spatial = Number(service.getSpatialMetadata(s.sourceId)?.geometry_record_count) > 0;
    const issue = Number(o?.issueOccurrences) > 0;
    const matchesFilter = filter === "all" || (filter === "spatial" && spatial) || (filter === "nonspatial" && !spatial) || (filter === "issues" && issue);
    return matchesSearch && matchesFilter;
  }), [rawSources, search, filter, service]);

  function changeSource(id, openDrawer = false) {
    setSelected(id);
    setWorkflowContext({ relationId: null, field: null, issueId: null, observationId: null, provenanceKey: null, domainId: null });
    setViewPreferences({ schemaSearch: "", schemaKindFilter: "all", schemaRightMode: "normalized", qualitySearch: "", qualityCategory: "all" });
    if (openDrawer) setDrawer(true);
  }
  function selectSource(id) { changeSource(id, true); }
  function updateWorkflowContext(next) {
    setWorkflowContext(prev => ({ ...prev, ...next }));
  }
  function updateViewPreferences(next) {
    setViewPreferences(prev => ({ ...prev, ...next }));
  }
  function exportMapping() {
    const payload = service.getExportableMappingConfiguration ? service.getExportableMappingConfiguration(selected) : service.getMappings(selected);
    if (!payload || typeof document === "undefined") return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${selected}-source-schema-mapping.json`; a.click(); URL.revokeObjectURL(a.href);
  }

  return <div className="ssm-workspace">
    <header className="ssm-header">
      <div><span className="ssm-eyebrow">PRAMAN</span><h1>Source & Schema Mapping</h1><p>Dataset-backed ingestion, validation, mapping and normalized source-state inspection.</p></div>
      <div className="ssm-controls">
        <label><span>Source</span><select value={selected} onChange={e => changeSource(e.target.value)}>{rawSources.map(s => <option key={s.sourceId} value={s.sourceId}>{s.sourceName || s.sourceType}</option>)}</select></label>
        <label className="ssm-search"><span>Search</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search sources or fields" /></label>
        {view === "overview" && <label><span>Filter</span><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All sources</option><option value="spatial">Spatial</option><option value="nonspatial">Non-spatial</option><option value="issues">With detected issues</option></select></label>}
        <button className="ssm-button" onClick={exportMapping}>Export mapping</button>
      </div>
    </header>

    <nav className="ssm-subnav" aria-label="Source & Schema Mapping views">{VIEWS.map(([id,label]) => <button key={id} className={view===id ? "is-active" : ""} onClick={()=>setView(id)}>{label}</button>)}</nav>

    <main className="ssm-main">
      {view === "overview" && <OverviewView service={service} sources={sources} selected={selected} onSelect={selectSource} />}
      {view === "schema" && <SchemaView service={service} selected={selected} search={search.trim().toLowerCase()} context={workflowContext} preferences={viewPreferences} onPreferencesChange={updateViewPreferences} onContextChange={updateWorkflowContext} onOpenQuality={(next) => { updateWorkflowContext(next); setView("quality"); }} />}
      {view === "quality" && <QualityView service={service} selected={selected} search={search} context={workflowContext} preferences={viewPreferences} onPreferencesChange={updateViewPreferences} onContextChange={updateWorkflowContext} onOpenLineage={(next) => { updateWorkflowContext(next); setView("lineage"); }} />}
      {view === "lineage" && <LineageView service={service} selected={selected} search={search.trim().toLowerCase()} context={workflowContext} onContextChange={updateWorkflowContext} onOpenHistory={(next) => { updateWorkflowContext(next); setView("history"); }} />}
      {view === "history" && <HistoryView service={service} selected={selected} search={search} context={workflowContext} onExport={exportMapping} />}
    </main>

    {drawer && <SourceDrawer service={service} sourceId={selected} onClose={()=>setDrawer(false)} />}
  </div>;
}
