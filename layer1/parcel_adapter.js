(() => {
  const rawRecords = Array.isArray(window.PARCEL_DATA) ? window.PARCEL_DATA : [];
  const conflicts = Array.isArray(window.CONFLICT_DATA) ? window.CONFLICT_DATA : [];
  const recommendations = Array.isArray(window.RECONCILIATION_DATA) ? window.RECONCILIATION_DATA : [];
  const dashboardMetrics = window.DASHBOARD_METRICS || {};
  const sourceQuality = Array.isArray(window.SOURCE_QUALITY) ? window.SOURCE_QUALITY : [];

  const REQUIRED_SOURCES = ['revenue', 'survey', 'registration', 'ulb', 'planning'];

  const SOURCE_LABELS = {
    revenue: 'Revenue',
    survey: 'Survey',
    registration: 'Registration',
    ulb: 'ULB',
    planning: 'Planning'
  };

  const REVIEWED_STATUSES = new Set([
    'reviewed', 'accepted', 'modified', 'rejected', 'escalated',
    'decision-recorded', 'resolved', 'closed', 'approved', 'applied'
  ]);

  const normalize = (value) => String(value ?? '').trim().toLowerCase();

  function normalizeSource(value) {
    const source = normalize(value);
    if (source.includes('revenue') || source.includes('land record')) return 'revenue';
    if (source.includes('survey') || source.includes('naksha')) return 'survey';
    if (source.includes('registration') || source.includes('stamp')) return 'registration';
    if (source.includes('ulb') || source.includes('mcd') || source.includes('urban local')) return 'ulb';
    if (source.includes('planning') || source.includes('dda') || source.includes('urban planning')) return 'planning';
    return null;
  }

  function getParcelId(record) {
    const value = record?.parcel_id || record?.parcel_id_ref;
    return value ? String(value).trim() : null;
  }

  function firstValue(records, fields) {
    for (const field of fields) {
      for (const record of records) {
        const value = record?.[field];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    return null;
  }

  function confidenceBucket(score) {
    if (!Number.isFinite(score)) return null;
    if (score >= 0.85) return 'high';
    if (score >= 0.65) return 'medium';
    return 'low';
  }

  function indexByParcel(rows) {
    const index = new Map();
    rows.forEach((row) => {
      const parcelId = String(row?.parcel_id || '').trim();
      if (!parcelId) return;
      if (!index.has(parcelId)) index.set(parcelId, []);
      index.get(parcelId).push(row);
    });
    return index;
  }

  function searchableText(records, parcelId, canonicalId, parcelConflicts) {
    const fields = [
      'parcel_id', 'parcel_id_ref', 'canonical_id', 'khasra_no', 'survey_no',
      'plot_name', 'parcel_label', 'parcel_reference', 'land_owner', 'guardian_name',
      'seller_name', 'buyer_name', 'recorded_person', 'primary_holder',
      'registered_address', 'property_address', 'planning_address', 'village_mouza',
      'tehsil', 'ward_no', 'colony', 'planning_zone'
    ];

    const values = [parcelId, canonicalId];
    records.forEach((record) => {
      fields.forEach((field) => {
        const value = record?.[field];
        if (value !== undefined && value !== null && String(value).trim() !== '') values.push(value);
      });
    });
    parcelConflicts.forEach((conflict) => {
      ['conflict_type', 'severity', 'issue_summary'].forEach((field) => {
        if (conflict?.[field]) values.push(conflict[field]);
      });
    });

    return normalize(values.join(' '));
  }

  function isResolvedConflict(conflict) {
    const status = normalize(conflict?.review_status);
    return ['resolved', 'closed', 'accepted'].includes(status);
  }

  function isResolvedRecommendation(recommendation) {
    const status = normalize(recommendation?.decision_status);
    return ['resolved', 'accepted', 'approved', 'applied'].includes(status);
  }

  function isReviewedConflict(conflict) {
    return REVIEWED_STATUSES.has(normalize(conflict?.review_status));
  }

  function isReviewedRecommendation(recommendation) {
    return REVIEWED_STATUSES.has(normalize(recommendation?.decision_status));
  }

  function buildParcels() {
    const groups = new Map();
    const conflictIndex = indexByParcel(conflicts);
    const recommendationIndex = indexByParcel(recommendations);

    rawRecords.forEach((record) => {
      const parcelId = getParcelId(record);
      if (!parcelId) return;
      if (!groups.has(parcelId)) groups.set(parcelId, []);
      groups.get(parcelId).push(record);
    });

    return [...groups.entries()]
      .map(([parcelId, records]) => {
        const parcelConflicts = conflictIndex.get(parcelId) || [];
        const parcelRecommendations = recommendationIndex.get(parcelId) || [];
        const sourceKeys = [...new Set(records.map((record) => normalizeSource(record.source)).filter(Boolean))];
        const sourceMap = Object.fromEntries(REQUIRED_SOURCES.map((source) => [source, []]));

        records.forEach((record) => {
          const source = normalizeSource(record.source);
          if (source && sourceMap[source]) sourceMap[source].push(record);
        });

        const confidenceScores = parcelConflicts
          .map((conflict) => Number(conflict.confidence))
          .filter(Number.isFinite);
        const canonicalConfidence = Number(firstValue(records, ['confidence']));
        const confidenceScore = confidenceScores.length
          ? Math.min(...confidenceScores)
          : Number.isFinite(canonicalConfidence)
          ? canonicalConfidence
          : null;
        const canonicalId = String(firstValue(records, ['canonical_id']) || parcelConflicts[0]?.canonical_id || '').trim() || null;
        const country = firstValue(records, ['country', 'country_name']);
        const state = firstValue(records, ['state', 'state_name']);
        const area = firstValue(records, ['area', 'locality', 'colony', 'village_mouza', 'district', 'city']);
        const lastHarmonization = firstValue(records, [
          'last_harmonization', 'lastHarmonization', 'harmonized_at', 'harmonizedAt', 'harmonization_date'
        ]);

        const integrated = REQUIRED_SOURCES.every((source) => sourceKeys.includes(source));
        const hasConflict = parcelConflicts.length > 0;
        const hasUnresolvedConflict = parcelConflicts.some((conflict) => !isResolvedConflict(conflict));
        const conflictResolved = hasConflict && parcelConflicts.every(isResolvedConflict);
        const recommendationResolved = parcelRecommendations.length > 0 && parcelRecommendations.every(isResolvedRecommendation);
        const reviewed = parcelConflicts.some(isReviewedConflict) || parcelRecommendations.some(isReviewedRecommendation);
        // Cleared requires both the discrepancy record and any linked decision to be resolved.
        // A reviewed or escalated parcel is therefore not automatically cleared.
        const cleared = hasConflict
          && conflictResolved
          && (!parcelRecommendations.length || recommendationResolved);
        const harmonized = integrated && (!hasConflict || cleared);

        // "Suggest" cases have a high-confidence recommendation ready for lightweight confirmation.
        // Manual/Block cases require expert review. This keeps integration separate from harmonization.
        const autoReconcilable = hasUnresolvedConflict && parcelRecommendations.length > 0 && parcelRecommendations.every((recommendation) => {
          const level = normalize(recommendation.automation_level);
          const score = Number(recommendation.recommendation_confidence);
          return level === 'suggest' && Number.isFinite(score) && score >= 0.85;
        });
        const needsReview = hasUnresolvedConflict && !autoReconcilable;

        return {
          parcelId,
          canonicalId,
          records,
          sourceMap,
          sources: sourceKeys,
          sourceCount: sourceKeys.length,
          integrated,
          harmonized,
          conflicts: parcelConflicts,
          recommendations: parcelRecommendations,
          hasConflict,
          hasUnresolvedConflict,
          autoReconcilable,
          needsReview,
          reviewed,
          cleared,
          confidenceScore,
          confidence: confidenceBucket(confidenceScore),
          country: country ? String(country) : null,
          state: state ? String(state) : null,
          area: area ? String(area) : null,
          lastHarmonization: lastHarmonization ? String(lastHarmonization) : null,
          searchText: searchableText(records, parcelId, canonicalId, parcelConflicts)
        };
      })
      .sort((a, b) => a.parcelId.localeCompare(b.parcelId, undefined, { numeric: true }));
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
  }

  function sourceQualityIndex() {
    const result = {};
    sourceQuality.forEach((entry) => {
      const key = normalizeSource(entry.source);
      if (key) result[key] = entry;
    });
    return result;
  }

  function calculateDashboardMetrics(parcels) {
    const metrics = {
      totalParcels: 0,
      conflictedParcels: 0,
      integrated: 0,
      needsReview: 0,
      reviewed: 0,
      cleared: 0
    };

    // Each adapter parcel is one canonical entity, so every visible parcel is classified once.
    parcels.forEach((parcel) => {
      metrics.totalParcels += 1;
      if (parcel.hasUnresolvedConflict) metrics.conflictedParcels += 1;
      if (parcel.integrated) metrics.integrated += 1;
      if (parcel.needsReview) metrics.needsReview += 1;
      if (parcel.reviewed) metrics.reviewed += 1;
      if (parcel.cleared) metrics.cleared += 1;
    });

    ['conflictedParcels', 'needsReview', 'reviewed', 'cleared'].forEach((key) => {
      if (metrics[key] > metrics.totalParcels) {
        console.error(`[Layer 1 adapter] Invalid ${key} metric: ${metrics[key]}/${metrics.totalParcels}.`);
      }
    });

    return metrics;
  }

  function validate(parcels) {
    const warnings = [];
    const expectedTotal = Number(dashboardMetrics['Total canonical parcel cases']?.value);
    if (Number.isFinite(expectedTotal) && expectedTotal !== parcels.length) {
      warnings.push(`Canonical parcel count ${parcels.length} does not match dashboard metric ${expectedTotal}.`);
    }

    const actualConfidence = { high: 0, medium: 0, low: 0 };
    parcels.forEach((parcel) => {
      if (parcel.confidence) actualConfidence[parcel.confidence] += 1;
    });

    ['high', 'medium', 'low'].forEach((bucket) => {
      const metricKey = `${bucket[0].toUpperCase()}${bucket.slice(1)}-confidence parcels`;
      const expected = Number(dashboardMetrics[metricKey]?.value);
      if (Number.isFinite(expected) && expected !== actualConfidence[bucket]) {
        warnings.push(`${bucket} confidence count ${actualConfidence[bucket]} does not match dashboard metric ${expected}.`);
      }
    });

    REQUIRED_SOURCES.forEach((source) => {
      const count = parcels.filter((parcel) => parcel.sources.includes(source)).length;
      if (count !== parcels.length) warnings.push(`${SOURCE_LABELS[source]} is present on ${count}/${parcels.length} canonical parcels.`);
    });

    conflicts.forEach((conflict) => {
      const parcelId = String(conflict?.parcel_id || '').trim();
      if (parcelId && !parcels.some((parcel) => parcel.parcelId === parcelId)) {
        warnings.push(`Conflict ${conflict.conflict_id || ''} references unknown parcel ${parcelId}.`);
      }
    });

    return warnings;
  }

  const parcels = buildParcels();
  const warnings = validate(parcels);
  warnings.forEach((warning) => console.warn(`[Layer 1 adapter] ${warning}`));

  window.PARCEL_ADAPTER = {
    rawCount: rawRecords.length,
    parcels,
    requiredSources: [...REQUIRED_SOURCES],
    sourceLabels: { ...SOURCE_LABELS },
    sourceQuality: sourceQualityIndex(),
    calculateDashboardMetrics,
    filterOptions: {
      countries: unique(parcels.map((parcel) => parcel.country)),
      states: unique(parcels.map((parcel) => parcel.state)),
      areas: unique(parcels.map((parcel) => parcel.area)),
      hasHarmonizationDates: parcels.some((parcel) => parcel.lastHarmonization)
    },
    warnings
  };
})();
