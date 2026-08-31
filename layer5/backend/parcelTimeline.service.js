const {
  FILES,
  getMergeGroupMembers,
  getParcel,
  getRecords,
  getSourceLabel,
  listParcels,
  normalizeNumber: toNumber,
  normalizeText: toText
} = require('./dataset.repository');

function yearFrom(value) {
  const match = toText(value).match(/^\d{4}/);
  return match ? Number(match[0]) : null;
}

function attribute(field, value) {
  return value === null || value === undefined || value === '' ? null : { field, value };
}

function changedField(field, from, to) {
  if (from === to) return null;
  return { field, from: from === '' ? null : from, to: to === '' ? null : to };
}

function listTimelineParcels() {
  return listParcels()
    .map((parcel) => ({
      parcelId: parcel.canonicalId,
      displayName: `${parcel.canonicalId} — ${parcel.currentOwner || 'Owner unavailable'}`,
      owner: parcel.currentOwner
    }))
    .sort((left, right) => left.parcelId.localeCompare(right.parcelId, undefined, { numeric: true }));
}

function historyEventType(record, previous) {
  const text = `${record.event_type} ${record.primary_conflict_type}`.toLowerCase();
  if (/merge|amalgamat/.test(text)) return 'merge';
  if (/failure|error|risk/.test(text)) return 'risk';
  if (previous && toText(previous.owner_or_recorded_person) !== toText(record.owner_or_recorded_person)) {
    return 'ownership';
  }
  if (
    /geometry|gis|survey|overlap|gap|digitiz/.test(text)
    || (previous && toText(previous.geometry_wkt_epsg4326) !== toText(record.geometry_wkt_epsg4326))
  ) return 'geometry';
  if (!previous || /created/.test(text)) return 'creation';
  return 'administrative';
}

function explicitLineage(parcel) {
  const mergeGroup = parcel.mergeGroup;
  if (!mergeGroup) return null;

  const members = getMergeGroupMembers(mergeGroup)
    .map((member) => ({
      id: member.canonicalId,
      sourceParcelId: member.id,
      areaSqM: member.currentAreaSqM,
      status: member.status
    }))
    .filter((member) => member.id);

  return members.length > 1
    ? { type: 'merge', groupId: mergeGroup, members }
    : null;
}

function historyEvents(canonicalId) {
  const records = [...getRecords('history', canonicalId)]
    .sort((left, right) => toNumber(left.year) - toNumber(right.year));

  return records.map((record, index) => {
    const previous = records[index - 1] || null;
    const previousArea = toNumber(previous?.area_sqm);
    const newArea = toNumber(record.area_sqm);
    const changes = previous ? [
      changedField('Parcel name', toText(previous.parcel_name), toText(record.parcel_name)),
      changedField('Owner / recorded person', toText(previous.owner_or_recorded_person), toText(record.owner_or_recorded_person)),
      changedField('Area', previousArea, newArea),
      changedField('Status', toText(previous.status), toText(record.status)),
      changedField('Verification', toText(previous.verification_state), toText(record.verification_state)),
      changedField('Coordinate system', toText(previous.coordinate_system), toText(record.coordinate_system))
    ].filter(Boolean) : [];

    const hasAreaComparison = previousArea !== null && newArea !== null;

    return {
      id: `history:${canonicalId}:${record.year}:${index}`,
      year: toNumber(record.year),
      dateLabel: toText(record.year) || null,
      eventType: toText(record.event_type),
      type: historyEventType(record, previous),
      title: toText(record.event_type),
      parcelId: canonicalId,
      source: FILES.history,
      summary: toText(record.event_note) || null,
      status: toText(record.status) || null,
      changes,
      attributes: [
        attribute('Parcel name', toText(record.parcel_name)),
        attribute('Owner / recorded person', toText(record.owner_or_recorded_person)),
        attribute('Area', newArea),
        attribute('Status', toText(record.status)),
        attribute('Verification', toText(record.verification_state))
      ].filter(Boolean),
      geometry: hasAreaComparison ? {
        previousAreaSqM: previousArea,
        newAreaSqM: newArea,
        deltaSqM: Number((newArea - previousArea).toFixed(4)),
        shapeChanged: toText(previous.geometry_wkt_epsg4326) !== toText(record.geometry_wkt_epsg4326)
      } : null,
      evidence: {
        recordType: toText(record.event_type) || null,
        verificationState: toText(record.verification_state) || null,
        coordinateSystem: toText(record.coordinate_system) || null,
        geometryWkt: toText(record.geometry_wkt_epsg4326) || null,
        conflictType: toText(record.primary_conflict_type) || null
      }
    };
  });
}

function revenueEvents(canonicalId) {
  return getRecords('revenue', canonicalId).map((record) => {
    const recordId = toText(record.revenue_record_id);
    const date = toText(record.mutation_date) || null;
    return {
      id: `revenue:${recordId}`,
      date,
      dateLabel: date || toText(record.record_year) || null,
      year: yearFrom(date || record.record_year),
      eventType: 'revenue_mutation',
      type: 'revenue',
      title: toText(record.mutation_no),
      parcelId: canonicalId,
      source: getSourceLabel(0, FILES.revenue),
      summary: toText(record.notes) || null,
      recordId: recordId || null,
      attributes: [
        attribute('Owner', toText(record.land_owner)),
        attribute('Area', toNumber(record.recorded_area_sqm)),
        attribute('Land class', toText(record.land_class)),
        attribute('Digitization', toText(record.digitization_status))
      ].filter(Boolean),
      changes: [],
      evidence: {
        recordType: toText(record.source_document) || null,
        verificationState: toText(record.field_verified) || null,
        conflictType: toText(record.primary_conflict_type) || null
      }
    };
  });
}

function registrationEvents(canonicalId) {
  return getRecords('registration', canonicalId).map((record) => {
    const recordId = toText(record.registration_id);
    const date = toText(record.registration_date) || null;
    const seller = toText(record.seller_name);
    const buyer = toText(record.buyer_name);
    return {
      id: `registration:${recordId}`,
      date,
      dateLabel: date || toText(record.record_year) || null,
      year: yearFrom(date || record.record_year),
      eventType: 'registration_update',
      type: 'registration',
      title: toText(record.deed_type),
      parcelId: canonicalId,
      source: getSourceLabel(1, FILES.registration),
      summary: toText(record.notes) || null,
      recordId: recordId || null,
      attributes: [
        attribute('Buyer', buyer),
        attribute('Seller', seller),
        attribute('Transaction area', toNumber(record.transaction_area_sqm)),
        attribute('Deed number', toText(record.deed_no))
      ].filter(Boolean),
      changes: seller && buyer && seller !== buyer
        ? [changedField('Registered person', seller, buyer)]
        : [],
      evidence: {
        recordType: toText(record.deed_type) || null,
        verificationState: toText(record.document_verified) || null,
        conflictType: toText(record.primary_conflict_type) || null
      }
    };
  });
}

function surveyEvents(canonicalId) {
  return getRecords('survey', canonicalId).map((record) => {
    const recordId = toText(record.survey_record_id);
    const date = toText(record.survey_date) || null;
    const area = toNumber(record.measured_area_sqm);
    return {
      id: `survey:${recordId}`,
      date,
      dateLabel: date,
      year: yearFrom(date),
      eventType: 'survey_update',
      type: 'survey',
      title: toText(record.survey_method),
      parcelId: canonicalId,
      source: getSourceLabel(2, FILES.survey),
      summary: toText(record.notes) || null,
      recordId: recordId || null,
      attributes: [
        attribute('Recorded person', toText(record.recorded_person)),
        attribute('Person role', toText(record.person_role)),
        attribute('Measured area', area),
        attribute('Topology', toText(record.topology_status))
      ].filter(Boolean),
      changes: [],
      geometry: area !== null ? { newAreaSqM: area } : null,
      evidence: {
        recordType: toText(record.survey_method) || null,
        verificationState: toText(record.field_verified) || null,
        coordinateSystem: toText(record.coordinate_system) || null,
        geometryWkt: toText(record.display_geometry_wkt_epsg4326) || null,
        conflictType: toText(record.primary_conflict_type) || null
      }
    };
  });
}

function ulbEvents(canonicalId) {
  return getRecords('ulb', canonicalId).map((record) => {
    const recordId = toText(record.mcd_property_id);
    const dateLabel = toText(record.assessment_year) || null;
    return {
      id: `ulb:${canonicalId}:${recordId}`,
      dateLabel,
      year: yearFrom(dateLabel),
      eventType: 'ulb_record_update',
      type: 'ulb',
      title: toText(record.mutation_status),
      parcelId: canonicalId,
      source: getSourceLabel(3, FILES.ulb),
      summary: toText(record.notes) || null,
      recordId: recordId || null,
      attributes: [
        attribute('Holder', toText(record.primary_holder)),
        attribute('Holder role', toText(record.holder_role)),
        attribute('Plot area', toNumber(record.plot_area_sqm)),
        attribute('Property use', toText(record.property_use))
      ].filter(Boolean),
      changes: [],
      evidence: {
        recordType: toText(record.mutation_status) || null,
        verificationState: toText(record.field_verified) || null,
        conflictType: toText(record.primary_conflict_type) || null
      }
    };
  });
}

function planningEvents(canonicalId) {
  return getRecords('planning', canonicalId).map((record) => {
    const recordId = toText(record.dda_planning_id);
    const dateLabel = toText(record.plan_year) || null;
    return {
      id: `planning:${recordId}`,
      dateLabel,
      year: yearFrom(dateLabel),
      eventType: 'planning_update',
      type: 'planning',
      title: toText(record.approval_status),
      parcelId: canonicalId,
      source: getSourceLabel(4, FILES.planning),
      summary: toText(record.notes) || null,
      recordId: recordId || null,
      attributes: [
        attribute('Planning zone', toText(record.planning_zone)),
        attribute('Land use zone', toText(record.land_use_zone)),
        attribute('Designation', toText(record.master_plan_designation)),
        attribute('Reservation', toText(record.reservation_status))
      ].filter(Boolean),
      changes: [],
      evidence: {
        recordType: toText(record.source_plan) || null,
        verificationState: toText(record.approval_status) || null,
        conflictType: toText(record.primary_conflict_type) || null
      }
    };
  });
}

function compareEvents(left, right) {
  const yearDifference = (left.year ?? Number.MAX_SAFE_INTEGER) - (right.year ?? Number.MAX_SAFE_INTEGER);
  if (yearDifference) return yearDifference;
  const dateDifference = toText(left.date).localeCompare(toText(right.date));
  if (dateDifference) return dateDifference;
  return left.id.localeCompare(right.id);
}

function getParcelTimeline(parcelId) {
  const canonicalId = toText(parcelId);
  const parcel = getParcel(canonicalId);
  if (!parcel) return null;
  const events = [
    ...historyEvents(canonicalId),
    ...revenueEvents(canonicalId),
    ...registrationEvents(canonicalId),
    ...surveyEvents(canonicalId),
    ...ulbEvents(canonicalId),
    ...planningEvents(canonicalId)
  ].sort(compareEvents);

  return {
    parcel: {
      id: parcel.id,
      canonicalId: parcel.canonicalId,
      parcelName: parcel.parcelName,
      currentOwner: parcel.currentOwner,
      currentAreaSqM: parcel.currentAreaSqM,
      status: parcel.status,
      confidence: parcel.confidence,
      geometry: parcel.geometry
    },
    lineage: explicitLineage(parcel),
    events
  };
}

module.exports = { getParcelTimeline, listTimelineParcels };
