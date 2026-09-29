const fs = require('fs');
const path = require('path');

const DATASET_DIR = path.resolve(__dirname, '../../dataset');

function findDatasetFile(prefix, extension) {
  const matches = fs.readdirSync(DATASET_DIR)
    .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith(extension));

  if (matches.length !== 1) {
    throw new Error(`Expected one shared Dataset file matching ${prefix}*${extension}; found ${matches.length}.`);
  }

  return matches[0];
}

const FILES = Object.freeze({
  revenue: findDatasetFile('01_revenue_land_records_', '.csv'),
  registration: findDatasetFile('02_registration_stamps_', '.csv'),
  survey: findDatasetFile('03_survey_data_', '.csv'),
  ulb: findDatasetFile('04_mcd_ulb_', '.csv'),
  planning: findDatasetFile('05_dda_planning_', '.csv'),
  parcels: findDatasetFile('06_parcels_', '.geojson'),
  history: findDatasetFile('09_timeline_history_', '.csv'),
  sourceQuality: findDatasetFile('11_source_quality', '.csv')
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }

  const [rawHeaders = [], ...records] = rows;
  const headers = rawHeaders.map((header, index) => (
    index === 0 ? header.replace(/^\uFEFF/, '') : header
  ));

  return records
    .filter((record) => record.some((cell) => cell !== ''))
    .map((record) => Object.fromEntries(
      headers.map((header, index) => [header, record[index] ?? ''])
    ));
}

function readCsv(fileName) {
  return parseCsv(fs.readFileSync(path.join(DATASET_DIR, fileName), 'utf8'));
}

function loadDataset() {
  const geojson = JSON.parse(
    fs.readFileSync(path.join(DATASET_DIR, FILES.parcels), 'utf8')
  );

  return {
    revenue: readCsv(FILES.revenue),
    registration: readCsv(FILES.registration),
    survey: readCsv(FILES.survey),
    ulb: readCsv(FILES.ulb),
    planning: readCsv(FILES.planning),
    parcels: Array.isArray(geojson.features) ? geojson.features : [],
    history: readCsv(FILES.history),
    sourceQuality: readCsv(FILES.sourceQuality)
  };
}

const normalizeText = (value) => String(value ?? '').trim();

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function indexRecords(records) {
  const index = new Map();
  records.forEach((record) => {
    const canonicalId = normalizeText(record.canonical_id);
    if (!canonicalId) return;
    if (!index.has(canonicalId)) index.set(canonicalId, []);
    index.get(canonicalId).push(record);
  });
  return index;
}

function normalizeParcel(feature) {
  const properties = feature?.properties || {};
  const canonicalId = normalizeText(properties.canonical_id);
  if (!canonicalId) return null;

  return {
    id: normalizeText(properties.parcel_id) || null,
    canonicalId,
    parcelName: normalizeText(properties.parcel_name) || null,
    currentOwner: normalizeText(properties.current_owner) || null,
    currentAreaSqM: normalizeNumber(properties.area_sqm),
    status: normalizeText(properties.harmonization_status) || null,
    confidence: normalizeNumber(properties.confidence),
    mergeGroup: normalizeText(properties.merge_group) || null,
    geometry: feature.geometry || null
  };
}

const dataset = loadDataset();
const parcels = dataset.parcels.map(normalizeParcel).filter(Boolean);
const parcelsByCanonicalId = new Map(parcels.map((parcel) => [parcel.canonicalId, parcel]));
const parcelsByMergeGroup = new Map();
parcels.forEach((parcel) => {
  if (!parcel.mergeGroup) return;
  if (!parcelsByMergeGroup.has(parcel.mergeGroup)) parcelsByMergeGroup.set(parcel.mergeGroup, []);
  parcelsByMergeGroup.get(parcel.mergeGroup).push(parcel);
});

const recordsBySource = Object.fromEntries(
  ['revenue', 'registration', 'survey', 'ulb', 'planning', 'history']
    .map((source) => [source, indexRecords(dataset[source])])
);

function getParcel(canonicalId) {
  return parcelsByCanonicalId.get(normalizeText(canonicalId)) || null;
}

function getRecords(source, canonicalId) {
  return recordsBySource[source]?.get(normalizeText(canonicalId)) || [];
}

function getMergeGroupMembers(groupId) {
  return parcelsByMergeGroup.get(normalizeText(groupId)) || [];
}

function getSourceLabel(index, fileName) {
  return normalizeText(dataset.sourceQuality[index]?.source) || fileName;
}

module.exports = {
  DATASET_DIR,
  FILES,
  dataset,
  getMergeGroupMembers,
  getParcel,
  getRecords,
  getSourceLabel,
  listParcels: () => parcels,
  normalizeNumber,
  normalizeText
};
