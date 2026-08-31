const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const {
  toFeature,
  geometrySimilarity,
  safeArea,
  normalizeCrsName
} = require('./geometry');

const DATA_EXTENSIONS = new Set(['.json', '.geojson', '.csv']);

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function recursiveFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...recursiveFiles(full));
    else if (DATA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function readFileRecords(file) {
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return [];
  if (ext === '.csv') return parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const parsed = JSON.parse(raw);
  if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) return parsed.features;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const key of ['parcels', 'records', 'data', 'features', 'conflicts', 'items']) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    return [parsed];
  }
  return [];
}

function objectEntriesDeep(obj, prefix = '', maxDepth = 4, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return [];
  const source = obj.type === 'Feature' && obj.properties ? { ...obj.properties, geometry: obj.geometry } : obj;
  const entries = [];
  for (const [key, value] of Object.entries(source)) {
    const p = prefix ? `${prefix}.${key}` : key;
    entries.push([p, value]);
    if (value && typeof value === 'object' && !Array.isArray(value) && key !== 'geometry') {
      entries.push(...objectEntriesDeep(value, p, maxDepth, depth + 1));
    }
  }
  return entries;
}

function pickByKeys(obj, candidates) {
  const wanted = new Set(candidates.map(normalizeKey));
  for (const [key, value] of objectEntriesDeep(obj)) {
    if (wanted.has(normalizeKey(key.split('.').pop())) && value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function pickByKeyFragments(obj, fragments) {
  const normalizedFragments = fragments.map(normalizeKey);
  for (const [key, value] of objectEntriesDeep(obj)) {
    const nk = normalizeKey(key);
    if (normalizedFragments.some((fragment) => nk.includes(fragment)) && value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function detectParcelId(record) {
  return pickByKeys(record, [
    'parcel_id', 'parcelid', 'parcel_no', 'parcelno', 'plot_id', 'plotid', 'plot_no', 'plotno',
    'property_id', 'propertyid', 'khasra_no', 'khasrano', 'canonical_parcel_id', 'id'
  ]);
}

function detectSource(file, record) {
  const explicit = pickByKeys(record, ['source', 'department', 'agency', 'record_source', 'dataset', 'source_type']);
  const text = `${explicit || ''} ${file}`.toLowerCase();
  if (/(revenue|land.?record|bhulekh|jamabandi)/.test(text)) return 'revenue';
  if (/(registration|stamp|registry|registrar)/.test(text)) return 'registration';
  if (/(survey|cadastral)/.test(text)) return 'survey';
  if (/(mcd|municipal|urban.?local|ulb)/.test(text)) return 'mcd';
  if (/(dda|planning|development.?authority)/.test(text)) return 'dda';
  if (/(canonical|unified|master.?parcel)/.test(text)) return 'canonical';
  if (/(geojson|\bgis\b|spatial|geometry)/.test(text)) return 'gis';
  return explicit ? String(explicit) : path.basename(file, path.extname(file));
}

function detectCrs(record) {
  const value = pickByKeys(record, ['crs', 'epsg', 'coordinate_system', 'coordinatesystem', 'srs', 'srid']);
  return normalizeCrsName(value);
}

function detectGeometry(record) {
  if (record?.type === 'Feature' && record.geometry) return toFeature(record, detectCrs(record));
  const geometry = pickByKeys(record, ['geometry', 'geom', 'polygon', 'boundary', 'parcel_geometry']);
  if (geometry && typeof geometry === 'object') return toFeature(geometry.type === 'Feature' ? geometry : geometry, detectCrs(record));
  return null;
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const m = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return null;
}

function normalizeConfidence(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 0 && n <= 1) return n;
  if (n > 1 && n <= 100) return n / 100;
  return null;
}

function detectConfidence(record) {
  return normalizeConfidence(pickByKeys(record, ['confidence', 'confidence_score', 'confidencescore', 'trust_score', 'trustscore', 'data_trust']));
}

function detectOwner(record) {
  return pickByKeys(record, ['owner', 'owner_name', 'ownername', 'land_owner', 'landowner', 'registered_owner', 'registeredowner', 'name_of_owner']);
}

function detectAddress(record) {
  return pickByKeys(record, ['address', 'parcel_address', 'property_address', 'site_address', 'location', 'locality_address']);
}

function detectArea(record, feature) {
  const explicit = asNumber(pickByKeys(record, ['area_sqm', 'areasqm', 'area_m2', 'aream2', 'area_sq_m', 'parcel_area', 'area']));
  if (explicit !== null) return explicit;
  return safeArea(feature);
}

function detectLastVerified(record) {
  return pickByKeys(record, ['last_verified_date', 'lastverifieddate', 'verified_date', 'verification_date', 'field_verified_date', 'survey_date', 'last_survey_date']);
}

function detectAssignee(record) {
  return pickByKeys(record, ['assignee', 'assigned_to', 'assignedto', 'survey_team', 'surveyor', 'field_team']);
}

function detectStatus(record) {
  return pickByKeys(record, ['field_verification_status', 'verification_status', 'survey_status']);
}

function detectPriority(record) {
  return pickByKeys(record, ['priority', 'severity', 'risk', 'conflict_severity']);
}

function detectConflictValues(record) {
  const values = [];
  for (const [key, value] of objectEntriesDeep(record)) {
    if (!/(conflict|mismatch|dispute|issue|error|overlap|gap|split|merge)/i.test(key)) continue;
    if (Array.isArray(value)) values.push(...value.map(String));
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values.push(String(value));
  }
  return values.filter((v) => v && !/^(false|0|none|null|no)$/i.test(v.trim()));
}

function mode(values) {
  const filtered = values.filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
  if (!filtered.length) return null;
  const counts = new Map();
  for (const value of filtered) {
    const key = String(value).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function selectGeometry(records, sourceName) {
  const exact = records.filter((r) => r.source === sourceName && r.geometry).map((r) => r.geometry);
  return exact[0] || null;
}

function canonicalGeometry(records) {
  return selectGeometry(records, 'canonical') || selectGeometry(records, 'gis') || records.find((r) => r.geometry)?.geometry || null;
}

function deriveConfidence(records, geometries) {
  const explicit = records.map((r) => r.confidence).filter((v) => v !== null);
  if (explicit.length) return explicit.reduce((a, b) => a + b, 0) / explicit.length;
  const geoms = Object.values(geometries).filter(Boolean);
  const similarities = [];
  for (let i = 0; i < geoms.length; i += 1) {
    for (let j = i + 1; j < geoms.length; j += 1) {
      const s = geometrySimilarity(geoms[i], geoms[j]);
      if (s !== null) similarities.push(s);
    }
  }
  return similarities.length ? similarities.reduce((a, b) => a + b, 0) / similarities.length : null;
}

function classifyConflict(records, geometries) {
  const raw = records.flatMap((r) => r.conflicts).join(' ').toLowerCase();
  if (/owner|ownership|name/.test(raw)) return 'Ownership Conflict';
  if (/boundary|geometry|overlap|gap|topolog|coordinate|split|merge|area/.test(raw)) return 'Boundary Conflict';
  if (raw.trim()) return 'Record Conflict';

  const owners = new Set(records.map((r) => r.owner).filter(Boolean).map((v) => String(v).trim().toLowerCase()));
  if (owners.size > 1) return 'Ownership Conflict';
  const canonical = geometries.canonical;
  for (const geom of [geometries.revenue, geometries.survey].filter(Boolean)) {
    if (canonical) {
      const s = geometrySimilarity(canonical, geom);
      if (s !== null && s < 0.999999) return 'Boundary Conflict';
    }
  }
  return null;
}

function buildParcelModel(parcelId, records) {
  const geometries = {
    canonical: canonicalGeometry(records),
    revenue: selectGeometry(records, 'revenue'),
    survey: selectGeometry(records, 'survey')
  };
  const areaValues = records.map((r) => r.area).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return {
    parcelId: String(parcelId),
    owner: mode(records.map((r) => r.owner)),
    address: mode(records.map((r) => r.address)),
    areaSqm: areaValues.length ? areaValues.reduce((a, b) => a + b, 0) / areaValues.length : safeArea(geometries.canonical),
    confidence: deriveConfidence(records, geometries),
    lastVerifiedDate: mode(records.map((r) => r.lastVerifiedDate)),
    datasetAssignee: mode(records.map((r) => r.assignee)),
    datasetStatus: mode(records.map((r) => r.status)),
    datasetPriority: mode(records.map((r) => r.priority)),
    conflictType: classifyConflict(records, geometries),
    conflicts: [...new Set(records.flatMap((r) => r.conflicts))],
    geometries,
    sources: [...new Set(records.map((r) => r.source))],
    sourceRecords: records.map((r) => ({
      source: r.source,
      file: r.relativeFile,
      owner: r.owner,
      areaSqm: r.area,
      confidence: r.confidence,
      lastVerifiedDate: r.lastVerifiedDate,
      crs: r.crs
    }))
  };
}

class DatasetRepository {
  constructor(datasetDir) {
    this.datasetDir = datasetDir;
    this.cache = null;
    this.cacheStamp = null;
  }

  fingerprint(files) {
    return files.map((f) => `${f}:${fs.statSync(f).mtimeMs}:${fs.statSync(f).size}`).join('|');
  }

  load() {
    const files = recursiveFiles(this.datasetDir);
    if (!files.length) {
      const err = new Error(`No JSON, GeoJSON, or CSV files found in shared dataset directory: ${this.datasetDir}`);
      err.code = 'DATASET_EMPTY';
      throw err;
    }
    const stamp = this.fingerprint(files);
    if (this.cache && this.cacheStamp === stamp) return this.cache;

    const grouped = new Map();
    for (const file of files) {
      let records;
      try {
        records = readFileRecords(file);
      } catch (error) {
        console.warn(`Skipping unreadable dataset file ${file}: ${error.message}`);
        continue;
      }
      for (const record of records) {
        const parcelId = detectParcelId(record);
        if (parcelId === null || parcelId === undefined || String(parcelId).trim() === '') continue;
        const geometry = detectGeometry(record);
        const normalized = {
          raw: record,
          relativeFile: path.relative(this.datasetDir, file),
          source: detectSource(file, record),
          crs: detectCrs(record),
          geometry,
          confidence: detectConfidence(record),
          owner: detectOwner(record),
          address: detectAddress(record),
          area: detectArea(record, geometry),
          lastVerifiedDate: detectLastVerified(record),
          assignee: detectAssignee(record),
          status: detectStatus(record),
          priority: detectPriority(record),
          conflicts: detectConflictValues(record)
        };
        const key = String(parcelId);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(normalized);
      }
    }

    const parcels = [...grouped.entries()].map(([parcelId, records]) => buildParcelModel(parcelId, records));
    if (!parcels.length) {
      const err = new Error('Dataset files were found, but no parcel identifiers could be detected. Expected fields such as parcel_id, parcelId, plot_id, khasra_no, or id.');
      err.code = 'DATASET_SCHEMA';
      throw err;
    }
    this.cache = parcels;
    this.cacheStamp = stamp;
    return parcels;
  }

  all() {
    return this.load();
  }

  get(parcelId) {
    return this.load().find((p) => p.parcelId === String(parcelId)) || null;
  }
}

module.exports = { DatasetRepository };
