function stripOuterParens(text) {
  let current = text.trim();
  while (current.startsWith('(') && current.endsWith(')')) {
    let depth = 0;
    let wrapsWholeExpression = true;
    for (let index = 0; index < current.length; index += 1) {
      const char = current[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      if (depth === 0 && index < current.length - 1) {
        wrapsWholeExpression = false;
        break;
      }
    }
    if (!wrapsWholeExpression) break;
    current = current.slice(1, -1).trim();
  }
  return current;
}

function unwrapOneOuterPair(text) {
  const current = text.trim();
  if (!current.startsWith('(') || !current.endsWith(')')) return current;
  let depth = 0;
  for (let index = 0; index < current.length; index += 1) {
    const char = current[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (depth === 0 && index < current.length - 1) return current;
  }
  return current.slice(1, -1).trim();
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

function parseCoordinatePair(text) {
  const values = text.trim().split(/\s+/).map(Number);
  if (values.length < 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) return null;
  return values;
}

function parseRing(text) {
  return splitTopLevel(stripOuterParens(text))
    .map(parseCoordinatePair)
    .filter(Boolean);
}

function parsePolygonBody(body) {
  const content = unwrapOneOuterPair(body);
  const ringTexts = splitTopLevel(content);
  const rings = ringTexts.map(parseRing).filter((ring) => ring.length >= 4);
  return rings.length ? rings : null;
}

export function parseWktGeometry(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const trimmed = wkt.trim();
  const typeMatch = trimmed.match(/^([A-Z]+)\s*(.*)$/i);
  if (!typeMatch) return null;

  const type = typeMatch[1].toUpperCase();
  const body = typeMatch[2].trim();

  if (type === 'POLYGON') {
    const coordinates = parsePolygonBody(body);
    return coordinates ? { type: 'Polygon', coordinates } : null;
  }

  if (type === 'MULTIPOLYGON') {
    const polygonTexts = splitTopLevel(unwrapOneOuterPair(body));
    const coordinates = polygonTexts
      .map((polygonText) => parsePolygonBody(polygonText))
      .filter(Boolean);
    return coordinates.length ? { type: 'MultiPolygon', coordinates } : null;
  }

  return null;
}

export function geometryBounds(geometry) {
  if (!geometry?.coordinates) return null;
  const points = [];

  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      points.push(value);
      return;
    }
    value.forEach(visit);
  };

  visit(geometry.coordinates);
  if (!points.length) return null;

  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
