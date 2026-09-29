import fs from 'node:fs/promises';
import path from 'node:path';
import { TABLE_FILES } from '../src/evidence-graph/data/constants.mjs';
import { parseCsv } from '../src/evidence-graph/data/csv.mjs';
import { createEvidenceGraphDataLayer } from '../src/evidence-graph/data/dataLayer.mjs';

export async function loadEvidenceGraphDataLayerFromDirectory(datasetRoot, { strict = false } = {}) {
  const entries = [];
  for (const [key, relativePath] of Object.entries(TABLE_FILES)) {
    const file = path.join(datasetRoot, ...relativePath.split('/'));
    try { entries.push([key, parseCsv(await fs.readFile(file, 'utf8'))]); }
    catch (error) {
      if (key === 'conflictRejectedProvenance' && error?.code === 'ENOENT') entries.push([key, []]);
      else throw error;
    }
  }
  return createEvidenceGraphDataLayer(Object.fromEntries(entries), { strict });
}
