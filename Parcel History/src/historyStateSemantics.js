export function hasExplicitAuthorityEvidence(state) {
  return Boolean(
    state
    && state.stateType === 'CURRENT_AUTHORITATIVE'
    && state.authorityStatus === 'AUTHORITATIVE'
    && state.geometry
    && state.geometry.geometryStatus === 'AUTHORITATIVE'
    && state.geometry.acceptedStatus === 'ACCEPTED'
    && state.sourceTable === 'CANONICAL_PARCELS'
  );
}

export function historicalStateForEvent(event, historicalStates = []) {
  if (!event || !Array.isArray(historicalStates) || historicalStates.length === 0) return null;

  const beforeGeometry = event.geometry_version_before || null;
  const afterGeometry = event.geometry_version_after || event.geometry?.geometryId || null;
  const beforeParcelVersion = event.parcel_version_before || null;
  const afterParcelVersion = event.parcel_version_after || null;

  const byBeforeGeometry = historicalStates.find((state) => state?.geometry?.geometryId && state.geometry.geometryId === beforeGeometry);
  if (byBeforeGeometry) return byBeforeGeometry;

  const byAfterGeometry = historicalStates.find((state) => state?.geometry?.geometryId && state.geometry.geometryId === afterGeometry);
  if (byAfterGeometry) return byAfterGeometry;

  // Retired parcel identities may not have a geometry-transition event. Their
  // recorded parcel version can still be inspected without promoting it to current.
  return historicalStates.find((state) => (
    state?.stateScope === 'RETIRED_PARCEL'
    && state.parcelVersion
    && (state.parcelVersion === beforeParcelVersion || state.parcelVersion === afterParcelVersion)
  )) || null;
}

export function proposalComparisons(current, proposal) {
  if (!current || !proposal) return [];
  const pairs = [
    ['areaSqM', 'Area'],
    ['owner', 'Recorded owner / holder'],
    ['landUse', 'Land use'],
    ['geometryId', 'Geometry']
  ];

  const currentValue = (key) => {
    if (key === 'geometryId') return current.geometry?.geometryId || null;
    return current[key] ?? null;
  };

  return pairs
    .map(([key, label]) => ({ key, label, current: currentValue(key), proposed: proposal[key] ?? null }))
    .filter((row) => row.proposed !== null && row.proposed !== '' && row.proposed !== row.current);
}
