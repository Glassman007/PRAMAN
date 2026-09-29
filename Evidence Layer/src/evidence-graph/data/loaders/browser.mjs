import { TABLE_FILES } from '../constants.mjs';
import { parseCsv } from '../csv.mjs';
import { createEvidenceGraphDataLayer } from '../dataLayer.mjs';

function joinUrl(baseUrl, relative) {
  return `${String(baseUrl).replace(/\/$/, '')}/${relative.split('/').map(encodeURIComponent).join('/')}`;
}

export async function loadEvidenceGraphDataLayer({ baseUrl = '/PRAMAN_DATA', fetchImpl = globalThis.fetch, strict = false } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable; provide fetchImpl');
  const entries = await Promise.all(Object.entries(TABLE_FILES).map(async ([key, relativePath]) => {
    const response = await fetchImpl(joinUrl(baseUrl, relativePath));
    if (!response.ok) {
      if (key === 'conflictRejectedProvenance' && response.status === 404) return [key, []];
      throw new Error(`Failed to load ${relativePath}: HTTP ${response.status}`);
    }
    return [key, parseCsv(await response.text())];
  }));
  return createEvidenceGraphDataLayer(Object.fromEntries(entries), { strict });
}
