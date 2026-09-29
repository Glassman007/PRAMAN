import { REQUIRED_PRODUCTION_PATHS, TABLE_DEFINITIONS } from './pramanDatasetConfig.js';
import { buildPramanDataModel, reportValidationIssues, validatePramanDataModel } from './pramanDataModel.js';
import { parsePramanTable } from './pramanTableParser.js';

const appBase = import.meta.env?.BASE_URL ?? '/';
const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`;
const manifestUrl = `${normalizedBase}data-manifest.json`;
const dataRoot = `${normalizedBase}data/PRAMAN_DATA/`;
let runtimePromise;
let manifestPromise;

export async function loadDatasetManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(manifestUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Dataset manifest unavailable (${response.status}).`);
      const manifest = await response.json();
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      if (files.some((file) => file.includes('99 Eval only'))) {
        throw new Error('Evaluation-only material must not be exposed to the application.');
      }
      const available = new Set(files);
      const missing = REQUIRED_PRODUCTION_PATHS.filter((path) => !available.has(path));
      if (missing.length) {
        throw new Error(`Production dataset manifest is missing required table(s): ${missing.join(', ')}`);
      }
      return files;
    });
  }
  return manifestPromise;
}

async function fetchTable(tableKey, definition, parseWarnings) {
  const response = await fetch(encodeURI(`${dataRoot}${definition.path}`));
  if (!response.ok) throw new Error(`${definition.path} unavailable (${response.status}).`);
  const result = parsePramanTable(tableKey, await response.text(), {
    onWarning: (message) => parseWarnings.push(message),
  });
  return result.rows;
}

export async function loadPramanDataset(options = {}) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      await loadDatasetManifest();
      const parseWarnings = [];
      const entries = await Promise.all(
        Object.entries(TABLE_DEFINITIONS).map(async ([tableKey, definition]) => [
          tableKey,
          await fetchTable(tableKey, definition, parseWarnings),
        ])
      );

      const tables = Object.fromEntries(entries);
      const model = buildPramanDataModel(tables);
      const validationIssues = validatePramanDataModel(model);
      model.parseWarnings = parseWarnings;
      model.validationIssues = validationIssues;

      const shouldValidate = options.validate ?? (import.meta.env?.DEV === true);
      if (shouldValidate) {
        for (const warning of parseWarnings) console.warn(`[PRAMAN CSV parser] ${warning}`);
        reportValidationIssues(validationIssues, console);
      }
      return model;
    })();
  }
  return runtimePromise;
}

export function clearPramanDatasetCache() {
  runtimePromise = undefined;
  manifestPromise = undefined;
}
