/**
 * PRAMAN Source & Schema Mapping read-only data service.
 *
 * No UI code, no fake fallback records, no inferred source→canonical mappings.
 * The service accepts a generated data contract and an optional existing-project
 * table loader: async (logicalTableName) => Array<Record<string, unknown>>.
 */

const NOT_AVAILABLE = "Not available";

function asText(value) {
  return value == null ? "" : String(value);
}

function isEmpty(value) {
  if (value == null) return true;
  const t = String(value).trim().toLowerCase();
  return t === "" || t === "na" || t === "n/a" || t === "null" || t === "none" || t === "nan";
}

function parseDetails(value) {
  if (isEmpty(value)) return {};
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stableFrequency(values) {
  const counts = new Map();
  for (const v of values) {
    if (isEmpty(v)) continue;
    const key = typeof v === "object" ? JSON.stringify(v) : String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function sourcePresentationName(value) {
  if (isEmpty(value)) return NOT_AVAILABLE;
  return String(value)
    .replace(/\bsynthetic\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const PRAMAN_ADAPTER = Object.freeze({
  IMAGE: "Image Observation",
  SURVEY: "Survey Observation",
  PARCEL: "Parcel / Spatial-Unit",
  ADMIN: "Administrative / Legal Record",
  CONTEXT: "Context Feature",
  SURFACE: "Surface / 3D Observation",
  DOCUMENT: "Document Ingestion",
});

function metadataResolvedAdapters(source) {
  if (!source) return [];

  // This resolver intentionally uses structured source metadata, never the display name.
  // Explicit adapter metadata/registry remains authoritative and is checked first by adapterDisplay().
  const sourceType = asText(source.source_type).toLowerCase();
  const purpose = asText(source.declared_source_schema?.purpose).toLowerCase();
  const keys = new Set((source.declared_source_schema?.source_specific_keys || []).map((key) => asText(key).toLowerCase()));
  // Do not treat terminology inside an explicitly negated purpose clause as positive adapter evidence
  // (for example, "not automatically cadastral authority" must not make a utility source a parcel adapter).
  const positivePurpose = purpose
    .split(/[.;]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause && !/\b(?:not|no|without)\b/.test(clause))
    .join(" ");
  const haystack = `${sourceType.replaceAll("_", " ")} ${positivePurpose}`;
  const resolved = [];
  const add = (adapter) => { if (!resolved.includes(adapter)) resolved.push(adapter); };

  if (/drone|orthophoto|imagery|uav/.test(haystack)) add(PRAMAN_ADAPTER.IMAGE);
  if (/gnss|cors|field survey|survey evidence|survey observation|high-accuracy field survey/.test(haystack)) add(PRAMAN_ADAPTER.SURVEY);

  const parcelEvidence =
    /cadastral|parcel|plot|municipal property|allotment|land-use evidence/.test(haystack) ||
    [...keys].some((key) => /(^|_)(parcel|plot|khasra)(_|$)/.test(key));
  if (parcelEvidence) add(PRAMAN_ADAPTER.PARCEL);

  const administrativeEvidence =
    /revenue|municipal property|taxation|allotment|tenure|lease|freehold|sanctioned land-use|development authority|planning/.test(haystack) ||
    [...keys].some((key) => /tenure|tax|allotment|lease|freehold|sanctioned/.test(key));
  if (administrativeEvidence) add(PRAMAN_ADAPTER.ADMIN);

  const contextEvidence =
    /building footprint|structure evidence|infrastructure|easement|utility/.test(haystack);
  if (contextEvidence) add(PRAMAN_ADAPTER.CONTEXT);

  const surfaceEvidence =
    /dsm|dtm|surface|3d|point cloud|lidar/.test(haystack) ||
    [...keys].some((key) => /dsm|dtm|elevation|height|point.?cloud/.test(key));
  if (surfaceEvidence) add(PRAMAN_ADAPTER.SURFACE);

  const format = asText(source.metadata?.format ?? source.metadata?.file_format ?? source.metadata?.source_format).toLowerCase();
  if (/pdf|document|docx|scan|register extract/.test(format)) add(PRAMAN_ADAPTER.DOCUMENT);

  return resolved;
}

export function createSourceSchemaMappingService({ contract, loadTable } = {}) {
  if (!contract || !Array.isArray(contract.sources)) {
    throw new Error("A valid PRAMAN Source & Schema Mapping data contract is required.");
  }

  const byId = new Map();
  const byType = new Map();
  for (const source of contract.sources) {
    byId.set(source.source_id, source);
    byType.set(source.source_type, source);
  }

  const resolveSource = (sourceIdOrType) => byId.get(sourceIdOrType) || byType.get(sourceIdOrType) || null;
  const normalizedDefinitions = new Map((contract.normalized_source_schema || []).map((f) => [f.field_name, f]));
  const geometryDefinitions = new Map((contract.source_geometry_schema || []).map((f) => [f.field_name, f]));
  const normalizedStateTable = contract.scope?.normalized_source_state_table || NOT_AVAILABLE;
  const geometryLineage = contract.lineage_contract?.geometry_lineage || {};
  const geometryTable = asText(geometryLineage.to).split(".")[0] || NOT_AVAILABLE;
  const geometryJoinField = geometryLineage.join_key || null;
  const provenanceKeys = Array.isArray(contract.lineage_contract?.record_provenance_keys)
    ? contract.lineage_contract.record_provenance_keys.filter(Boolean)
    : [];

  function provenanceFieldByMeaning(...needles) {
    const lowered = needles.map((needle) => needle.toLowerCase());
    return provenanceKeys.find((field) => {
      const definition = normalizedDefinitions.get(field)?.definition || "";
      const hay = `${field} ${definition}`.toLowerCase();
      return lowered.every((needle) => hay.includes(needle));
    }) || null;
  }

  const observationField = provenanceFieldByMeaning("observation");
  const sourceRecordField = provenanceFieldByMeaning("source", "record");

  function sourceNativeContainer(source) {
    return source?.adapter_and_mapping?.source_native_fields_preserved_in || null;
  }

  const canonicalReference = contract.canonical_schema_reference || { fields: [] };

  function itemBelongsToSource(item, source) {
    if (!item || typeof item !== "object" || !source) return false;
    const sid = item.source_id ?? item.sourceId;
    const stype = item.source_type ?? item.sourceType;
    if (sid != null && asText(sid) !== asText(source.source_id)) return false;
    if (stype != null && asText(stype) !== asText(source.source_type)) return false;
    return sid != null || stype != null || item.source_field != null || item.sourceField != null;
  }

  function sourceToCanonicalRows(source) {
    if (!source) return [];
    const localCandidates = [
      source.adapter_and_mapping?.source_to_canonical_mappings,
      source.adapter_and_mapping?.explicit_source_to_canonical_mappings,
      source.source_to_canonical_mappings,
    ];
    const globalCandidates = [
      canonicalReference.source_to_canonical_mappings,
      contract.source_to_canonical_mappings,
    ];
    const local = localCandidates.find(Array.isArray);
    const global = globalCandidates.find(Array.isArray);
    const raw = local || (global || []).filter((item) => {
      const sid = item?.source_id ?? item?.sourceId;
      const stype = item?.source_type ?? item?.sourceType;
      return (sid != null && asText(sid) === asText(source.source_id)) || (stype != null && asText(stype) === asText(source.source_type));
    });
    return (raw || [])
      .map((item, index) => ({
        raw: item,
        id: item.id || item.mapping_id || `canonical:${source.source_id}:${index}`,
        sourceField: item.source_field ?? item.sourceField ?? item.from_field ?? item.from ?? null,
        canonicalField: item.canonical_field ?? item.canonicalField ?? item.target_field ?? item.targetField ?? item.to_field ?? item.to ?? null,
        status: item.status ?? item.mapping_status ?? "explicit_source_to_canonical_mapping",
        transformation: item.transformation ?? item.transformation_rule ?? null,
        confidence: item.confidence ?? item.mapping_confidence ?? null,
        evidence: item.evidence ?? item.mapping_evidence ?? null,
        affectedRecords: Number(item.affected_records ?? item.affectedRecords ?? 0) || 0,
        sampleInput: item.sample_input ?? item.sampleInput ?? null,
        sampleOutput: item.sample_output ?? item.sampleOutput ?? null,
      }))
      .filter((item) => item.sourceField && item.canonicalField);
  }

  function canonicalFieldDefinition(fieldName) {
    return (canonicalReference.fields || []).find((f) => f.field_name === fieldName) || {};
  }

  function canonicalRequiredStatus(definition) {
    if (!definition || typeof definition !== "object") return NOT_AVAILABLE;
    if (typeof definition.required === "boolean") return definition.required ? "Required" : "Optional";
    if (typeof definition.optional === "boolean") return definition.optional ? "Optional" : "Required";
    const value = definition.required_status ?? definition.requirement ?? definition.requiredness;
    return isEmpty(value) ? NOT_AVAILABLE : String(value);
  }

  function normalizedDomains() {
    const raw = Array.isArray(canonicalReference.domains) ? canonicalReference.domains : [];
    if (raw.length) {
      return raw.map((domain, index) => {
        if (typeof domain === "string") return { id: domain, name: domain, fields: [] };
        const name = domain.name ?? domain.label ?? domain.id ?? `Domain ${index + 1}`;
        const id = domain.id ?? domain.key ?? name;
        const fields = Array.isArray(domain.fields) ? domain.fields : Array.isArray(domain.field_names) ? domain.field_names : [];
        return { ...structuredClone(domain), id: String(id), name: String(name), fields: [...fields] };
      });
    }
    const byDomain = new Map();
    for (const field of canonicalReference.fields || []) {
      const domain = field.domain ?? field.group ?? field.schema_group;
      if (isEmpty(domain)) continue;
      if (!byDomain.has(String(domain))) byDomain.set(String(domain), []);
      byDomain.get(String(domain)).push(field.field_name);
    }
    return [...byDomain.entries()].map(([name, fields]) => ({ id: name, name, fields }));
  }

  function domainForCanonicalField(fieldName) {
    const definition = canonicalFieldDefinition(fieldName);
    const direct = definition.domain ?? definition.group ?? definition.schema_group;
    if (!isEmpty(direct)) return String(direct);
    const domain = normalizedDomains().find((d) => (d.fields || []).includes(fieldName));
    return domain?.id || NOT_AVAILABLE;
  }

  function adapterDisplay(source) {
    if (!source) return NOT_AVAILABLE;
    const mapping = source.adapter_and_mapping || {};
    const direct = mapping.adapter_name ?? mapping.adapter ?? source.adapter_name ?? source.adapter;
    if (!isEmpty(direct)) return String(direct);
    const list = mapping.adapter_names ?? source.adapter_names;
    if (Array.isArray(list) && list.length) return list.map(String).join(", ");
    const registry = contract.adapter_registry;
    if (Array.isArray(registry)) {
      const matches = registry.filter((item) => itemBelongsToSource(item, source));
      const names = matches.map((item) => item.adapter_name ?? item.name ?? item.adapter).filter((x) => !isEmpty(x));
      if (names.length) return [...new Set(names.map(String))].join(", ");
    }
    const resolved = metadataResolvedAdapters(source);
    return resolved.length ? resolved.join(", ") : NOT_AVAILABLE;
  }

  function categoricalRules(source) {
    if (!source) return [];
    const localCandidates = [
      source.adapter_and_mapping?.categorical_normalization_rules,
      source.categorical_normalization_rules,
    ];
    const local = localCandidates.find(Array.isArray);
    if (local) return local;
    const global = Array.isArray(contract.categorical_normalization_rules) ? contract.categorical_normalization_rules : [];
    return global.filter((item) => {
      const sid = item?.source_id ?? item?.sourceId;
      const stype = item?.source_type ?? item?.sourceType;
      return (sid != null && asText(sid) === asText(source.source_id)) || (stype != null && asText(stype) === asText(source.source_type));
    });
  }

  function relationIssueCount(source, relation) {
    const issues = source?.quality_and_exceptions?.exceptions || [];
    if (!relation) return 0;
    if (relation.mappingKind === "source_native_value_retained") {
      const container = sourceNativeContainer(source);
      const location = container ? `${container}.${relation.sourceField}` : null;
      return issues.filter((issue) =>
        issue.field === relation.sourceField ||
        (location && issue.related_mapping_or_transformation === location)
      ).length;
    }
    if (relation.mappingKind === "explicit_geometry_transformation") {
      const relationToken = `${relation.sourceField}->${relation.normalizedField}`;
      return issues.filter((issue) =>
        issue.field === relation.sourceField ||
        issue.field === relation.normalizedField ||
        issue.related_mapping_or_transformation === relationToken
      ).length;
    }
    return 0;
  }

  function validationIssueOccurrences(source) {
    if (!source) return 0;
    if (Array.isArray(source.quality_and_exceptions?.exceptions)) return source.quality_and_exceptions.exceptions.length;
    const q = source.schema_quality || {};
    const sp = source.spatial_metadata || {};
    return [
      q.invalid_source_specific_json_records,
      q.records_with_missing_declared_required_keys,
      q.records_with_empty_non_historical_nullable_required_values,
      q.records_with_undeclared_source_specific_keys,
      q.duplicate_observation_ids,
      q.duplicate_source_record_ids,
      sp.records_without_geometry_reference,
      sp.referenced_geometry_ids_missing_from_geometry_table,
      sp.unreferenced_geometry_rows,
    ].reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function combinedFieldProfiles(source) {
    if (!source) return [];
    const common = source.normalized_source_state?.common_field_profile || {};
    const specific = source.normalized_source_state?.source_specific_field_profile || {};
    const commonFields = Object.entries(common).map(([field, profile]) => {
      const def = normalizedDefinitions.get(field) || {};
      return {
        field,
        key: `normalized_common:${field}`,
        layer: "normalized_common",
        dataType: def.data_type || (profile.observed_value_types || []).join(" | ") || NOT_AVAILABLE,
        definition: def.definition || NOT_AVAILABLE,
        semanticRole: NOT_AVAILABLE,
        mappingState: "Raw derivation unavailable",
        ...structuredClone(profile),
      };
    });
    const sourceFields = Object.entries(specific).map(([field, profile]) => ({
      field,
      key: `source_native:${field}`,
      layer: "source_native",
      dataType: (profile.observed_value_types || []).join(" | ") || NOT_AVAILABLE,
      definition: NOT_AVAILABLE,
      semanticRole: NOT_AVAILABLE,
      mappingState: "Retained in normalized source state",
      ...structuredClone(profile),
    }));
    return [...sourceFields, ...commonFields];
  }

  function geometryProfiles(source) {
    if (!source) return [];
    const profiles = source.spatial_metadata?.geometry_field_profile || {};
    return Object.entries(profiles).map(([field, profile]) => {
      const def = geometryDefinitions.get(field) || {};
      return {
        field,
        key: `source_geometry:${field}`,
        layer: "source_geometry",
        dataType: def.data_type || (profile.observed_value_types || []).join(" | ") || NOT_AVAILABLE,
        definition: def.definition || NOT_AVAILABLE,
        semanticRole: NOT_AVAILABLE,
        ...structuredClone(profile),
      };
    });
  }

  function normalizedTargetFields(source) {
    const profiles = source?.normalized_source_state?.common_field_profile || {};
    return (contract.normalized_source_schema || []).map((def) => {
      const profile = profiles[def.field_name] || {};
      const populated = Number(profile.populated) || 0;
      return {
        field: def.field_name,
        key: `normalized_target:${def.field_name}`,
        layer: "normalized_source",
        dataType: def.data_type || NOT_AVAILABLE,
        definition: def.definition || NOT_AVAILABLE,
        populated,
        null_or_empty: Number(profile.null_or_empty) || 0,
        unique_populated: Number(profile.unique_populated) || 0,
        sample_value: profile.sample_value ?? null,
        selectedSourceState: populated > 0 ? "Populated in selected source" : "No populated values in selected source",
      };
    });
  }

  function normalizedTypeFamily(value) {
    if (isEmpty(value)) return null;
    const t = String(value).toLowerCase();
    if (/wkt|text|string|char|date|foreign key/.test(t)) return "string";
    if (/integer|int/.test(t)) return "integer";
    if (/decimal|number|float|double|numeric/.test(t)) return "number";
    if (/boolean|bool/.test(t)) return "boolean";
    if (/array|list/.test(t)) return "array";
    if (/json/.test(t)) return "json";
    return t.trim() || null;
  }

  function datatypeCompatibility(sourceType, targetType) {
    const sourceFamily = normalizedTypeFamily(sourceType);
    const targetFamily = normalizedTypeFamily(targetType);
    if (!sourceFamily || !targetFamily) return "Not verifiable";
    if (sourceFamily === targetFamily) return "Compatible";
    if ((sourceFamily === "integer" && targetFamily === "number") || (sourceFamily === "number" && targetFamily === "integer")) {
      return "Numerically compatible; precision/range rule not documented";
    }
    return "Potentially incompatible";
  }

  function sourceNativeAffectedEvidence(source, field) {
    const profile = source?.normalized_source_state?.source_specific_field_profile?.[field] || {};
    const records = Number(profile.records ?? source?.normalized_source_state?.record_count ?? 0) || 0;
    const nullOrEmpty = Number(profile.null_or_empty) || 0;
    const populated = Number(profile.populated) || 0;
    const recomputed = Math.max(0, records - nullOrEmpty);
    return {
      count: recomputed,
      unit: `${normalizedStateTable} records with a populated retained value`,
      profilePopulated: populated,
      records,
      nullOrEmpty,
      consistent: recomputed === populated,
      basis: "record_count - null_or_empty, cross-checked against source_specific_field_profile.populated",
    };
  }

  function geometryAffectedEvidence(source, relation) {
    const profiles = source?.spatial_metadata?.geometry_field_profile || {};
    const sourcePopulated = Number(profiles?.[relation.source_field]?.populated) || 0;
    const targetPopulated = Number(profiles?.[relation.target_field]?.populated) || 0;
    const geometryRows = Number(source?.spatial_metadata?.geometry_record_count) || 0;
    const declared = Number(relation.affected_records) || 0;
    const fullyPopulatedPair = sourcePopulated === targetPopulated && sourcePopulated === geometryRows;
    const count = fullyPopulatedPair ? geometryRows : declared;
    return {
      count,
      unit: `${geometryTable} geometry rows`,
      sourcePopulated,
      targetPopulated,
      geometryRows,
      declaredAffectedRecords: declared,
      consistent: fullyPopulatedPair && declared === count,
      basis: fullyPopulatedPair
        ? "source-field populated count = target-field populated count = geometry row count; cross-checked against declared affected_records"
        : "exact row intersection cannot be recomputed from aggregate profiles; retained declared affected_records is flagged for review",
    };
  }

  function relationExceptions(source, relation) {
    const issues = source?.quality_and_exceptions?.exceptions || [];
    const container = sourceNativeContainer(source);
    const location = relation?.mappingKind === "source_native_value_retained" && container
      ? `${container}.${relation.sourceField}`
      : null;
    const token = relation?.mappingKind === "explicit_geometry_transformation"
      ? `${relation.sourceField}->${relation.normalizedField}`
      : null;
    const matches = issues.filter((issue) => {
      if (relation?.mappingKind === "source_native_value_retained") {
        return issue.field === relation.sourceField || (location && issue.related_mapping_or_transformation === location);
      }
      if (relation?.mappingKind === "explicit_geometry_transformation") {
        return issue.field === relation.sourceField || issue.field === relation.normalizedField || (token && issue.related_mapping_or_transformation === token);
      }
      return false;
    });
    const byCategory = stableFrequency(matches.map((issue) => issue.issue_category));
    return {
      count: matches.length,
      categories: byCategory.map(({ value, count }) => ({ category: value, count })),
    };
  }

  function relationshipAuditEntry(source, relation) {
    const exceptions = relationExceptions(source, relation);
    const isRetention = relation.mappingKind === "source_native_value_retained";
    const isGeometry = relation.mappingKind === "explicit_geometry_transformation";
    const category = isRetention
      ? "Source-native retention"
      : isGeometry
        ? "Geometry normalization"
        : relation.mappingKind === "explicit_source_to_canonical_mapping"
          ? "Explicit source-to-canonical mapping"
          : relation.mappingKind;
    const sourceDefinition = isGeometry ? geometryDefinitions.get(relation.sourceField)?.definition : null;
    const targetDefinition = isGeometry
      ? geometryDefinitions.get(relation.normalizedField)?.definition
      : isRetention
        ? normalizedDefinitions.get(sourceNativeContainer(source))?.definition
        : canonicalFieldDefinition(relation.normalizedField)?.definition;
    const rawDerivationDocumented = isGeometry;
    const destinationExists = Boolean(relation.destinationExists);
    const destinationPopulated = Number(relation.affectedRecords) > 0;
    const validationResult = !destinationExists
      ? "Invalid: destination is not represented by the current contract"
      : relation.affectedCountVerified === false
        ? "Needs review: affected-record count could not be independently cross-checked from available aggregate evidence"
        : exceptions.count > 0
          ? `Relationship represented; ${exceptions.count} validation exception${exceptions.count === 1 ? "" : "s"} recorded`
          : "Relationship represented with no detected relationship-specific validation exceptions";
    return {
      relationId: relation.id,
      sourceField: relation.sourceField,
      sourceFieldMeaning: sourceDefinition || NOT_AVAILABLE,
      sourcePurposeContext: source?.declared_source_schema?.purpose || NOT_AVAILABLE,
      sourceDatatype: relation.sourceDataType,
      sourceDatatypeBasis: isRetention ? "Observed populated values in source_specific_field_profile" : "DATA_DICTIONARY / source geometry schema",
      destinationField: relation.normalizedLocation || relation.normalizedField,
      destinationDatatype: relation.targetDataType,
      destinationStorageDatatype: relation.targetStorageDataType || relation.targetDataType,
      destinationMeaning: targetDefinition || NOT_AVAILABLE,
      relationshipCategory: category,
      transformationRule: relation.transformationAvailable ? relation.transformation : NOT_AVAILABLE,
      retentionRule: relation.retentionRule || NOT_AVAILABLE,
      normalizationRule: relation.normalizationRule || NOT_AVAILABLE,
      affectedRecords: Number(relation.affectedRecords) || 0,
      affectedRecordUnit: relation.affectedRecordUnit || "records",
      affectedCountBasis: relation.affectedCountBasis || NOT_AVAILABLE,
      affectedCountVerified: relation.affectedCountVerified !== false,
      datatypeCompatibility: relation.datatypeCompatibility || datatypeCompatibility(relation.sourceDataType, relation.targetDataType),
      mappingEvidence: structuredClone(relation.mappingEvidenceDetails || [relation.mappingEvidence].filter((value) => value !== NOT_AVAILABLE)),
      validationResult,
      validationStatus: relation.validationStatus,
      exceptions,
      destinationExists,
      destinationPopulated,
      valuesActuallyPopulateDestination: destinationPopulated,
      rawFieldDerivationDocumented: rawDerivationDocumented,
      preMatchingScope: true,
      crossSourceIdentityClaim: false,
      uiRelationshipTruthfulness: validationResult.startsWith("Invalid:") ? "Unsupported" : "Supported by current contract/configuration",
      explanation: isRetention
        ? `The declared source-native key is preserved under ${relation.normalizedLocation}. No source→canonical equivalence or upstream raw-table/column transformation is asserted.`
        : isGeometry
          ? `The source and normalized geometry fields coexist in ${geometryTable} with an explicit normalization_method, so this transformation is directly represented by the current pre-match contract.`
          : "This relationship is included only because explicit mapping metadata is present in the supplied contract/configuration.",
    };
  }

  async function load(name) {
    if (typeof loadTable !== "function") {
      throw new Error(`Table loader is required for ${name}. Wire the existing project loader into createSourceSchemaMappingService().`);
    }
    const rows = await loadTable(name);
    if (!Array.isArray(rows)) throw new Error(`Loader returned a non-array for ${name}.`);
    return rows;
  }

  return Object.freeze({
    getSources() {
      return contract.sources.map((s) => ({
        sourceId: s.source_id,
        sourceType: s.source_type,
        sourceName: sourcePresentationName(s.metadata?.source_name),
        ...s.metadata,
        recordCount: s.normalized_source_state.record_count,
        geometryRecordCount: s.spatial_metadata.geometry_record_count,
      }));
    },

    getSource(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      return s ? structuredClone(s) : null;
    },

    getSourceSchema(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        declaredSourceSchema: structuredClone(s.declared_source_schema),
        normalizedSourceSchema: structuredClone(contract.normalized_source_schema || []),
        sourceGeometrySchema: structuredClone(contract.source_geometry_schema || []),
        lifecycleMetadata: structuredClone(contract.lifecycle_metadata || {}),
      };
    },

    async getSourceRecords(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return [];
      const rows = await load(normalizedStateTable);
      return rows.filter((r) => asText(r.source_type) === s.source_type);
    },

    canLoadSourceRecords() {
      return typeof loadTable === "function";
    },

    getSourceStatistics(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      return {
        recordCount: s.normalized_source_state.record_count,
        commonFields: structuredClone(s.normalized_source_state.common_field_profile),
        sourceSpecificFields: structuredClone(s.normalized_source_state.source_specific_field_profile),
        duplicateObservationIds: s.schema_quality.duplicate_observation_ids,
        duplicateSourceRecordIds: s.schema_quality.duplicate_source_record_ids,
      };
    },

    getSpatialMetadata(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      return s ? structuredClone(s.spatial_metadata) : null;
    },

    getMappings(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const sourceProfiles = s.normalized_source_state?.source_specific_field_profile || {};
      const preservedContainer = sourceNativeContainer(s);
      const outputTable = s.adapter_and_mapping?.normalized_output_table || normalizedStateTable;
      const retained = preservedContainer ? (s.declared_source_schema.source_specific_keys || []).map((key) => {
        const sourceLeafType = (sourceProfiles[key]?.observed_value_types || []).join(" | ") || NOT_AVAILABLE;
        const affected = sourceNativeAffectedEvidence(s, key);
        const destinationExists = outputTable !== NOT_AVAILABLE && normalizedDefinitions.has(preservedContainer);
        const relationship = {
          id: `retained:${key}`,
          sourceField: key,
          sourceLayer: "source_native",
          normalizedField: preservedContainer,
          normalizedLocation: `${preservedContainer}.${key}`,
          mappingKind: "source_native_value_retained",
          mappingStatus: "source_native_value_retained",
          transformation: NOT_AVAILABLE,
          transformationAvailable: false,
          retentionRule: `Preserve the source-native value unchanged at ${preservedContainer}.${key}`,
          normalizationRule: `Source-native retention into ${outputTable}.${preservedContainer}; no canonical equivalence asserted`,
          sourceDataType: sourceLeafType,
          targetDataType: sourceLeafType,
          targetStorageDataType: normalizedDefinitions.get(preservedContainer)?.data_type || NOT_AVAILABLE,
          sampleInput: sourceProfiles[key]?.sample_value ?? null,
          sampleOutput: sourceProfiles[key]?.sample_value ?? null,
          affectedRecords: affected.count,
          affectedRecordUnit: affected.unit,
          affectedCountBasis: affected.basis,
          affectedCountVerified: affected.consistent,
          declaredProfilePopulated: affected.profilePopulated,
          destinationExists,
          destinationPopulated: affected.count > 0,
          datatypeCompatibility: datatypeCompatibility(sourceLeafType, sourceLeafType),
          mappingConfidence: NOT_AVAILABLE,
          mappingEvidence: outputTable !== NOT_AVAILABLE
            ? `Declared source-specific field retained in ${outputTable}.${preservedContainer}`
            : NOT_AVAILABLE,
          mappingEvidenceDetails: [
            `SOURCE_SPECIFIC_SCHEMA declares ${key} for ${s.source_type}`,
            `${outputTable}.${preservedContainer} is the configured source-native retention container`,
            `source_specific_field_profile.${key}: ${affected.profilePopulated} populated, ${affected.nullOrEmpty} null/empty across ${affected.records} records`,
          ],
          note: "The supplied dataset preserves this source-native value but does not store the upstream raw-column mapping rule separately.",
        };
        const issueCount = relationIssueCount(s, relationship);
        return {
          ...relationship,
          validationIssueCount: issueCount,
          validationStatus: issueCount === 0
            ? "No detected validation exceptions for this relationship"
            : `${issueCount} detected validation exception${issueCount === 1 ? "" : "s"} for this relationship`,
        };
      }) : [];

      const geomExamples = s.spatial_metadata?.geometry_transform_examples || [];
      const geometryRelationships = (s.spatial_metadata?.geometry_mapping_relationships || []).map((rel) => {
        const example = geomExamples.find((x) => !isEmpty(x?.[rel.source_field]) && !isEmpty(x?.[rel.target_field])) || geomExamples[0] || {};
        const sourceDef = geometryDefinitions.get(rel.source_field) || {};
        const targetDef = geometryDefinitions.get(rel.target_field) || {};
        const affected = geometryAffectedEvidence(s, rel);
        const destinationExists = geometryTable !== NOT_AVAILABLE && geometryDefinitions.has(rel.target_field);
        const relationship = {
          id: `geometry:${rel.source_field}->${rel.target_field}`,
          sourceField: rel.source_field,
          sourceLayer: "source_geometry",
          normalizedField: rel.target_field,
          normalizedLocation: geometryTable !== NOT_AVAILABLE ? `${geometryTable}.${rel.target_field}` : rel.target_field,
          mappingKind: "explicit_geometry_transformation",
          mappingStatus: "explicit_geometry_transformation",
          transformation: example.normalization_method || NOT_AVAILABLE,
          transformationAvailable: !isEmpty(example.normalization_method),
          transformationMetadataField: rel.rule_metadata_field || NOT_AVAILABLE,
          retentionRule: NOT_AVAILABLE,
          normalizationRule: rel.rule_metadata_field
            ? `${geometryTable}.${rel.source_field} → ${geometryTable}.${rel.target_field} using ${geometryTable}.${rel.rule_metadata_field}`
            : `${geometryTable}.${rel.source_field} → ${geometryTable}.${rel.target_field}`,
          sourceDataType: sourceDef.data_type || NOT_AVAILABLE,
          targetDataType: targetDef.data_type || NOT_AVAILABLE,
          targetStorageDataType: targetDef.data_type || NOT_AVAILABLE,
          sampleInput: example?.[rel.source_field] ?? null,
          sampleOutput: example?.[rel.target_field] ?? null,
          sampleRecordId: example.geometry_id || null,
          affectedRecords: affected.count,
          affectedRecordUnit: affected.unit,
          affectedCountBasis: affected.basis,
          affectedCountVerified: affected.consistent,
          declaredAffectedRecords: affected.declaredAffectedRecords,
          destinationExists,
          destinationPopulated: affected.targetPopulated > 0,
          datatypeCompatibility: datatypeCompatibility(sourceDef.data_type, targetDef.data_type),
          mappingConfidence: NOT_AVAILABLE,
          mappingEvidence: geometryTable !== NOT_AVAILABLE
            ? `${geometryTable} stores the source value, transformation metadata and normalized value together.`
            : NOT_AVAILABLE,
          mappingEvidenceDetails: [
            `${geometryTable}.${rel.source_field} is present in the source geometry schema`,
            `${geometryTable}.${rel.target_field} is present in the source geometry schema`,
            `${geometryTable}.${rel.rule_metadata_field || "normalization_method"} records the applied method`,
            `geometry profiles: source populated ${affected.sourcePopulated}, target populated ${affected.targetPopulated}, geometry rows ${affected.geometryRows}`,
          ],
        };
        const issueCount = relationIssueCount(s, relationship);
        return {
          ...relationship,
          validationIssueCount: issueCount,
          validationStatus: issueCount === 0
            ? "No detected validation exceptions for this relationship"
            : `${issueCount} detected validation exception${issueCount === 1 ? "" : "s"} for this relationship`,
        };
      });

      const commonProfiles = s.normalized_source_state?.common_field_profile || {};
      const canonicalTable = canonicalReference.table || NOT_AVAILABLE;
      const explicitCanonicalMappings = sourceToCanonicalRows(s).map((item) => {
        const sourceProfile = sourceProfiles[item.sourceField] || commonProfiles[item.sourceField] || {};
        const sourceDefinition = normalizedDefinitions.get(item.sourceField) || {};
        const targetDefinition = canonicalFieldDefinition(item.canonicalField);
        const sourceType = sourceDefinition.data_type || (sourceProfile.observed_value_types || []).join(" | ") || NOT_AVAILABLE;
        const targetType = targetDefinition.data_type || NOT_AVAILABLE;
        const profilePopulated = Number(sourceProfile.populated) || 0;
        const configuredAffected = Number(item.affectedRecords) || 0;
        const affected = configuredAffected || profilePopulated;
        const countVerified = configuredAffected === 0 || profilePopulated === 0 || configuredAffected === profilePopulated;
        const destinationExists = (canonicalReference.fields || []).some((field) => field.field_name === item.canonicalField);
        return {
          id: item.id,
          sourceField: item.sourceField,
          sourceLayer: Object.prototype.hasOwnProperty.call(sourceProfiles, item.sourceField) ? "source_native" : "normalized_common",
          normalizedField: item.canonicalField,
          normalizedLocation: canonicalTable !== NOT_AVAILABLE ? `${canonicalTable}.${item.canonicalField}` : item.canonicalField,
          mappingKind: "explicit_source_to_canonical_mapping",
          mappingStatus: item.status || "explicit_source_to_canonical_mapping",
          transformation: item.transformation ?? NOT_AVAILABLE,
          transformationAvailable: !isEmpty(item.transformation),
          retentionRule: NOT_AVAILABLE,
          normalizationRule: item.transformation ?? NOT_AVAILABLE,
          sourceDataType: sourceType,
          targetDataType: targetType,
          targetStorageDataType: targetType,
          sampleInput: item.sampleInput ?? sourceProfile.sample_value ?? null,
          sampleOutput: item.sampleOutput ?? null,
          affectedRecords: affected,
          affectedRecordUnit: `${normalizedStateTable} source-state records represented by explicit mapping metadata`,
          affectedCountBasis: configuredAffected ? "explicit mapping metadata; cross-checked against source field profile where available" : "source field populated profile because explicit affected_records is absent",
          affectedCountVerified: countVerified,
          destinationExists,
          destinationPopulated: item.sampleOutput != null || affected > 0,
          datatypeCompatibility: datatypeCompatibility(sourceType, targetType),
          mappingConfidence: item.confidence ?? NOT_AVAILABLE,
          mappingEvidence: item.evidence ?? NOT_AVAILABLE,
          mappingEvidenceDetails: [item.evidence, configuredAffected ? `explicit affected_records=${configuredAffected}` : null].filter((value) => !isEmpty(value)),
          validationIssueCount: 0,
          validationStatus: "No relationship-specific validation exception metadata supplied",
        };
      });

      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        normalizedStateTable: outputTable,
        sourceNativeContainer: preservedContainer || NOT_AVAILABLE,
        geometryTable,
        retainedSourceNativeFields: retained,
        explicitGeometryMappings: geometryRelationships,
        explicitSourceToCanonicalMappings: explicitCanonicalMappings,
        relationships: [...retained, ...geometryRelationships, ...explicitCanonicalMappings],
        normalizedCommonFields: normalizedTargetFields(s),
        sourceToCanonicalFieldMapping: explicitCanonicalMappings.length ? "Available" : NOT_AVAILABLE,
        fieldMappingConfidence: explicitCanonicalMappings.some((row) => row.mappingConfidence !== NOT_AVAILABLE) ? "Available" : NOT_AVAILABLE,
      };
    },

    getMappingAudit(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const mappings = this.getMappings(sourceIdOrType);
      const representedRelationships = (mappings?.relationships || []).map((relation) => relationshipAuditEntry(s, relation));
      const preservedContainer = sourceNativeContainer(s);
      const commonProfiles = s.normalized_source_state?.common_field_profile || {};
      const identifierFields = new Set(contract.lineage_contract?.identifier_fields_present_in_normalized_source_state || []);
      const undocumentedNormalizedDerivations = Object.entries(commonProfiles)
        .filter(([field]) => field !== preservedContainer)
        .map(([field, profile]) => {
          const definition = normalizedDefinitions.get(field) || {};
          return {
            relationId: `undocumented:${s.source_id}:${field}`,
            sourceField: null,
            sourceFieldMeaning: NOT_AVAILABLE,
            sourcePurposeContext: s.declared_source_schema?.purpose || NOT_AVAILABLE,
            sourceDatatype: NOT_AVAILABLE,
            sourceDatatypeBasis: "Upstream raw source field is not documented",
            destinationField: normalizedStateTable !== NOT_AVAILABLE ? `${normalizedStateTable}.${field}` : field,
            destinationDatatype: definition.data_type || NOT_AVAILABLE,
            destinationStorageDatatype: definition.data_type || NOT_AVAILABLE,
            destinationMeaning: definition.definition || NOT_AVAILABLE,
            relationshipCategory: "No documented raw-field derivation",
            transformationRule: NOT_AVAILABLE,
            retentionRule: NOT_AVAILABLE,
            normalizationRule: NOT_AVAILABLE,
            affectedRecords: Number(profile.populated) || 0,
            affectedRecordUnit: `${normalizedStateTable} records with a populated normalized value`,
            affectedCountBasis: "normalized common-field profile; no raw-field rule table is present",
            affectedCountVerified: true,
            datatypeCompatibility: "Not verifiable without the upstream raw-field datatype",
            mappingEvidence: [
              `${normalizedStateTable}.${field} exists in the normalized source schema`,
              `common_field_profile.${field}: ${Number(profile.populated) || 0} populated, ${Number(profile.null_or_empty) || 0} null/empty`,
              "lineage_contract.non_geometry_raw_field_mapping_lineage_available=false",
            ],
            validationResult: "Normalized value exists, but its upstream raw-field derivation is not documented; no connector should be invented",
            validationStatus: "Insufficient evidence for raw-field mapping",
            exceptions: { count: 0, categories: [] },
            destinationExists: normalizedDefinitions.has(field),
            destinationPopulated: (Number(profile.populated) || 0) > 0,
            valuesActuallyPopulateDestination: (Number(profile.populated) || 0) > 0,
            rawFieldDerivationDocumented: false,
            identifierField: identifierFields.has(field),
            preMatchingScope: true,
            crossSourceIdentityClaim: false,
            uiConnectorAllowed: false,
            explanation: identifierFields.has(field)
              ? "This identifier exists in normalized source state, but no upstream raw-field mapping is documented and it must not be treated as proof of cross-source parcel identity."
              : "The normalized field is populated for this source, but the current contract contains no defensible raw-field or non-geometry transformation rule that produced it.",
          };
        });
      const categories = {
        directNormalization: representedRelationships.filter((r) => r.relationshipCategory === "Direct normalization").length,
        sourceNativeRetention: representedRelationships.filter((r) => r.relationshipCategory === "Source-native retention").length,
        geometryNormalization: representedRelationships.filter((r) => r.relationshipCategory === "Geometry normalization").length,
        derivedField: representedRelationships.filter((r) => r.relationshipCategory === "Derived field").length,
        identifierNormalization: representedRelationships.filter((r) => r.relationshipCategory === "Identifier normalization").length,
        explicitSourceToCanonical: representedRelationships.filter((r) => r.relationshipCategory === "Explicit source-to-canonical mapping").length,
        noDocumentedRawFieldDerivation: undocumentedNormalizedDerivations.length,
      };
      const invalid = representedRelationships.filter((r) => r.validationResult.startsWith("Invalid:"));
      const countReview = representedRelationships.filter((r) => r.affectedCountVerified === false);
      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        scope: "source_schema_to_normalized_source_state_pre_matching",
        representedRelationships,
        undocumentedNormalizedDerivations,
        categoryCounts: categories,
        summary: {
          representedRelationshipCount: representedRelationships.length,
          invalidRelationshipCount: invalid.length,
          affectedCountReviewCount: countReview.length,
          canonicalIdentityMappingsAsserted: false,
          rawNonGeometryMappingRulesAvailable: Boolean(s.adapter_and_mapping?.explicit_non_geometry_field_mapping_rules_available),
          upstreamRawMappingAvailable: Boolean(contract.lineage_contract?.non_geometry_raw_field_mapping_lineage_available),
        },
      };
    },

    getCanonicalSchema() {
      return structuredClone(contract.canonical_schema_reference || { fields: [] });
    },

    getTransformationRules(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      return {
        geometry: {
          methods: structuredClone(s.spatial_metadata.normalization_methods || {}),
          originalCrsFrequencies: structuredClone(s.spatial_metadata.original_crs_frequencies || {}),
          normalizedCrsFrequencies: structuredClone(s.spatial_metadata.normalized_crs_frequencies || {}),
        },
        nonGeometry: (() => {
          const candidates = [
            s.adapter_and_mapping?.non_geometry_transformation_rules,
            s.non_geometry_transformation_rules,
          ];
          const rules = candidates.find(Array.isArray);
          return rules ? structuredClone(rules) : NOT_AVAILABLE;
        })(),
      };
    },

    getMappingIssues(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      return {
        schemaConformance: structuredClone(s.schema_quality),
        missingMappingMetadata: {
          adapterRegistry: adapterDisplay(s) === NOT_AVAILABLE,
          explicitNonGeometryMappings: sourceToCanonicalRows(s).length === 0 && !s.adapter_and_mapping.explicit_non_geometry_field_mapping_rules_available,
          fieldMappingConfidence: !sourceToCanonicalRows(s).some((row) => row.confidence != null) && !s.adapter_and_mapping.field_mapping_confidence_available,
        },
      };
    },

    getQualityProfile(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      return {
        schema: structuredClone(s.schema_quality),
        geometry: {
          qualityFlags: structuredClone(s.spatial_metadata.geometry_quality_flags || {}),
          recordsWithoutGeometryReference: s.spatial_metadata.records_without_geometry_reference,
          unresolvedGeometryReferences: s.spatial_metadata.referenced_geometry_ids_missing_from_geometry_table,
          unreferencedGeometryRows: s.spatial_metadata.unreferenced_geometry_rows,
        },
      };
    },

    getLineage(sourceIdOrType, field) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const specific = new Set(s.declared_source_schema.source_specific_keys || []);
      const geometryTargets = new Set((s.spatial_metadata?.geometry_mapping_relationships || []).map((r) => r.target_field));
      const geometryFields = new Set([geometryJoinField, ...geometryTargets].filter(Boolean));
      if (geometryFields.has(field)) {
        const path = [];
        if (geometryJoinField && normalizedStateTable !== NOT_AVAILABLE) path.push(`${normalizedStateTable}.${geometryJoinField}`);
        if (geometryLineage.to) path.push(geometryLineage.to);
        for (const transformField of geometryLineage.explicit_transform_fields || []) {
          path.push(geometryTable !== NOT_AVAILABLE ? `${geometryTable}.${transformField}` : transformField);
        }
        return {
          availability: "available",
          sourceRecordKeys: [...provenanceKeys],
          path,
        };
      }
      if (specific.has(field)) {
        const container = sourceNativeContainer(s);
        const location = container && normalizedStateTable !== NOT_AVAILABLE
          ? `${normalizedStateTable}.${container}.${field}`
          : field;
        return {
          availability: "partial",
          sourceRecordKeys: [...provenanceKeys],
          path: [location],
          limitation: "The dataset retains this source-native value but does not contain its upstream raw-table/column lineage or an explicit mapping rule.",
        };
      }
      const normalizedFields = new Set((contract.normalized_source_schema || []).map((f) => f.field_name));
      if (normalizedFields.has(field)) {
        return {
          availability: "partial",
          sourceRecordKeys: [...provenanceKeys],
          path: [normalizedStateTable !== NOT_AVAILABLE ? `${normalizedStateTable}.${field}` : field],
          limitation: "Normalized value exists, but raw source-field derivation is not documented in the supplied dataset.",
        };
      }
      return { availability: "unavailable", value: NOT_AVAILABLE };
    },

    getAvailableVersions(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const direct = Array.isArray(s.versioning?.versions) ? s.versioning.versions : [];
      const history = contract.source_schema_history || {};
      const scoped = (Array.isArray(history.schema_versions) ? history.schema_versions : []).filter((item) => itemBelongsToSource(item, s));
      const seen = new Set();
      const versions = [...scoped, ...direct].filter((item, index) => {
        const id = item?.id ?? item?.version_id ?? item?.version ?? `index:${index}`;
        const key = String(id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        available: versions.length > 0,
        versions: structuredClone(versions),
        message: versions.length ? null : (s.versioning?.note || history.note || NOT_AVAILABLE),
      };
    },

    async getFieldFrequencies(sourceIdOrType, field) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return [];
      const rows = (await load(normalizedStateTable)).filter((r) => asText(r.source_type) === s.source_type);
      const specific = new Set(s.declared_source_schema.source_specific_keys || []);
      const container = sourceNativeContainer(s);
      const values = specific.has(field) && container
        ? rows.map((r) => parseDetails(r[container])[field])
        : rows.map((r) => r[field]);
      return stableFrequency(values);
    },

    async getRecordLineage(sourceIdOrType, observationId) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const records = (await load(normalizedStateTable)).filter((r) => asText(r.source_type) === s.source_type);
      const record = observationField
        ? records.find((r) => asText(r[observationField]) === asText(observationId))
        : null;
      if (!record) return null;
      const geometryId = geometryJoinField ? asText(record[geometryJoinField]) : "";
      let geometry = null;
      if (geometryId && geometryTable !== NOT_AVAILABLE) {
        const geometryRows = await load(geometryTable);
        geometry = geometryRows.find((g) => asText(g[geometryJoinField]) === geometryId) || null;
      }
      const container = sourceNativeContainer(s);
      const provenance = Object.fromEntries(provenanceKeys.map((key) => [key, record[key] ?? null]));
      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        provenance,
        normalizedRecord: record,
        sourceSpecificDetails: container ? parseDetails(record[container]) : {},
        geometry,
      };
    },

    getFeatureSupport() {
      return structuredClone(contract.feature_support || {});
    },

    getUnavailableFeatures() {
      return [...(contract.unavailable_or_omitted || [])];
    },

    getSourceFieldProfiles(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      return s ? combinedFieldProfiles(s) : [];
    },

    getSourceGeometryFieldProfiles(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      return s ? geometryProfiles(s) : [];
    },

    getSchemaMappingModel(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const mappings = this.getMappings(sourceIdOrType);
      const sourceFields = combinedFieldProfiles(s);
      const geometryFields = geometryProfiles(s);
      const canonical = contract.canonical_schema_reference || { fields: [] };
      const geometryTargetNames = new Set((s.spatial_metadata?.geometry_mapping_relationships || []).map((r) => r.target_field));
      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        sourceName: sourcePresentationName(s.metadata?.source_name),
        sourceFields,
        geometryFields,
        normalizedTable: s.adapter_and_mapping?.normalized_output_table || normalizedStateTable,
        geometryTable,
        canonicalTable: canonical.table || NOT_AVAILABLE,
        normalizedFields: normalizedTargetFields(s),
        geometryNormalizedFields: geometryFields.filter((f) => geometryTargetNames.has(f.field)),
        canonicalFields: (canonical.fields || []).map((f) => {
          const mapped = sourceToCanonicalRows(s).some((row) => row.canonicalField === f.field_name);
          return {
            field: f.field_name,
            key: `canonical:${f.field_name}`,
            dataType: f.data_type || NOT_AVAILABLE,
            definition: f.definition || NOT_AVAILABLE,
            domain: domainForCanonicalField(f.field_name),
            requiredStatus: canonicalRequiredStatus(f),
            selectedSourceMappingState: sourceToCanonicalRows(s).length ? (mapped ? "Mapped by selected source" : "Not mapped by selected source") : NOT_AVAILABLE,
          };
        }),
        relationships: structuredClone(mappings?.relationships || []),
        sourceToCanonicalMappingAvailable: sourceToCanonicalRows(s).length > 0,
        canonicalGroupingAvailable: Array.isArray(canonical.domains) && canonical.domains.length > 0,
        canonicalRequirednessAvailable: Boolean(canonical.required_optional_metadata_available),
        editableMappingState: Boolean(contract.feature_support?.editable_mapping_state),
      };
    },

    getIdentifierInterpretation(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const ids = contract.lineage_contract?.identifier_fields_present_in_normalized_source_state || [];
      const profiles = s.normalized_source_state?.common_field_profile || {};
      return {
        available: ids.length > 0,
        upstreamRawMappingAvailable: Boolean(contract.lineage_contract?.upstream_raw_identifier_mapping_available),
        fields: ids.map((field) => ({
          field,
          normalizedRepresentation: normalizedStateTable !== NOT_AVAILABLE ? `${normalizedStateTable}.${field}` : field,
          dataType: normalizedDefinitions.get(field)?.data_type || NOT_AVAILABLE,
          sampleValue: profiles[field]?.sample_value ?? null,
          populated: Number(profiles[field]?.populated) || 0,
        })),
        note: "These are identifiers present in the normalized source state. They do not establish cross-source parcel identity.",
      };
    },

    getUnmappedSourceFieldClassification(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const explicit = sourceToCanonicalRows(s);
      if (!explicit.length) {
        return {
          available: false,
          fields: [],
          message: "Explicit non-geometry raw-field mapping rules are not present, so source fields cannot be truthfully classified as mapped or unmapped against the canonical schema.",
        };
      }
      const mapped = new Set(explicit.map((row) => row.sourceField));
      const candidateFields = [
        ...(s.declared_source_schema?.source_specific_keys || []),
        ...Object.keys(s.normalized_source_state?.common_field_profile || {}),
      ];
      return {
        available: true,
        fields: [...new Set(candidateFields)].filter((field) => !mapped.has(field)),
        mappedFields: [...mapped],
        message: null,
      };
    },

    getMissingCanonicalFieldClassification(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const explicit = sourceToCanonicalRows(s);
      if (!explicit.length) {
        return {
          available: false,
          fields: [],
          message: "Selected-source → canonical mapping metadata is not present, so missing canonical fields cannot be classified.",
        };
      }
      const mapped = new Set(explicit.map((row) => row.canonicalField));
      const fields = (canonicalReference.fields || [])
        .filter((field) => !mapped.has(field.field_name))
        .map((field) => ({
          field: field.field_name,
          requiredStatus: canonicalRequiredStatus(field),
          required: canonicalRequiredStatus(field).toLowerCase() === "required",
        }));
      return {
        available: true,
        fields,
        requirednessAvailable: fields.some((field) => field.requiredStatus !== NOT_AVAILABLE),
        message: null,
      };
    },

    getValueDictionary(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const rules = categoricalRules(s);
      if (!rules.length) {
        return {
          available: false,
          rows: [],
          message: "No categorical normalization rule table is represented in the current pre-match dataset/configuration.",
        };
      }
      const rows = rules.map((rule, index) => ({
        id: rule.id || rule.rule_id || `${s.source_id}:category:${index}`,
        field: rule.field ?? rule.source_field ?? rule.sourceField ?? NOT_AVAILABLE,
        sourceValue: rule.source_value ?? rule.sourceValue ?? rule.from ?? NOT_AVAILABLE,
        normalizedValue: rule.normalized_value ?? rule.normalizedValue ?? rule.to ?? NOT_AVAILABLE,
        occurrenceCount: Number(rule.occurrence_count ?? rule.occurrenceCount ?? rule.count ?? 0) || 0,
        status: rule.status ?? "configured",
      }));
      return { available: true, rows, message: null };
    },

    getSourceQualitySummary(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const q = s.quality_and_exceptions || {};
      const spatial = s.spatial_metadata || {};
      const hasGeometry = Number(spatial.geometry_record_count) > 0;
      const transformationAvailable = Boolean(s.adapter_and_mapping?.explicit_geometry_transformation_available);
      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        recordCount: Number(s.normalized_source_state?.record_count) || 0,
        totalValuesEvaluated: Number(q.total_values_evaluated) || 0,
        populatedValues: Number(q.populated_values) || 0,
        nullOrEmptyValues: Number(q.null_or_empty_values) || 0,
        completenessRatio: q.completeness_ratio == null ? null : Number(q.completeness_ratio),
        duplicateValueOccurrences: Number(q.duplicate_value_occurrences) || 0,
        uniqueSourceRecords: sourceRecordField
          ? Number(s.normalized_source_state?.common_field_profile?.[sourceRecordField]?.unique_populated) || 0
          : 0,
        duplicateSourceRecordIds: Number(s.schema_quality?.duplicate_source_record_ids) || 0,
        duplicateObservationIds: Number(s.schema_quality?.duplicate_observation_ids) || 0,
        datatypeViolations: Number(q.datatype_violation_count) || 0,
        schemaConformanceIssues: Number(q.schema_conformance_issue_count) || 0,
        validationFailures: Number(q.schema_conformance_issue_count) || 0,
        mappingCoverage: sourceToCanonicalRows(s).length
          ? (() => {
              const sourceFieldCount = new Set([
                ...(s.declared_source_schema?.source_specific_keys || []),
                ...Object.keys(s.normalized_source_state?.common_field_profile || {}),
              ]).size;
              const mappedCount = new Set(sourceToCanonicalRows(s).map((row) => row.sourceField)).size;
              return sourceFieldCount ? mappedCount / sourceFieldCount : null;
            })()
          : (typeof q.mapping_coverage === "number" ? q.mapping_coverage : NOT_AVAILABLE),
        geometryValidity: hasGeometry && q.geometry_validity_available
          ? (q.geometry_validity ?? q.geometry_validity_ratio ?? NOT_AVAILABLE)
          : NOT_AVAILABLE,
        geometryValidityAvailable: Boolean(hasGeometry && q.geometry_validity_available),
        transformationFailures: transformationAvailable ? Number(q.transformation_failure_count) || 0 : null,
        transformationFailuresAvailable: transformationAvailable,
        exceptionCategoryCounts: structuredClone(q.exception_category_counts || {}),
        geometryQualityFlags: hasGeometry ? structuredClone(spatial.geometry_quality_flags || {}) : {},
        hasGeometry,
      };
    },

    getFieldQualityProfiles(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return [];
      const sourceContainer = sourceNativeContainer(s);
      const geometryTargets = new Set((s.spatial_metadata?.geometry_mapping_relationships || []).map((r) => r.target_field));
      const fields = combinedFieldProfiles(s).map((f) => ({
        ...f,
        totalRecordsEvaluated: Number(f.records) || 0,
        missingValues: Number(f.null_or_empty) || 0,
        duplicateValueOccurrences: Number(f.duplicate_value_occurrences) || 0,
        datatypeViolations: f.datatype_violation_count == null ? null : Number(f.datatype_violation_count) || 0,
        expectedDataType: f.expected_data_type || (f.layer === "normalized_common" ? f.dataType : NOT_AVAILABLE),
        parsingFailures: sourceContainer && f.field === sourceContainer ? Number(s.schema_quality?.invalid_source_specific_json_records) || 0 : null,
        unrecognizedCategoricalValues: null,
        mappingFailures: null,
        transformationFailures: null,
      }));
      const geometry = geometryProfiles(s).map((f) => ({
        ...f,
        totalRecordsEvaluated: Number(f.records) || 0,
        missingValues: Number(f.null_or_empty) || 0,
        duplicateValueOccurrences: Number(f.duplicate_value_occurrences) || 0,
        datatypeViolations: f.datatype_violation_count == null ? null : Number(f.datatype_violation_count) || 0,
        expectedDataType: f.expected_data_type || f.dataType || NOT_AVAILABLE,
        parsingFailures: null,
        unrecognizedCategoricalValues: null,
        mappingFailures: null,
        transformationFailures: geometryTargets.has(f.field)
          ? Number(s.quality_and_exceptions?.transformation_failure_counts_by_target?.[f.field]) || 0
          : null,
      }));
      return [...fields, ...geometry];
    },

    getExceptionQueue(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return [];
      return structuredClone(s.quality_and_exceptions?.exceptions || []);
    },

    getExceptionCategories(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return [];
      return Object.entries(s.quality_and_exceptions?.exception_category_counts || {})
        .map(([category, count]) => ({ category, count: Number(count) || 0 }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
    },

    getException(sourceIdOrType, issueId) {
      const s = resolveSource(sourceIdOrType);
      if (!s || !issueId) return null;
      const issue = (s.quality_and_exceptions?.exceptions || []).find((x) => x.issue_id === issueId);
      return issue ? structuredClone(issue) : null;
    },

    getExceptionRecordComparison(sourceIdOrType, issueIdOrObservationId) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const issues = s.quality_and_exceptions?.exceptions || [];
      const issue = issues.find((x) => x.issue_id === issueIdOrObservationId) || issues.find((x) => x.observation_id === issueIdOrObservationId) || null;
      const observationId = issue?.observation_id || issueIdOrObservationId;
      const snapshot = s.quality_and_exceptions?.exception_record_snapshots?.[observationId];
      if (!snapshot) {
        return {
          issue: issue ? structuredClone(issue) : null,
          originalSourceRecordAvailable: false,
          originalSourceRecord: null,
          originalSourceRecordNote: s.quality_and_exceptions?.raw_source_record_note || NOT_AVAILABLE,
          preservedSourceNativeAttributes: null,
          normalizedSourceRecord: null,
          geometry: null,
        };
      }
      return {
        issue: issue ? structuredClone(issue) : null,
        originalSourceRecordAvailable: Boolean(snapshot.raw_source_record_available),
        originalSourceRecord: snapshot.raw_source_record || null,
        originalSourceRecordNote: snapshot.raw_source_record_note || NOT_AVAILABLE,
        preservedSourceNativeAttributes: structuredClone(snapshot.preserved_source_native_attributes || {}),
        normalizedSourceRecord: structuredClone(snapshot.normalized_record || {}),
        geometry: snapshot.geometry ? structuredClone(snapshot.geometry) : null,
      };
    },

    getProvenanceSubjects(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return [];
      const relationships = this.getMappings(sourceIdOrType)?.relationships || [];
      const relationshipSubjects = relationships.map((r) => ({
        key: `relationship:${r.id}`,
        kind: "mapping",
        label: `${r.sourceField} → ${r.normalizedLocation || r.normalizedField}`,
        field: r.normalizedField,
        sourceField: r.sourceField,
        relationId: r.id,
        availability: r.mappingKind === "explicit_geometry_transformation" ? "available" : "partial",
      }));
      const relatedTargets = new Set(relationships.map((r) => r.normalizedField));
      const normalizedSubjects = normalizedTargetFields(s)
        .filter((f) => !relatedTargets.has(f.field))
        .map((f) => ({
          key: `normalized:${f.field}`,
          kind: "normalized_field",
          label: f.field,
          field: f.field,
          sourceField: null,
          relationId: null,
          availability: "partial",
        }));
      return [...relationshipSubjects, ...normalizedSubjects];
    },

    getAttributeProvenance(sourceIdOrType, subjectKey, recordContext = null) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const mappings = this.getMappings(sourceIdOrType);
      const subjects = this.getProvenanceSubjects(sourceIdOrType);
      const subject = subjects.find((x) => x.key === subjectKey) || subjects[0];
      if (!subject) return null;

      const requestedObservationId = recordContext?.observationId || null;
      const snapshots = s.quality_and_exceptions?.exception_record_snapshots || {};
      const snapshot = requestedObservationId ? snapshots[requestedObservationId] || null : null;
      const exactRecordRequested = Boolean(requestedObservationId);
      const exactRecord = snapshot?.normalized_record || null;
      const exactNative = snapshot?.preserved_source_native_attributes || {};
      const exactGeometry = snapshot?.geometry || null;
      const sourceLabel = sourcePresentationName(s.metadata?.source_name);
      const recordStage = requestedObservationId
        ? { label: "Source observation", value: requestedObservationId }
        : null;

      const withRecordStage = (stages) => recordStage ? [stages[0], recordStage, ...stages.slice(1)] : stages;
      const unavailableForExactRecord = (baseStages, limitation) => ({
        subject,
        completeness: "partial_record_specific",
        stages: withRecordStage(baseStages),
        limitation,
      });

      if (subject.kind === "mapping") {
        const relation = mappings.relationships.find((r) => r.id === subject.relationId);
        if (!relation) return null;

        if (relation.mappingKind === "explicit_geometry_transformation") {
          if (exactRecordRequested) {
            if (!snapshot) {
              return unavailableForExactRecord([
                { label: "Source", value: sourceLabel },
                { label: "Original source field", value: relation.sourceField },
                { label: "Original value", value: NOT_AVAILABLE },
                { label: "Transformation", value: NOT_AVAILABLE },
                { label: "Normalized field", value: relation.normalizedLocation || relation.normalizedField },
                { label: "Normalized value", value: NOT_AVAILABLE },
              ], "No record-specific snapshot is available for this observation; a different record's transformation sample is intentionally not substituted.");
            }
            const input = exactGeometry?.[relation.sourceField];
            const output = exactGeometry?.[relation.normalizedField];
            const transformField = relation.transformationMetadataField;
            const transform = transformField && transformField !== NOT_AVAILABLE
              ? exactGeometry?.[transformField]
              : exactGeometry?.normalization_method;
            const hasExact = !isEmpty(input) || !isEmpty(output) || !isEmpty(transform);
            if (!hasExact) {
              return unavailableForExactRecord([
                { label: "Source", value: sourceLabel },
                { label: "Source geometry record", value: exactRecord?.[geometryJoinField] ?? NOT_AVAILABLE },
                { label: "Original source field", value: relation.sourceField },
                { label: "Original value", value: NOT_AVAILABLE },
                { label: "Transformation", value: NOT_AVAILABLE },
                { label: "Normalized field", value: relation.normalizedLocation || relation.normalizedField },
                { label: "Normalized value", value: NOT_AVAILABLE },
              ], "This observation has no record-specific geometry transformation evidence for the selected relationship.");
            }
            return {
              subject,
              completeness: "complete_for_recorded_geometry_transform",
              stages: withRecordStage([
                { label: "Source", value: sourceLabel },
                { label: "Source geometry record", value: exactGeometry?.[geometryJoinField] ?? exactRecord?.[geometryJoinField] ?? NOT_AVAILABLE },
                { label: "Original source field", value: relation.sourceField },
                { label: "Original value", value: input ?? NOT_AVAILABLE },
                { label: "Transformation", value: transform ?? NOT_AVAILABLE },
                { label: "Normalized field", value: relation.normalizedLocation || relation.normalizedField },
                { label: "Normalized value", value: output ?? NOT_AVAILABLE },
              ]),
              limitation: null,
            };
          }
          return {
            subject,
            completeness: "complete_for_recorded_geometry_transform",
            stages: [
              { label: "Source", value: sourceLabel },
              { label: "Source geometry record", value: relation.sampleRecordId || NOT_AVAILABLE },
              { label: "Original source field", value: relation.sourceField },
              { label: "Original value", value: relation.sampleInput },
              { label: "Transformation", value: relation.transformation },
              { label: "Normalized field", value: relation.normalizedLocation || relation.normalizedField },
              { label: "Normalized value", value: relation.sampleOutput },
            ],
            limitation: null,
          };
        }

        if (exactRecordRequested) {
          if (!snapshot) {
            return unavailableForExactRecord([
              { label: "Source", value: sourceLabel },
              { label: "Retained source-native field", value: relation.sourceField },
              { label: "Recorded value", value: NOT_AVAILABLE },
              { label: "Normalized location", value: relation.normalizedLocation || relation.normalizedField },
              { label: "Normalized value", value: NOT_AVAILABLE },
            ], "No record-specific snapshot is available for this observation; a different record's sample value is intentionally not substituted.");
          }
          const exactValue = Object.prototype.hasOwnProperty.call(exactNative, relation.sourceField)
            ? exactNative[relation.sourceField]
            : null;
          return {
            subject,
            completeness: "partial_record_specific",
            stages: withRecordStage([
              { label: "Source", value: sourceLabel },
              { label: "Retained source-native field", value: relation.sourceField },
              { label: "Recorded value", value: exactValue ?? NOT_AVAILABLE },
              { label: "Normalized location", value: relation.normalizedLocation || relation.normalizedField },
              { label: "Normalized value", value: exactValue ?? NOT_AVAILABLE },
            ]),
            limitation: relation.note || "Upstream raw source-record/column lineage is not available.",
          };
        }

        return {
          subject,
          completeness: "partial",
          stages: [
            { label: "Source", value: sourceLabel },
            { label: "Retained source-native field", value: relation.sourceField },
            { label: "Recorded value", value: relation.sampleInput },
            { label: "Normalized location", value: relation.normalizedLocation || relation.normalizedField },
            { label: "Normalized value", value: relation.sampleOutput },
          ],
          limitation: relation.note || "Upstream raw source-record/column lineage is not available.",
        };
      }

      if (exactRecordRequested) {
        if (!snapshot) {
          return unavailableForExactRecord([
            { label: "Source", value: sourceLabel },
            { label: "Normalized field", value: normalizedStateTable !== NOT_AVAILABLE ? `${normalizedStateTable}.${subject.field}` : subject.field },
            { label: "Recorded normalized value", value: NOT_AVAILABLE },
          ], "No record-specific snapshot is available for this observation; a different record's sample value is intentionally not substituted.");
        }
        const exactValue = exactRecord?.[subject.field];
        return {
          subject,
          completeness: "partial_record_specific",
          stages: withRecordStage([
            { label: "Source", value: sourceLabel },
            { label: "Normalized field", value: normalizedStateTable !== NOT_AVAILABLE ? `${normalizedStateTable}.${subject.field}` : subject.field },
            { label: "Recorded normalized value", value: exactValue ?? NOT_AVAILABLE },
          ]),
          limitation: "The record-specific normalized value is proven, but the supplied dataset does not document the upstream raw source field or non-geometry transformation rule.",
        };
      }

      const profile = s.normalized_source_state?.common_field_profile?.[subject.field] || {};
      return {
        subject,
        completeness: "partial",
        stages: [
          { label: "Source", value: sourceLabel },
          { label: "Normalized field", value: normalizedStateTable !== NOT_AVAILABLE ? `${normalizedStateTable}.${subject.field}` : subject.field },
          { label: "Recorded normalized value", value: profile.sample_value ?? NOT_AVAILABLE },
        ],
        limitation: "The normalized value exists, but the supplied dataset does not document the upstream raw source field or non-geometry transformation rule.",
      };
    },

    getMappingImpact(sourceIdOrType, relationId) {
      const s = resolveSource(sourceIdOrType);
      if (!s || !relationId) return null;
      const relation = this.getMappings(sourceIdOrType)?.relationships?.find((r) => r.id === relationId);
      if (!relation) return null;
      const required = new Set(s.declared_source_schema?.required_keys || []);
      const historicalNullable = new Set(s.declared_source_schema?.historical_nullable_keys || []);
      const validationDependencies = [];
      if (relation.sourceLayer === "source_native" && required.has(relation.sourceField)) {
        validationDependencies.push(`SOURCE_SPECIFIC_SCHEMA.required_keys:${relation.sourceField}`);
        if (historicalNullable.has(relation.sourceField)) validationDependencies.push(`SOURCE_SPECIFIC_SCHEMA.historical_nullable_keys:${relation.sourceField}`);
      }
      if (relation.mappingKind === "explicit_geometry_transformation" && relation.transformationMetadataField !== NOT_AVAILABLE) {
        validationDependencies.push(geometryTable !== NOT_AVAILABLE
          ? `${geometryTable}.${relation.transformationMetadataField}`
          : relation.transformationMetadataField);
      }
      return {
        relationId,
        affectedRecords: Number(relation.affectedRecords) || 0,
        transformations: relation.transformationAvailable ? [relation.transformation] : [],
        normalizedFieldsAffected: [relation.normalizedLocation || relation.normalizedField],
        validationDependencies,
        configurationDependencies: relation.sourceLayer === "source_native"
          ? [
              "SOURCE_SPECIFIC_SCHEMA",
              sourceNativeContainer(s) && normalizedStateTable !== NOT_AVAILABLE
                ? `${normalizedStateTable}.${sourceNativeContainer(s)}`
                : NOT_AVAILABLE,
            ].filter((value) => value !== NOT_AVAILABLE)
          : (geometryTable !== NOT_AVAILABLE ? [geometryTable] : []),
        downstreamPipelineDependencies: NOT_AVAILABLE,
        downstreamNote: "Matching, conflict resolution and reconciliation dependencies are not asserted by Source & Schema Mapping.",
      };
    },

    getSourceSchemaHistory(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const history = contract.source_schema_history || {};
      const belongsToSource = (item) => {
        if (!item || typeof item !== "object") return false;
        const itemSourceId = item.source_id ?? item.sourceId;
        const itemSourceType = item.source_type ?? item.sourceType;
        if (itemSourceId != null && asText(itemSourceId) !== asText(s.source_id)) return false;
        if (itemSourceType != null && asText(itemSourceType) !== asText(s.source_type)) return false;
        return true;
      };
      const filterScoped = (items) => (Array.isArray(items) ? items.filter(belongsToSource) : []);
      const events = filterScoped(history.events);
      const historySchemaVersions = filterScoped(history.schema_versions);
      const directVersions = Array.isArray(s.versioning?.versions) ? s.versioning.versions : [];
      const seenVersionIds = new Set();
      const schemaVersions = [...historySchemaVersions, ...directVersions].filter((item, index) => {
        const id = item?.id ?? item?.version_id ?? item?.version ?? `index:${index}`;
        const key = String(id);
        if (seenVersionIds.has(key)) return false;
        seenVersionIds.add(key);
        return true;
      });
      const mappingVersions = filterScoped(history.mapping_versions);
      const templates = filterScoped(history.templates);
      return {
        available: Boolean(history.available || events.length || schemaVersions.length || mappingVersions.length || templates.length),
        events: structuredClone(events),
        schemaVersions: structuredClone(schemaVersions),
        mappingVersions: structuredClone(mappingVersions),
        templates: structuredClone(templates),
        note: history.note || NOT_AVAILABLE,
      };
    },

    getVersionComparison(sourceIdOrType, leftId = null, rightId = null) {
      const history = this.getSourceSchemaHistory(sourceIdOrType);
      const versions = history?.schemaVersions || [];
      if (versions.length < 2) return { available: false, versions: structuredClone(versions), message: "At least two schema versions are required for comparison." };
      const identify = (v, i) => String(v?.id ?? v?.version_id ?? v?.version ?? i);
      const left = leftId == null ? versions[versions.length - 2] : versions.find((v, i) => identify(v, i) === String(leftId));
      const right = rightId == null ? versions[versions.length - 1] : versions.find((v, i) => identify(v, i) === String(rightId));
      if (!left || !right) return { available: false, versions: structuredClone(versions), message: "Selected schema version was not found." };
      const fieldsOf = (v) => {
        const raw = v?.fields ?? v?.schema_fields ?? v?.schema?.fields ?? [];
        return Array.isArray(raw) ? raw.map((f) => typeof f === "string" ? { field_name: f } : f).filter(Boolean) : [];
      };
      const fieldName = (f) => f?.field_name ?? f?.field ?? f?.name ?? null;
      const fieldType = (f) => f?.data_type ?? f?.type ?? f?.datatype ?? null;
      const lm = new Map(fieldsOf(left).map((f) => [fieldName(f), f]).filter(([k]) => k));
      const rm = new Map(fieldsOf(right).map((f) => [fieldName(f), f]).filter(([k]) => k));
      const added = [...rm.keys()].filter((k) => !lm.has(k));
      const removed = [...lm.keys()].filter((k) => !rm.has(k));
      const datatypeChanges = [...lm.keys()].filter((k) => rm.has(k) && String(fieldType(lm.get(k)) ?? "") !== String(fieldType(rm.get(k)) ?? "")).map((k) => ({ field: k, from: fieldType(lm.get(k)) ?? NOT_AVAILABLE, to: fieldType(rm.get(k)) ?? NOT_AVAILABLE }));
      return { available: true, left: structuredClone(left), right: structuredClone(right), leftId: identify(left, versions.indexOf(left)), rightId: identify(right, versions.indexOf(right)), addedFields: added, removedFields: removed, datatypeChanges };
    },

    getCurrentMappingConfiguration(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const mappings = this.getMappings(sourceIdOrType);
      const identifiers = this.getIdentifierInterpretation(sourceIdOrType);
      const valueDictionary = this.getValueDictionary(sourceIdOrType);
      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        scope: "pre_matching_normalized_source_state",
        normalizedOutputTable: s.adapter_and_mapping?.normalized_output_table || NOT_AVAILABLE,
        relationships: structuredClone(mappings?.relationships || []),
        geometryTransformationMethods: structuredClone(s.spatial_metadata?.normalization_methods || {}),
        categoricalDictionary: valueDictionary?.available ? structuredClone(valueDictionary.rows) : NOT_AVAILABLE,
        identifierNormalization: identifiers?.available ? structuredClone(identifiers.fields) : NOT_AVAILABLE,
        validationConfiguration: {
          sourceSpecificKeys: structuredClone(s.declared_source_schema?.source_specific_keys || []),
          requiredKeys: structuredClone(s.declared_source_schema?.required_keys || []),
          historicalNullableKeys: structuredClone(s.declared_source_schema?.historical_nullable_keys || []),
          datatypeDefinitions: (contract.normalized_source_schema || []).map((d) => ({ field: d.field_name, dataType: d.data_type, allowedValues: d.enum_or_allowed_values || null })),
        },
        sourceToCanonicalMapping: sourceToCanonicalRows(s).length ? structuredClone(sourceToCanonicalRows(s).map((row) => row.raw)) : NOT_AVAILABLE,
        editableMappingState: Boolean(contract.feature_support?.editable_mapping_state),
      };
    },

    getExportableMappingConfiguration(sourceIdOrType) {
      const config = this.getCurrentMappingConfiguration(sourceIdOrType);
      if (!config) return null;
      return {
        format: "PRAMAN_SOURCE_SCHEMA_MAPPING_CONFIG",
        contractVersion: contract.contract_version,
        ...structuredClone(config),
      };
    },

    getSourceOverview(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return null;
      const fields = combinedFieldProfiles(s);
      const populatedValues = fields.reduce((sum, f) => sum + (Number(f.populated) || 0), 0);
      const missingValues = fields.reduce((sum, f) => sum + (Number(f.null_or_empty) || 0), 0);
      const issueOccurrences = validationIssueOccurrences(s);
      const normalizedFields = Object.keys(s.normalized_source_state?.common_field_profile || {}).length;
      const sourceNativeFields = Object.keys(s.normalized_source_state?.source_specific_field_profile || {}).length;
      const transformMethods = Object.keys(s.spatial_metadata?.normalization_methods || {}).length;
      const explicitMappingAvailable = Boolean(
        s.adapter_and_mapping?.explicit_non_geometry_field_mapping_rules_available ||
        s.adapter_and_mapping?.explicit_geometry_transformation_available
      );
      return {
        sourceId: s.source_id,
        sourceType: s.source_type,
        sourceName: sourcePresentationName(s.metadata?.source_name),
        dataCharacter: s.data_character || NOT_AVAILABLE,
        recordCount: Number(s.normalized_source_state?.record_count) || 0,
        normalizedFieldCount: normalizedFields,
        sourceNativeFieldCount: sourceNativeFields,
        fieldCount: normalizedFields + sourceNativeFields,
        populatedValues,
        missingValues,
        uniqueSourceRecords: sourceRecordField
          ? Number(s.normalized_source_state?.common_field_profile?.[sourceRecordField]?.unique_populated) || 0
          : 0,
        issueOccurrences,
        validationState: issueOccurrences === 0 ? "No validation issues detected" : "Validation issues detected",
        adapter: adapterDisplay(s),
        transformationCount: transformMethods || 0,
        mappingMetadataAvailable: explicitMappingAvailable || sourceToCanonicalRows(s).length > 0,
        sourceToCanonicalMappingAvailable: sourceToCanonicalRows(s).length > 0,
        mappingCoverage: sourceToCanonicalRows(s).length ? (() => {
          const candidate = new Set([...(s.declared_source_schema?.source_specific_keys || []), ...Object.keys(s.normalized_source_state?.common_field_profile || {})]);
          const mapped = new Set(sourceToCanonicalRows(s).map((row) => row.sourceField));
          return candidate.size ? `${((mapped.size / candidate.size) * 100).toFixed(1)}%` : NOT_AVAILABLE;
        })() : NOT_AVAILABLE,
        mappedFields: sourceToCanonicalRows(s).length ? new Set(sourceToCanonicalRows(s).map((row) => row.sourceField)).size : NOT_AVAILABLE,
        unmappedFields: sourceToCanonicalRows(s).length ? this.getUnmappedSourceFieldClassification(sourceIdOrType).fields.length : NOT_AVAILABLE,
        format: s.metadata?.format || s.metadata?.file_format || s.metadata?.source_format || NOT_AVAILABLE,
      };
    },

    getArchitectureStages(sourceIdOrType) {
      const s = resolveSource(sourceIdOrType);
      if (!s) return [];
      const overview = this.getSourceOverview(sourceIdOrType);
      const mapping = this.getMappings(sourceIdOrType);
      const transforms = this.getTransformationRules(sourceIdOrType);
      const retained = mapping?.retainedSourceNativeFields?.length || 0;
      const geometryRules = mapping?.explicitGeometryMappings?.length || 0;
      const transformCount = Object.keys(transforms?.geometry?.methods || {}).length;
      return [
        { key: "source", label: "Source", primary: sourcePresentationName(s.metadata?.source_name), secondary: s.source_id },
        { key: "adapter", label: "Adapter", primary: adapterDisplay(s), secondary: adapterDisplay(s) === NOT_AVAILABLE ? "Adapter registry not present" : null },
        { key: "validation", label: "Validation", primary: overview.validationState, secondary: `${overview.issueOccurrences} issue occurrences` },
        { key: "schema", label: "Schema Detection", primary: `${overview.fieldCount} detected fields`, secondary: `${overview.normalizedFieldCount} normalized + ${overview.sourceNativeFieldCount} source-native` },
        { key: "mapping", label: "Field Relationships", primary: `${mapping?.relationships?.length || 0} represented relationship${(mapping?.relationships?.length || 0) === 1 ? "" : "s"}`, secondary: mapping?.sourceToCanonicalFieldMapping !== NOT_AVAILABLE ? `Source → canonical: ${mapping.sourceToCanonicalFieldMapping}` : (retained || geometryRules ? `Source → canonical: ${NOT_AVAILABLE}; ${retained} retained native fields; ${geometryRules} explicit geometry mapping entries` : `Source → canonical: ${NOT_AVAILABLE}`) },
        { key: "transformation", label: "Transformation", primary: transformCount ? `${transformCount} geometry transformation method${transformCount === 1 ? "" : "s"}` : NOT_AVAILABLE, secondary: transforms?.nonGeometry === NOT_AVAILABLE ? "Non-geometry rules unavailable" : null },
        { key: "normalized", label: "Normalized Source State", primary: `${overview.recordCount} records`, secondary: s.normalized_source_state?.table || NOT_AVAILABLE },
      ];
    },

    getCanonicalDomains() {
      return structuredClone(normalizedDomains());
    },

    getSourceCanonicalMatrix() {
      const domains = normalizedDomains();
      if (!domains.length) {
        return {
          available: false,
          domains: [],
          rows: [],
          message: "Canonical information groups/domains are not defined in the supplied schema/configuration.",
        };
      }
      const rows = [];
      let anyMapping = false;
      for (const source of contract.sources) {
        const mappings = sourceToCanonicalRows(source);
        if (mappings.length) anyMapping = true;
        const mappedFields = new Set(mappings.map((row) => row.canonicalField));
        const cells = domains.map((domain) => {
          const fieldNames = (domain.fields || []).length
            ? domain.fields
            : (canonicalReference.fields || []).filter((field) => domainForCanonicalField(field.field_name) === domain.id).map((field) => field.field_name);
          const mappedCount = fieldNames.filter((field) => mappedFields.has(field)).length;
          const state = mappedCount === 0 ? "none" : mappedCount === fieldNames.length && fieldNames.length > 0 ? "full" : "partial";
          return { domainId: domain.id, state, mappedCount, totalFields: fieldNames.length };
        });
        rows.push({ sourceId: source.source_id, sourceName: sourcePresentationName(source.metadata?.source_name), cells });
      }
      if (!anyMapping) {
        return {
          available: false,
          domains: structuredClone(domains),
          rows: [],
          message: "Explicit source-to-canonical mapping metadata is not available in the supplied dataset.",
        };
      }
      return { available: true, domains: structuredClone(domains), rows };
    },

  });
}

export { NOT_AVAILABLE };
