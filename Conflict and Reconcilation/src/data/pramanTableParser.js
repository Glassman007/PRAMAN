import { parseCsv } from './csv.js';
import { TABLE_DEFINITIONS } from './pramanDatasetConfig.js';

function isEmptyCell(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function parseNumber(value, field, tableKey, rowNumber, warn) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  warn(`${tableKey} row ${rowNumber}: ${field} is not a valid number (${JSON.stringify(value)}).`);
  return null;
}

function parseBoolean(value, field, tableKey, rowNumber, warn) {
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  warn(`${tableKey} row ${rowNumber}: ${field} is not a recognized Boolean (${JSON.stringify(value)}).`);
  return null;
}

function parseJson(value, field, tableKey, rowNumber, warn) {
  try {
    return JSON.parse(value);
  } catch (error) {
    warn(`${tableKey} row ${rowNumber}: ${field} contains invalid JSON (${error.message}).`);
    return null;
  }
}

function parseList(value) {
  return String(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parsePramanTable(tableKey, csvText, options = {}) {
  const definition = TABLE_DEFINITIONS[tableKey];
  if (!definition) throw new Error(`Unknown PRAMAN table key: ${tableKey}`);

  const warnings = [];
  const externalWarn = typeof options.onWarning === 'function' ? options.onWarning : null;
  const warn = (message) => {
    warnings.push(message);
    externalWarn?.(message);
  };

  const numberFields = new Set(definition.numberFields ?? []);
  const booleanFields = new Set(definition.booleanFields ?? []);
  const jsonFields = new Set(definition.jsonFields ?? []);
  const listFields = new Set(definition.listFields ?? []);

  const rawRows = parseCsv(csvText);
  const rows = rawRows.map((rawRow, index) => {
    const rowNumber = index + 2;
    const normalized = {};

    for (const [field, rawValue] of Object.entries(rawRow)) {
      if (isEmptyCell(rawValue)) {
        normalized[field] = listFields.has(field) ? [] : null;
      } else if (numberFields.has(field)) {
        normalized[field] = parseNumber(rawValue, field, tableKey, rowNumber, warn);
      } else if (booleanFields.has(field)) {
        normalized[field] = parseBoolean(rawValue, field, tableKey, rowNumber, warn);
      } else if (jsonFields.has(field)) {
        normalized[field] = parseJson(rawValue, field, tableKey, rowNumber, warn);
      } else if (listFields.has(field)) {
        normalized[field] = parseList(rawValue);
      } else {
        normalized[field] = rawValue;
      }
    }

    // Exact source strings remain available for faithful display/debugging.
    normalized.__raw = Object.freeze({ ...rawRow });
    return normalized;
  });

  return { rows, warnings };
}
