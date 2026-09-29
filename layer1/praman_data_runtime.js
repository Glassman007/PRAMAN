(() => {
  'use strict';

  const DATASET_BASE = new URL('../PRAMAN_DATA/', window.location.href);

  const normalize = (value) => String(value ?? '').trim();
  const normalizeLower = (value) => normalize(value).toLowerCase();
  const truthy = (value) => ['true', 'yes', '1', 'y'].includes(normalizeLower(value));

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }

    while (rows.length && rows[rows.length - 1].every((value) => value === '')) rows.pop();
    if (!rows.length) return [];

    const headers = rows[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim());
    return rows.slice(1)
      .filter((values) => values.some((value) => value !== ''))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  }

  async function fetchText(relativePath, required = true) {
    const url = new URL(relativePath, DATASET_BASE);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      if (!required && response.status === 404) return null;
      throw new Error(`${relativePath}: HTTP ${response.status}`);
    }
    return response.text();
  }

  async function fetchCsv(relativePath, required = true) {
    const text = await fetchText(relativePath, required);
    return text === null ? null : parseCsv(text);
  }

  function unique(values) {
    return [...new Set(values.map(normalize).filter(Boolean))];
  }

  function indexBy(rows, key) {
    const map = new Map();
    rows.forEach((row) => {
      const id = normalize(row?.[key]);
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    });
    return map;
  }

  function statusIsOpen(value) {
    const status = normalizeLower(value);
    return status === 'open' || status.includes('unresolved') || status.includes('pending');
  }

  function statusIsResolved(value) {
    const status = normalizeLower(value);
    return ['resolved', 'closed', 'accepted', 'approved', 'applied', 'cleared'].some((token) => status.includes(token));
  }

  function firstNonEmpty(rows, fields) {
    for (const field of fields) {
      for (const row of rows) {
        const value = normalize(row?.[field]);
        if (value) return value;
      }
    }
    return '';
  }

  function compactSourceLabel(source) {
    const raw = normalize(source.source_name || source.source_type || source.source_id);
    if (!raw) return 'Source';
    return raw
      .replace(/^Synthetic\s+/i, '')
      .replace(/\s+\(synthetic extract\)$/i, '')
      .replace(/_/g, ' ');
  }

  function sourceKey(source, index) {
    return normalize(source.source_type || source.source_id || `source-${index + 1}`);
  }

  async function loadCurrentContract() {
    const [sourceMetadata, observations, conflicts, reconciled, canonical, historical] = await Promise.all([
      fetchCsv('1 Source_inputs/SOURCE_METADATA.csv'),
      fetchCsv('4 Matching/SOURCE_OBSERVATIONS.csv'),
      fetchCsv('5 Conflicts/CONFLICTS.csv'),
      fetchCsv('6 Reconciliation/RECONCILED_PARCELS.csv'),
      fetchCsv('7 Authoritative_state/CANONICAL_PARCELS.csv'),
      fetchCsv('8 History/HISTORICAL_PARCELS.csv', false)
    ]);

    const activeCanonical = canonical.filter((row) => {
      const status = normalizeLower(row.parcel_status || row.record_status);
      return !status || status === 'active' || status === 'current' || status === 'authoritative';
    });
    const activeIds = new Set(activeCanonical.map((row) => normalize(row.canonical_parcel_id)).filter(Boolean));
    const reconRows = reconciled.filter((row) => activeIds.has(normalize(row.canonical_parcel_id)));
    const reconByParcel = new Map(reconRows.map((row) => [normalize(row.canonical_parcel_id), row]));
    const observationsByParcel = indexBy(observations, 'candidate_canonical_parcel_id');
    const conflictsByParcel = indexBy(conflicts, 'canonical_parcel_id');

    const sources = sourceMetadata.map((source, index) => {
      const key = sourceKey(source, index);
      const sourceRows = observations.filter((row) => normalize(row.source_type) === key);
      const currentRows = sourceRows.filter((row) => {
        const status = normalizeLower(row.record_status);
        return !status || status === 'current' || status.includes('current_');
      });
      const parcelIds = new Set(currentRows.map((row) => normalize(row.candidate_canonical_parcel_id)).filter((id) => activeIds.has(id)));
      return {
        key,
        label: compactSourceLabel(source),
        sourceType: key,
        recordCount: sourceRows.length,
        activeParcelCount: parcelIds.size,
        authority: normalize(source.authority),
        reliability: normalize(source.reliability)
      };
    });

    const parcels = activeCanonical.map((canonicalRow) => {
      const parcelId = normalize(canonicalRow.canonical_parcel_id);
      const parcelObservations = observationsByParcel.get(parcelId) || [];
      const parcelConflicts = conflictsByParcel.get(parcelId) || [];
      const reconciliation = reconByParcel.get(parcelId) || null;
      const openConflicts = parcelConflicts.filter((row) => statusIsOpen(row.status || row.review_status || row.conflict_status));
      const resolvedConflicts = parcelConflicts.filter((row) => statusIsResolved(row.status || row.review_status || row.conflict_status));
      const sourceTypes = unique(parcelObservations
        .filter((row) => {
          const status = normalizeLower(row.record_status);
          return !status || status === 'current' || status.includes('current_');
        })
        .map((row) => row.source_type));
      const requiresHumanReview = reconciliation ? truthy(reconciliation.requires_human_review) : parcelConflicts.some((row) => truthy(row.human_review_required));
      const matchStatus = normalize(reconciliation?.match_status);
      const reviewed = normalizeLower(matchStatus) === 'reconciled';
      const hasConflict = parcelConflicts.length > 0;
      const hasOpenConflict = openConflicts.length > 0;
      const cleared = hasConflict && !hasOpenConflict && resolvedConflicts.length > 0;
      const integrated = Boolean(reconciliation) && normalizeLower(reconciliation.record_status || 'active') !== 'historical_retired';

      const recordBag = [canonicalRow, reconciliation, ...parcelObservations, ...parcelConflicts].filter(Boolean);
      const searchable = recordBag.flatMap((row) => Object.values(row)).join(' ').toLowerCase();

      return {
        parcelId,
        canonicalId: parcelId,
        records: recordBag,
        sources: sourceTypes,
        sourceCount: sourceTypes.length,
        integrated,
        hasConflict,
        hasOpenConflict,
        needsReview: requiresHumanReview,
        reviewed,
        cleared,
        cell: normalize(canonicalRow.cell_id) || firstNonEmpty(recordBag, ['cell_id']),
        landUse: normalize(canonicalRow.land_use) || firstNonEmpty(recordBag, ['land_use']),
        area: normalize(canonicalRow.locality) || firstNonEmpty(recordBag, ['locality', 'address', 'municipal_ward']),
        searchText: searchable,
        matchStatus
      };
    });

    const sourceKeys = sources.map((source) => source.key);
    function calculateDashboardMetrics(visibleParcels) {
      return visibleParcels.reduce((metrics, parcel) => {
        metrics.totalParcels += 1;
        if (parcel.hasOpenConflict) metrics.conflictedParcels += 1;
        if (parcel.integrated) metrics.integrated += 1;
        if (parcel.needsReview) metrics.needsReview += 1;
        if (parcel.reviewed) metrics.reviewed += 1;
        if (parcel.cleared) metrics.cleared += 1;
        return metrics;
      }, { totalParcels: 0, conflictedParcels: 0, integrated: 0, needsReview: 0, reviewed: 0, cleared: 0 });
    }

    const coords = activeCanonical
      .map((row) => [Number(row.longitude_centroid), Number(row.latitude_centroid)])
      .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
    const mapCenter = coords.length ? [
      coords.reduce((sum, pair) => sum + pair[0], 0) / coords.length,
      coords.reduce((sum, pair) => sum + pair[1], 0) / coords.length
    ] : null;

    const localityCounts = new Map();
    activeCanonical.forEach((row) => {
      const value = normalize(row.locality);
      if (value) localityCounts.set(value, (localityCounts.get(value) || 0) + 1);
    });
    const mapLabel = [...localityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'PRAMAN dataset';

    return {
      contract: 'current',
      datasetBase: DATASET_BASE.href,
      parcels,
      sources,
      sourceKeys,
      calculateDashboardMetrics,
      filterOptions: {
        cells: unique(parcels.map((parcel) => parcel.cell)).sort(),
        landUses: unique(parcels.map((parcel) => parcel.landUse)).sort(),
        areas: unique(parcels.map((parcel) => parcel.area)).sort()
      },
      mapCenter,
      mapLabel,
      counts: {
        activeCanonical: activeCanonical.length,
        historical: historical?.length || 0,
        observations: observations.length,
        conflicts: conflicts.length,
        reconciled: reconRows.length
      }
    };
  }

  async function loadLegacyContract() {
    const sourceFiles = [
      ['01_revenue_land_records_2025.csv', 'Revenue'],
      ['02_registration_stamps_2025.csv', 'Registration'],
      ['03_survey_data_2025.csv', 'Survey'],
      ['04_mcd_ulb_2025.csv', 'ULB'],
      ['05_dda_planning_2025.csv', 'Planning']
    ];

    const [sourceResults, geojsonText, conflicts, recommendations] = await Promise.all([
      Promise.all(sourceFiles.map(async ([file, label]) => ({ file, label, rows: await fetchCsv(file) }))),
      fetchText('06_parcels_2025.geojson'),
      fetchCsv('07_conflicts_2025.csv'),
      fetchCsv('08_reconciliation_recommendations_2025.csv')
    ]);

    const geojson = JSON.parse(geojsonText);
    const canonical = (geojson.features || []).map((feature) => feature.properties || {});
    const canonicalIds = new Set(canonical.map((row) => normalize(row.parcel_id || row.canonical_parcel_id)).filter(Boolean));
    const conflictsByParcel = indexBy(conflicts, 'parcel_id');
    const recommendationsByParcel = indexBy(recommendations, 'parcel_id');
    const sourceParcels = new Map();

    const sources = sourceResults.map(({ label, rows }) => {
      const ids = new Set(rows.map((row) => normalize(row.parcel_id || row.parcel_id_ref)).filter((id) => canonicalIds.has(id)));
      sourceParcels.set(label, ids);
      return { key: label, label, sourceType: label, recordCount: rows.length, activeParcelCount: ids.size };
    });

    const allSourceRows = sourceResults.flatMap(({ label, rows }) => rows.map((row) => ({ ...row, __source: label })));
    const sourceRowsByParcel = new Map();
    allSourceRows.forEach((row) => {
      const id = normalize(row.parcel_id || row.parcel_id_ref);
      if (!id) return;
      if (!sourceRowsByParcel.has(id)) sourceRowsByParcel.set(id, []);
      sourceRowsByParcel.get(id).push(row);
    });

    const parcels = canonical.map((canonicalRow) => {
      const parcelId = normalize(canonicalRow.parcel_id || canonicalRow.canonical_parcel_id);
      const parcelConflicts = conflictsByParcel.get(parcelId) || [];
      const parcelRecommendations = recommendationsByParcel.get(parcelId) || [];
      const sourceRows = sourceRowsByParcel.get(parcelId) || [];
      const openConflicts = parcelConflicts.filter((row) => !statusIsResolved(row.review_status || row.status));
      const resolvedConflicts = parcelConflicts.filter((row) => statusIsResolved(row.review_status || row.status));
      const needsReview = parcelConflicts.some((row) => truthy(row.human_review_required)) || parcelRecommendations.some((row) => {
        const level = normalizeLower(row.automation_level);
        return level.includes('manual') || level.includes('block') || level.includes('human');
      });
      const reviewed = parcelConflicts.some((row) => {
        const status = normalizeLower(row.review_status || row.status);
        return status && status !== 'open' && status !== 'pending';
      }) || parcelRecommendations.some((row) => {
        const status = normalizeLower(row.decision_status);
        return status && status !== 'pending';
      });
      const hasConflict = parcelConflicts.length > 0;
      const hasOpenConflict = openConflicts.length > 0;
      const cleared = hasConflict && !hasOpenConflict && resolvedConflicts.length > 0;
      const sourceNames = unique(sourceRows.map((row) => row.__source));
      const integrated = sources.every((source) => sourceParcels.get(source.key)?.has(parcelId));
      const bag = [canonicalRow, ...sourceRows, ...parcelConflicts, ...parcelRecommendations];
      return {
        parcelId,
        canonicalId: normalize(canonicalRow.canonical_id) || parcelId,
        records: bag,
        sources: sourceNames,
        sourceCount: sourceNames.length,
        integrated,
        hasConflict,
        hasOpenConflict,
        needsReview,
        reviewed,
        cleared,
        cell: firstNonEmpty(bag, ['cell_id', 'cell']),
        landUse: firstNonEmpty(bag, ['land_use', 'landuse']),
        area: firstNonEmpty(bag, ['area', 'locality', 'colony', 'village_mouza', 'district', 'city']),
        searchText: bag.flatMap((row) => Object.values(row)).join(' ').toLowerCase()
      };
    });

    function calculateDashboardMetrics(visibleParcels) {
      return visibleParcels.reduce((metrics, parcel) => {
        metrics.totalParcels += 1;
        if (parcel.hasOpenConflict) metrics.conflictedParcels += 1;
        if (parcel.integrated) metrics.integrated += 1;
        if (parcel.needsReview) metrics.needsReview += 1;
        if (parcel.reviewed) metrics.reviewed += 1;
        if (parcel.cleared) metrics.cleared += 1;
        return metrics;
      }, { totalParcels: 0, conflictedParcels: 0, integrated: 0, needsReview: 0, reviewed: 0, cleared: 0 });
    }

    return {
      contract: 'legacy',
      datasetBase: DATASET_BASE.href,
      parcels,
      sources,
      sourceKeys: sources.map((source) => source.key),
      calculateDashboardMetrics,
      filterOptions: {
        cells: unique(parcels.map((parcel) => parcel.cell)).sort(),
        landUses: unique(parcels.map((parcel) => parcel.landUse)).sort(),
        areas: unique(parcels.map((parcel) => parcel.area)).sort()
      },

      mapCenter: null,
      mapLabel: 'PRAMAN dataset',
      counts: { activeCanonical: parcels.length, historical: 0 }
    };
  }

  async function load() {
    try {
      return await loadCurrentContract();
    } catch (currentError) {
      console.warn('[Layer 1] Current PRAMAN_DATA contract was not available. Trying legacy contract.', currentError);
      try {
        return await loadLegacyContract();
      } catch (legacyError) {
        const error = new Error(
          `Layer 1 could not read PRAMAN_DATA from ${DATASET_BASE.href}. ` +
          'Start the HTTP server from the project root so /PRAMAN_DATA is visible.'
        );
        error.currentContractError = currentError;
        error.legacyContractError = legacyError;
        throw error;
      }
    }
  }

  window.PRAMAN_DATA_LOADER = { load, datasetBase: DATASET_BASE.href };
  window.PRAMAN_DATA_READY = load();
})();
