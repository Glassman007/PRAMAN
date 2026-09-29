export const splitIds = (value) => String(value ?? '')
  .split(';')
  .map((x) => x.trim())
  .filter(Boolean);

export const toNumber = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const toBoolean = (value) => {
  if (value === true || value === false) return value;
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
};

export function parseJson(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { __raw: raw, __parseError: true }; }
}

export const countBy = (items, selector) => {
  const out = {};
  for (const item of items) {
    const key = selector(item) ?? 'UNKNOWN';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

export const unique = (values) => [...new Set(values)];

export function indexUnique(rows, key, diagnostics, tableName) {
  const map = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!id) {
      diagnostics.push(issue('ERROR', 'MISSING_PRIMARY_ID', tableName, null, `Missing ${key}`));
      continue;
    }
    if (map.has(id)) diagnostics.push(issue('ERROR', 'DUPLICATE_PRIMARY_ID', tableName, id, `Duplicate ${key}=${id}`));
    else map.set(id, row);
  }
  return map;
}

export function groupBy(rows, selector) {
  const map = new Map();
  for (const row of rows) {
    const key = selector(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export function issue(severity, code, table, recordId, message, details = null) {
  return { severity, code, table, recordId: recordId ?? null, message, details };
}

export function stableEdgeId(type, from, to, qualifier = '') {
  return `edge:${type}:${from}->${to}${qualifier ? `:${qualifier}` : ''}`;
}

export function metadataRef(table, recordId, field = null) {
  return { table, recordId: recordId ?? null, field };
}
