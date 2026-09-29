const EARTH_RADIUS_M = 6371008.8;
const COORD_TOLERANCE = 1e-9;

function exteriorRings(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates.length ? [geometry.coordinates[0]] : [];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon?.[0]).filter(Boolean);
  return [];
}

function segmentsForGeometry(geometry) {
  const segments = [];
  for (const ring of exteriorRings(geometry)) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const start = ring[index];
      const end = ring[index + 1];
      if (!start || !end) continue;
      segments.push({ start, end });
    }
  }
  return segments;
}

function midpoint(segment) {
  return [
    (segment.start[0] + segment.end[0]) / 2,
    (segment.start[1] + segment.end[1]) / 2,
  ];
}

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function pointSegmentDistance(point, segment) {
  const ax = segment.start[0];
  const ay = segment.start[1];
  const bx = segment.end[0];
  const by = segment.end[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.sqrt(squaredDistance(point, segment.start));
  const t = Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lengthSquared));
  const projection = [ax + t * dx, ay + t * dy];
  return Math.sqrt(squaredDistance(point, projection));
}

function nearestDistanceToGeometry(point, geometry) {
  const segments = segmentsForGeometry(geometry);
  if (!segments.length) return 0;
  return Math.min(...segments.map((segment) => pointSegmentDistance(point, segment)));
}

function metersBetween(a, b) {
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function degreeDistanceToMeters(distance, latitude) {
  const latitudeRadians = latitude * Math.PI / 180;
  const metresPerDegreeLat = Math.PI * EARTH_RADIUS_M / 180;
  const metresPerDegreeLon = metresPerDegreeLat * Math.cos(latitudeRadians);
  const blended = Math.sqrt((metresPerDegreeLat ** 2 + metresPerDegreeLon ** 2) / 2);
  return distance * blended;
}

function mostDisplacedSegment(entry, comparisonGeometry) {
  let best = null;
  for (const segment of segmentsForGeometry(entry.geometry)) {
    const mid = midpoint(segment);
    const distance = nearestDistanceToGeometry(mid, comparisonGeometry);
    if (!best || distance > best.distanceDegrees) {
      best = {
        ...segment,
        role: entry.role,
        geometryId: entry.geometryId,
        sourceType: entry.sourceType,
        distanceDegrees: distance,
        distanceMeters: degreeDistanceToMeters(distance, mid[1]),
      };
    }
  }
  return best;
}

export function deriveGeometryDiscrepancy(entries) {
  const sourceA = entries.find((entry) => entry.role === 'source-a' && entry.geometry);
  const sourceB = entries.find((entry) => entry.role === 'source-b' && entry.geometry);
  if (!sourceA || !sourceB) return null;

  const a = mostDisplacedSegment(sourceA, sourceB.geometry);
  const b = mostDisplacedSegment(sourceB, sourceA.geometry);
  const highlightedSegments = [a, b].filter((segment) => segment && segment.distanceDegrees > COORD_TOLERANCE);
  if (!highlightedSegments.length) return {
    sourceAId: sourceA.geometryId,
    sourceBId: sourceB.geometryId,
    highlightedSegments: [],
    maxSeparationMeters: 0,
  };

  return {
    sourceAId: sourceA.geometryId,
    sourceBId: sourceB.geometryId,
    highlightedSegments,
    maxSeparationMeters: Math.max(...highlightedSegments.map((segment) => segment.distanceMeters)),
  };
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function sharedCollinearPortion(a, b) {
  const ax = a.start[0];
  const ay = a.start[1];
  const avx = a.end[0] - ax;
  const avy = a.end[1] - ay;
  const aLengthSquared = avx * avx + avy * avy;
  if (aLengthSquared <= COORD_TOLERANCE ** 2) return null;

  const bvx = b.end[0] - b.start[0];
  const bvy = b.end[1] - b.start[1];
  const aLength = Math.sqrt(aLengthSquared);
  const bLength = Math.sqrt(bvx * bvx + bvy * bvy);
  if (bLength <= COORD_TOLERANCE) return null;

  if (Math.abs(cross(avx, avy, bvx, bvy)) > COORD_TOLERANCE * aLength * bLength) return null;
  const offsetX = b.start[0] - ax;
  const offsetY = b.start[1] - ay;
  if (Math.abs(cross(avx, avy, offsetX, offsetY)) > COORD_TOLERANCE * aLength) return null;

  const projection = (point) => ((point[0] - ax) * avx + (point[1] - ay) * avy) / aLengthSquared;
  const b0 = projection(b.start);
  const b1 = projection(b.end);
  const startT = Math.max(0, Math.min(b0, b1));
  const endT = Math.min(1, Math.max(b0, b1));
  if (endT - startT <= COORD_TOLERANCE) return null;

  const start = [ax + startT * avx, ay + startT * avy];
  const end = [ax + endT * avx, ay + endT * avy];
  return {
    start,
    end,
    lengthMeters: metersBetween(start, end),
  };
}

function boundsOverlap(a, b) {
  if (!a || !b) return false;
  return !(
    a.maxX < b.minX - COORD_TOLERANCE
    || b.maxX < a.minX - COORD_TOLERANCE
    || a.maxY < b.minY - COORD_TOLERANCE
    || b.maxY < a.minY - COORD_TOLERANCE
  );
}

export function deriveParcelTopologyImpact(model, parcelCase) {
  const targetVersion = parcelCase?.currentGeometry ?? parcelCase?.historicalGeometry ?? null;
  if (!targetVersion?.geometry) return { neighbours: [], sharedSegments: [] };

  const targetSegments = segmentsForGeometry(targetVersion.geometry);
  const targetBounds = targetVersion.geometryBounds ?? null;
  const neighbours = [];
  const sharedSegments = [];

  for (const parcel of model.tables.canonicalParcels ?? []) {
    if (parcel.canonical_parcel_id === parcelCase.parcelId) continue;
    const version = parcel.current_geometry_id ? model.geometryVersionById.get(parcel.current_geometry_id) : null;
    if (!version?.geometry || !boundsOverlap(targetBounds, version.geometryBounds)) continue;

    const matches = [];
    for (const targetSegment of targetSegments) {
      for (const candidateSegment of segmentsForGeometry(version.geometry)) {
        const shared = sharedCollinearPortion(targetSegment, candidateSegment);
        if (shared) matches.push(shared);
      }
    }

    if (!matches.length) continue;
    const totalSharedLengthMeters = matches.reduce((sum, match) => sum + match.lengthMeters, 0);
    neighbours.push({
      parcelId: parcel.canonical_parcel_id,
      landUse: parcel.land_use ?? null,
      propertyType: parcel.property_type ?? null,
      geometryId: version.geometry_id,
      sharedSegmentCount: matches.length,
      sharedLengthMeters: totalSharedLengthMeters,
    });
    for (const match of matches) {
      sharedSegments.push({ ...match, neighbourParcelId: parcel.canonical_parcel_id });
    }
  }

  neighbours.sort((left, right) => right.sharedLengthMeters - left.sharedLengthMeters || left.parcelId.localeCompare(right.parcelId));
  return { neighbours, sharedSegments };
}
