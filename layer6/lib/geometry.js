const turf = require('@turf/turf');
const proj4 = require('proj4');

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function looksLikeLngLat(coord) {
  return Array.isArray(coord) && coord.length >= 2 && isFiniteNumber(coord[0]) && isFiniteNumber(coord[1]) && Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90;
}

function flattenCoordinates(coords, out = []) {
  if (!Array.isArray(coords)) return out;
  if (coords.length >= 2 && isFiniteNumber(coords[0]) && isFiniteNumber(coords[1])) {
    out.push(coords);
    return out;
  }
  for (const child of coords) flattenCoordinates(child, out);
  return out;
}

function normalizeCrsName(value) {
  if (!value) return null;
  const text = String(value).trim().toUpperCase();
  const match = text.match(/EPSG[^0-9]*(\d{4,6})/);
  if (match) return `EPSG:${match[1]}`;
  if (/^\d{4,6}$/.test(text)) return `EPSG:${text}`;
  return text;
}

function transformCoordinate(coord, crs) {
  if (looksLikeLngLat(coord)) return [coord[0], coord[1]];
  const normalized = normalizeCrsName(crs);
  if (!normalized) return coord;
  try {
    return proj4(normalized, 'EPSG:4326', [coord[0], coord[1]]);
  } catch {
    return coord;
  }
}

function transformCoords(coords, crs) {
  if (!Array.isArray(coords)) return coords;
  if (coords.length >= 2 && isFiniteNumber(coords[0]) && isFiniteNumber(coords[1])) {
    return transformCoordinate(coords, crs);
  }
  return coords.map((c) => transformCoords(c, crs));
}

function toFeature(input, crs) {
  if (!input) return null;
  let feature = null;
  if (input.type === 'Feature' && input.geometry) feature = JSON.parse(JSON.stringify(input));
  else if (input.type && input.coordinates) feature = turf.feature(JSON.parse(JSON.stringify(input)));
  else return null;

  if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return null;
  const coords = flattenCoordinates(feature.geometry.coordinates);
  const allLngLat = coords.length > 0 && coords.every(looksLikeLngLat);
  if (!allLngLat && crs) {
    feature.geometry.coordinates = transformCoords(feature.geometry.coordinates, crs);
  }
  const normalizedCoords = flattenCoordinates(feature.geometry.coordinates);
  if (!normalizedCoords.length || !normalizedCoords.every(looksLikeLngLat)) return null;
  return feature;
}

function polygonFromLatLngPoints(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const ring = points.map((p) => [Number(p.lng), Number(p.lat)]).filter(looksLikeLngLat);
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  try {
    return turf.polygon([ring]);
  } catch {
    return null;
  }
}

function safeArea(feature) {
  try {
    return feature ? turf.area(feature) : null;
  } catch {
    return null;
  }
}

function intersectionFeature(a, b) {
  try {
    if (!a || !b) return null;
    return turf.intersect(turf.featureCollection([a, b]));
  } catch {
    return null;
  }
}

function geometrySimilarity(a, b) {
  if (!a || !b) return null;
  const areaA = safeArea(a);
  const areaB = safeArea(b);
  if (!areaA || !areaB) return null;
  const intersection = intersectionFeature(a, b);
  const interArea = safeArea(intersection) || 0;
  const union = areaA + areaB - interArea;
  if (union <= 0) return null;
  return Math.max(0, Math.min(1, interArea / union));
}

function ringVertices(feature) {
  if (!feature?.geometry) return [];
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const points = [];
  for (const polygon of polygons) {
    const outer = polygon?.[0] || [];
    for (let i = 0; i < Math.max(0, outer.length - 1); i += 1) points.push(outer[i]);
  }
  return points;
}

function outerLine(feature) {
  if (!feature?.geometry) return null;
  try {
    if (feature.geometry.type === 'Polygon') return turf.lineString(feature.geometry.coordinates[0]);
    const lines = feature.geometry.coordinates.map((poly) => turf.lineString(poly[0]));
    return turf.multiLineString(lines.map((l) => l.geometry.coordinates));
  } catch {
    return null;
  }
}

function maxBoundaryDifferenceMeters(reference, field) {
  if (!reference || !field) return null;
  const refLine = outerLine(reference);
  const fieldLine = outerLine(field);
  if (!refLine || !fieldLine) return null;

  let max = { meters: 0, coordinate: null };
  const compare = (vertices, targetLine) => {
    for (const coord of vertices) {
      try {
        const km = turf.pointToLineDistance(turf.point(coord), targetLine, { units: 'kilometers' });
        const meters = km * 1000;
        if (meters > max.meters) max = { meters, coordinate: coord };
      } catch {}
    }
  };
  compare(ringVertices(reference), fieldLine);
  compare(ringVertices(field), refLine);
  return max.coordinate ? max : null;
}

function directionFromCentroid(feature, coordinate) {
  if (!feature || !coordinate) return null;
  try {
    const [cx, cy] = turf.centroid(feature).geometry.coordinates;
    const [x, y] = coordinate;
    const ns = y >= cy ? 'north' : 'south';
    const ew = x >= cx ? 'east' : 'west';
    return `${ns}-${ew}`;
  } catch {
    return null;
  }
}

function coordinatePrecisionMeters(feature) {
  const coords = ringVertices(feature);
  if (!coords.length) return null;
  const precisions = [];
  for (const coord of coords) {
    for (const value of coord.slice(0, 2)) {
      const s = String(value);
      const idx = s.indexOf('.');
      if (idx >= 0) precisions.push(s.length - idx - 1);
    }
  }
  if (!precisions.length) return null;
  precisions.sort((a, b) => a - b);
  const decimals = precisions[Math.floor(precisions.length / 2)];
  return 111320 / (10 ** decimals);
}

function geometryVertexCount(feature) {
  return ringVertices(feature).length;
}

module.exports = {
  toFeature,
  polygonFromLatLngPoints,
  safeArea,
  geometrySimilarity,
  maxBoundaryDifferenceMeters,
  directionFromCentroid,
  coordinatePrecisionMeters,
  geometryVertexCount,
  normalizeCrsName
};
