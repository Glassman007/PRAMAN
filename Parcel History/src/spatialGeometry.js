function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parsePolygonWkt(wkt) {
  if (!wkt || typeof wkt !== 'string') return [];
  const match = wkt.trim().match(/^POLYGON\s*\(\((.*)\)\)\s*$/i);
  if (!match) return [];

  const rings = match[1]
    .split(/\)\s*,\s*\(/)
    .map((ringText) => ringText
      .split(',')
      .map((pair) => pair.trim().split(/\s+/).slice(0, 2).map(Number))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      .map(([x, y]) => ({ x, y })))
    .filter((ring) => ring.length >= 3);

  return rings;
}

export function boundsForRings(rings) {
  const points = rings.flat();
  if (!points.length) return null;
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  });
}

export function mergeBounds(boundsList) {
  const valid = boundsList.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((combined, bounds) => ({
    minX: Math.min(combined.minX, bounds.minX),
    maxX: Math.max(combined.maxX, bounds.maxX),
    minY: Math.min(combined.minY, bounds.minY),
    maxY: Math.max(combined.maxY, bounds.maxY)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  });
}

export function ringsToSvgPath(rings, bounds, width = 320, height = 180, padding = 18) {
  if (!rings.length || !bounds) return '';
  const spanX = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const spanY = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
  const usableWidth = Math.max(width - (padding * 2), 1);
  const usableHeight = Math.max(height - (padding * 2), 1);
  const scale = Math.min(usableWidth / spanX, usableHeight / spanY);
  const renderedWidth = spanX * scale;
  const renderedHeight = spanY * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;

  const project = ({ x, y }) => ({
    x: offsetX + ((x - bounds.minX) * scale),
    y: height - (offsetY + ((y - bounds.minY) * scale))
  });

  return rings.map((ring) => {
    const projected = ring.map(project);
    return projected.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ') + ' Z';
  }).join(' ');
}

export function selectGeometryRefFromParcelDetail(detail, eventDate = null) {
  if (!detail || typeof detail !== 'object') return null;

  const candidates = [];
  if (detail.currentAuthoritative?.geometry?.geometryId) {
    candidates.push({
      parcelId: detail.currentAuthoritative.parcelId || detail.parcel?.parcelId || null,
      geometryId: detail.currentAuthoritative.geometry.geometryId,
      version: detail.currentAuthoritative.geometry.version || detail.currentAuthoritative.authoritativeGeometryVersion || null,
      stateType: 'CURRENT_AUTHORITATIVE',
      effectiveDate: detail.currentAuthoritative.geometry.effectiveDate || detail.currentAuthoritative.effectiveDate || null
    });
  }

  for (const state of detail.historicalStates || []) {
    if (!state?.geometry?.geometryId) continue;
    candidates.push({
      parcelId: state.parcelId || detail.parcel?.parcelId || null,
      geometryId: state.geometry.geometryId,
      version: state.geometryVersion || state.geometry.version || null,
      stateType: 'HISTORICAL',
      effectiveDate: state.effectiveDate || state.geometry.effectiveDate || null
    });
  }

  if (!candidates.length) return null;
  if (!eventDate) return candidates.find((candidate) => candidate.stateType === 'CURRENT_AUTHORITATIVE') || candidates[0];

  const target = String(eventDate).slice(0, 10);
  const datedEligible = candidates
    .filter((candidate) => candidate.effectiveDate && String(candidate.effectiveDate).slice(0, 10) <= target)
    .sort((left, right) => String(right.effectiveDate).localeCompare(String(left.effectiveDate)));
  if (datedEligible.length) return datedEligible[0];

  // If the source does not provide a geometry effective on/before the event,
  // return an undated recorded geometry only. Do not substitute a later shape.
  return candidates.find((candidate) => !candidate.effectiveDate) || null;
}

export function areaDifference(before, after) {
  const beforeNumber = normalizeNumber(before);
  const afterNumber = normalizeNumber(after);
  if (beforeNumber === null || afterNumber === null) return null;
  return Math.round((afterNumber - beforeNumber) * 100) / 100;
}
